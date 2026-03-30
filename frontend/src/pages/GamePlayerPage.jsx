import { useState, useEffect, useRef, useCallback } from 'react'
import confetti from 'canvas-confetti'
import AnalogyOverlay from '../components/AnalogyOverlay'
import { syncPendingMilestones } from '../utils/milestoneSync'
import { playClick, playChaChing } from '../utils/SoundEngine'
import { trackEvent } from '../utils/Telemetry'

// Reference resolution for the 16:9 game canvas
const GAME_WIDTH = 800
const GAME_HEIGHT = 450

// ── Tycoon upgrade catalogue ──────────────────────────────────────────────────
// These are the React-layer idle upgrades that sit above the Phaser game.
const TYCOON_UPGRADES = [
  { id: 'basic-algo',    name: 'Basic Algorithm',  emoji: '⚙️',  baseCost: 10,  cpsBoost: 0.5  },
  { id: 'data-miner',   name: 'Data Miner',        emoji: '⛏️',  baseCost: 75,  cpsBoost: 2.0  },
  { id: 'quantum-proc', name: 'Quantum Processor', emoji: '⚛️',  baseCost: 500, cpsBoost: 10.0 },
]

function initUpgrades() {
  try {
    const saved = JSON.parse(localStorage.getItem('mst_upgrades') || 'null')
    if (Array.isArray(saved) && saved.length === TYCOON_UPGRADES.length) return saved
  } catch { /* ignore */ }
  return TYCOON_UPGRADES.map(u => ({ ...u, level: 0, currentCost: u.baseCost }))
}

function computeCanvasSize() {
  const scaleX = window.innerWidth / GAME_WIDTH
  const scaleY = window.innerHeight / GAME_HEIGHT
  const scale = Math.min(scaleX, scaleY)
  return {
    width: Math.floor(GAME_WIDTH * scale),
    height: Math.floor(GAME_HEIGHT * scale),
  }
}

export default function GamePlayerPage({ onAnalogyMilestone, sessionId }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)

  // ── Drain any offline-queued milestones from previous sessions ───────────
  useEffect(() => {
    syncPendingMilestones()
  }, [])

  // ── Analogy overlay state ─────────────────────────────────────────────────
  const [overlayConceptId, setOverlayConceptId] = useState(null)
  const [overlayVisible, setOverlayVisible] = useState(false)

  // ── Tycoon React state ────────────────────────────────────────────────────
  // Phase 1: State & Storage Hookup
  const [currency, setCurrency] = useState(() => {
    try { return parseFloat(localStorage.getItem('mst_coins') || '0') || 0 } catch { return 0 }
  })
  const [currencyPerSecond, setCurrencyPerSecond] = useState(0)
  const [upgrades, setUpgrades] = useState(initUpgrades)
  // Juice — floating +1 numbers spawned by manual generate
  const [floatingNums, setFloatingNums] = useState([])

  // Sync CPS whenever upgrades change
  useEffect(() => {
    setCurrencyPerSecond(upgrades.reduce((sum, u) => sum + u.level * u.cpsBoost, 0))
  }, [upgrades])

  // Phase 2: Game Loop — passive income tick every 1 second
  useEffect(() => {
    if (currencyPerSecond <= 0) return
    const id = setInterval(() => {
      setCurrency(c => parseFloat((c + currencyPerSecond).toFixed(2)))
    }, 1000)
    return () => clearInterval(id)
  }, [currencyPerSecond])

  // Persist currency to localStorage whenever it changes
  useEffect(() => {
    try { localStorage.setItem('mst_coins', String(currency)) } catch { /* ignore */ }
  }, [currency])

  // Persist upgrades to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem('mst_upgrades', JSON.stringify(upgrades)) } catch { /* ignore */ }
  }, [upgrades])

  // Manual generate: earn 1 currency immediately + spawn floating +1
  const handleManualGenerate = useCallback((e) => {
    setCurrency(c => parseFloat((c + 1).toFixed(2)))
    playClick()
    if (e) {
      const id = Date.now() + Math.random()
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0
      setFloatingNums(prev => [...prev, { id, x, y }])
      setTimeout(() => setFloatingNums(prev => prev.filter(n => n.id !== id)), 900)
    }
  }, [])

  // Buy an upgrade: deduct cost, increment level, scale next cost by ×1.5
  const handleBuyUpgrade = useCallback((idx) => {
    setUpgrades(prev => {
      const upg = prev[idx]
      if (currency < upg.currentCost) return prev
      setCurrency(c => parseFloat((c - upg.currentCost).toFixed(2)))
      // Juice — cha-ching sound + confetti burst
      playChaChing()
      trackEvent('tycoon_purchase', { upgrade_name: upg.name, cost: upg.currentCost })
      confetti({
        particleCount: 80,
        spread: 55,
        origin: { x: 0.1, y: 0.9 },
        colors: ['#7c3aed', '#fbbf24', '#4ade80', '#60a5fa'],
        ticks: 180,
      })
      return prev.map((u, i) =>
        i !== idx ? u : {
          ...u,
          level: u.level + 1,
          currentCost: Math.floor(u.baseCost * Math.pow(1.5, u.level + 1)),
        }
      )
    })
  }, [currency])

  // Keep the milestone callback in a ref so the Phaser scene always calls the
  // latest version without needing to destroy and recreate the game.
  const milestoneCallbackRef = useRef(onAnalogyMilestone)
  useEffect(() => {
    milestoneCallbackRef.current = onAnalogyMilestone
  }, [onAnalogyMilestone])

  // ── Called by Phaser when an Analogy Milestone fires ─────────────────────
  // Shows the overlay; Phaser has already paused itself (PlayScene._fireMilestone).
  const handleMilestone = useCallback((data) => {
    setOverlayConceptId(data?.conceptId ?? null)
    setOverlayVisible(true)
    // Also notify any external listener (e.g. App.jsx analytics)
    milestoneCallbackRef.current?.(data)
  }, [])

  // ── Called by AnalogyOverlay once the child solves the puzzle ─────────────
  // Hides the overlay and resumes the paused Phaser scene.
  const handleOverlayComplete = useCallback(() => {
    setOverlayVisible(false)
    // Resume PlayScene — it was paused by _fireMilestone before the event fired
    if (gameRef.current) {
      gameRef.current.scene.resume('PlayScene')
    }
  }, [])

  const handleResize = useCallback(() => {
    if (!containerRef.current) return
    const { width, height } = computeCanvasSize()
    containerRef.current.style.width = `${width}px`
    containerRef.current.style.height = `${height}px`
    if (gameRef.current) {
      gameRef.current.scale.resize(width, height)
    }
  }, [])

  useEffect(() => {
    // Size the container immediately before Phaser renders into it
    handleResize()

    let cancelled = false

    // Dynamic imports keep Phaser and the game scenes out of the main bundle
    Promise.all([
      import('phaser'),
      import('../game/BootScene'),
      import('../game/PreloadScene'),
      import('../game/PlayScene'),
    ]).then(([mod, { default: BootScene }, { default: PreloadScene }, { default: PlayScene }]) => {
      if (cancelled || !containerRef.current) return

      const Phaser = mod
      const { width, height } = computeCanvasSize()

      const config = {
        type: Phaser.AUTO,
        width,
        height,
        parent: 'phaser-game-container',
        backgroundColor: '#0a0e1a',
        scale: {
          // React owns the container size; we handle resize manually above
          mode: Phaser.Scale.NONE,
        },
        // ── Three-scene pipeline ──────────────────────────────────────────
        // BootScene  → PreloadScene (loading bar + texture generation)
        //           → PlayScene    (idle tycoon gameplay)
        scene: [BootScene, PreloadScene, PlayScene],
      }

      const game = new Phaser.Game(config)
      gameRef.current = game

      // ── React-to-Phaser bridge ────────────────────────────────────────────
      // Store the milestone callback in the game registry so any scene can
      // fire it with:  this.registry.get('onAnalogyMilestone')?.({ conceptId })
      game.registry.set('onAnalogyMilestone', (data) => {
        handleMilestone(data)
      })
    })

    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [handleResize, handleMilestone])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0e1a',
        overflow: 'hidden',
      }}
    >
      {/* ── Juice: floating number CSS ── */}
      <style>{`
        @keyframes mst-float-up {
          0%   { opacity: 1;   transform: translateY(0)     scale(1);    }
          60%  { opacity: 0.9; transform: translateY(-38px) scale(1.15); }
          100% { opacity: 0;   transform: translateY(-70px) scale(0.85); }
        }
        .mst-float-num {
          position: fixed;
          pointer-events: none;
          font-family: 'Orbitron', monospace;
          font-size: 18px;
          font-weight: 800;
          color: #fbbf24;
          text-shadow: 0 0 8px rgba(251,191,36,0.7);
          z-index: 9999;
          animation: mst-float-up 0.9s ease-out forwards;
          user-select: none;
        }
      `}</style>

      {/* Floating +1 numbers layer */}
      {floatingNums.map(n => (
        <div
          key={n.id}
          className="mst-float-num"
          style={{ left: n.x - 12, top: n.y - 16 }}
        >
          +1
        </div>
      ))}
      <div
        id="phaser-game-container"
        ref={containerRef}
        style={{
          background: '#0a0e1a',
          position: 'relative',
          overflow: 'hidden',
        }}
      />

      {/* ── Analogy Overlay ──────────────────────────────────────────────────
          Rendered outside the Phaser container so it can cover the full
          viewport with its own fixed positioning and z-index.
          key={overlayConceptId} remounts the component for each new concept,
          automatically resetting all interaction state.                      */}
      <AnalogyOverlay
        key={overlayConceptId ?? 'none'}
        conceptId={overlayConceptId}
        isVisible={overlayVisible}
        onComplete={handleOverlayComplete}
        userId={sessionId}
      />

      {/* ── Phase 3: Tycoon Dashboard Overlay ────────────────────────────────
          Neon dark-mode panel sitting above the Phaser canvas.
          Tracks React-layer currency, CPS, and the Upgrades Market.        */}
      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 200,
          background: 'rgba(10,14,26,0.90)',
          border: '1px solid rgba(124,58,237,0.40)',
          borderRadius: '14px',
          backdropFilter: 'blur(12px)',
          padding: '14px 16px',
          minWidth: '220px',
          maxWidth: '252px',
          fontFamily: "'Rajdhani', sans-serif",
          boxShadow: '0 0 28px rgba(124,58,237,0.22), inset 0 0 0 1px rgba(167,139,250,0.06)',
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          fontFamily: "'Orbitron', monospace",
          fontSize: '10px',
          color: '#7c3aed',
          letterSpacing: '1.5px',
          textAlign: 'center',
          marginBottom: '10px',
          textTransform: 'uppercase',
        }}>
          ⚡ Tycoon Engine
        </div>

        {/* Currency display */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <div style={{
            fontFamily: "'Orbitron', monospace",
            fontSize: '22px',
            color: '#fbbf24',
            fontWeight: 700,
            lineHeight: 1.1,
          }}>
            🪙 {Math.floor(currency).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px' }}>
            <span style={{ color: '#4ade80' }}>+{currencyPerSecond.toFixed(1)}</span>
            <span style={{ color: '#475569' }}> / sec</span>
          </div>
        </div>

        {/* Manual Generate button */}
        <button
          onClick={handleManualGenerate}
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: '12px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
            border: '1px solid rgba(167,139,250,0.35)',
            borderRadius: '8px',
            color: '#e2e8f0',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.5px',
            transition: 'filter 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.18)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
        >
          ⚡ GENERATE <span style={{ color: '#fbbf24' }}>+1</span>
        </button>

        {/* Upgrades Market */}
        <div style={{
          fontSize: '9px',
          color: '#475569',
          letterSpacing: '1.5px',
          textAlign: 'center',
          marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          ── Upgrades Market ──
        </div>

        {upgrades.map((upg, idx) => {
          const canAfford = currency >= upg.currentCost
          return (
            <div
              key={upg.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: idx < upgrades.length - 1 ? '6px' : 0,
                padding: '7px 10px',
                background: 'rgba(15,23,42,0.75)',
                borderRadius: '9px',
                border: `1px solid ${canAfford ? 'rgba(124,58,237,0.45)' : 'rgba(51,65,85,0.5)'}`,
                transition: 'border-color 0.2s',
              }}
            >
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: canAfford ? '#e2e8f0' : '#475569',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {upg.emoji} {upg.name}
                  <span style={{ color: '#7c3aed', fontWeight: 400, fontSize: '10px', marginLeft: '4px' }}>
                    Lv.{upg.level}
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>
                  +{upg.cpsBoost}/s · <span style={{ color: canAfford ? '#fbbf24' : '#475569' }}>
                    {upg.currentCost.toLocaleString()} 🪙
                  </span>
                </div>
              </div>

              {/* Buy button */}
              <button
                onClick={() => { playClick(); handleBuyUpgrade(idx) }}
                disabled={!canAfford}
                style={{
                  flexShrink: 0,
                  padding: '5px 10px',
                  background: canAfford
                    ? 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                    : 'rgba(30,41,59,0.8)',
                  border: 'none',
                  borderRadius: '6px',
                  color: canAfford ? '#e2e8f0' : '#334155',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: "'Rajdhani', sans-serif",
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  letterSpacing: '0.5px',
                  transition: 'filter 0.15s',
                }}
                onMouseEnter={e => { if (canAfford) e.currentTarget.style.filter = 'brightness(1.2)' }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
              >
                BUY
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
