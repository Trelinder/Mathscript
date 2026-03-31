import { useState, useEffect, useRef, useCallback } from 'react'
import confetti from 'canvas-confetti'
import AnalogyOverlay from '../components/AnalogyOverlay'
import { syncPendingMilestones } from '../utils/milestoneSync'
import { playClick, playChaChing } from '../utils/SoundEngine'
import { trackEvent } from '../utils/Telemetry'

// ── Phaser reference resolution ───────────────────────────────────────────────
const GAME_WIDTH = 800
const GAME_HEIGHT = 450

// ── How many floors appear on screen at once ──────────────────────────────────
const FLOORS_VISIBLE = 4

// ── Milestone levels: at each threshold, the floor earns a ×2 CPS boost ──────
const MILESTONE_LEVELS = [25, 50, 100, 200, 300, 400, 500]

// ── Hero-themed department catalogue ─────────────────────────────────────────
// Economy: baseCost×1.15^level cost curve; cpsBoost per upgrade level.
// Milestone multiplier: +1× per milestone cleared (level 25 → 2×, 50 → 3×, …)
// Floor payback at level 1 ≈ baseCost / cpsBoost seconds — designed to stretch
// engagement loop from 30 seconds (Arcanos) to ~22 minutes (Shadow).
const TYCOON_FLOORS = [
  {
    id: 'spell-lab',
    name: "Arcanos' Spell Lab",
    shortName: 'SPELL LAB',
    desc: 'Formula Casting',
    hero: 'Arcanos',
    emoji: '🧙‍♂️',
    color: '#a855f7',
    glow: 'rgba(168,85,247,0.28)',
    bg: 'rgba(168,85,247,0.07)',
    baseCost: 15,
    cpsBoost: 0.1,
    costScale: 1.15,
  },
  {
    id: 'battle-dojo',
    name: "Blaze's Battle Dojo",
    shortName: 'BATTLE DOJO',
    desc: 'Combat Equations',
    hero: 'Blaze',
    emoji: '🔥',
    color: '#f97316',
    glow: 'rgba(249,115,22,0.28)',
    bg: 'rgba(249,115,22,0.07)',
    baseCost: 100,
    cpsBoost: 0.5,
    costScale: 1.15,
  },
  {
    id: 'moon-studio',
    name: "Luna's Moon Studio",
    shortName: 'MOON STUDIO',
    desc: 'Visual Geometry',
    hero: 'Luna',
    emoji: '🌙',
    color: '#ec4899',
    glow: 'rgba(236,72,153,0.28)',
    bg: 'rgba(236,72,153,0.07)',
    baseCost: 1100,
    cpsBoost: 4,
    costScale: 1.15,
  },
  {
    id: 'speed-desk',
    name: "Zenith's Speed Desk",
    shortName: 'SPEED DESK',
    desc: 'Quick Calculations',
    hero: 'Zenith',
    emoji: '⚡',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.28)',
    bg: 'rgba(245,158,11,0.07)',
    baseCost: 12000,
    cpsBoost: 30,
    costScale: 1.15,
  },
  {
    id: 'power-core',
    name: "Titan's Power Core",
    shortName: 'POWER CORE',
    desc: 'Heavy Algebra',
    hero: 'Titan',
    emoji: '💪',
    color: '#22c55e',
    glow: 'rgba(34,197,94,0.28)',
    bg: 'rgba(34,197,94,0.07)',
    baseCost: 130000,
    cpsBoost: 200,
    costScale: 1.15,
  },
  {
    id: 'storm-lab',
    name: "Tempest's Storm Lab",
    shortName: 'STORM LAB',
    desc: 'Advanced Physics',
    hero: 'Tempest',
    emoji: '🌪️',
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.28)',
    bg: 'rgba(59,130,246,0.07)',
    baseCost: 1400000,
    cpsBoost: 1500,
    costScale: 1.15,
  },
  {
    id: 'shadow-den',
    name: "Shadow's Code Den",
    shortName: 'CODE DEN',
    desc: 'Logic & Proofs',
    hero: 'Shadow',
    emoji: '🥷',
    color: '#00c8ff',
    glow: 'rgba(0,200,255,0.28)',
    bg: 'rgba(0,200,255,0.07)',
    baseCost: 20000000,
    cpsBoost: 15000,
    costScale: 1.15,
  },
]

// ── Economy helpers ───────────────────────────────────────────────────────────
function getMilestoneMultiplier(level) {
  return 1 + MILESTONE_LEVELS.filter(ml => level >= ml).length
}
function getFloorCPS(def, level) {
  if (level === 0) return 0
  return level * def.cpsBoost * getMilestoneMultiplier(level)
}
function getLevelCost(def, level) {
  return Math.ceil(def.baseCost * Math.pow(def.costScale, level))
}
// Cost to buy `qty` upgrades in one shot starting from `startLevel`
function getBulkCost(def, startLevel, qty) {
  const s = def.costScale
  return Math.ceil(def.baseCost * Math.pow(s, startLevel) * (Math.pow(s, qty) - 1) / (s - 1))
}
// How many upgrades the player can afford right now
function getMaxQty(def, startLevel, budget) {
  let qty = 0
  let total = 0
  for (let i = 0; i < 10000; i++) {
    const next = getLevelCost(def, startLevel + i)
    if (total + next > budget) break
    total += next
    qty++
  }
  return { qty, cost: total }
}
function fmtNum(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(1).replace(/\.0$/, '')  + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(1).replace(/\.0$/, '')  + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1).replace(/\.0$/, '')  + 'K'
  return Math.floor(n).toString()
}
function fmtCps(n) {
  if (n < 0.01) return '0'
  if (n < 10)   return n.toFixed(2)
  return fmtNum(n)
}
function computeCanvasSize() {
  const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT)
  return { width: Math.floor(GAME_WIDTH * scale), height: Math.floor(GAME_HEIGHT * scale) }
}
function initFloorStates() {
  try {
    const saved = JSON.parse(localStorage.getItem('mst_floors_v2') || 'null')
    if (Array.isArray(saved) && saved.length === TYCOON_FLOORS.length) {
      return TYCOON_FLOORS.map((def, i) => ({
        level: saved[i]?.level ?? 0,
        currentCost: saved[i]?.currentCost ?? def.baseCost,
      }))
    }
  } catch { /* ignore */ }
  return TYCOON_FLOORS.map(def => ({ level: 0, currentCost: def.baseCost }))
}
// Workers shown on a floor scales with log of level (1→4 max)
function workerCount(level) {
  if (level === 0) return 0
  return Math.min(1 + Math.floor(Math.log(level + 1) / Math.log(5)), 4)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GamePlayerPage({ onAnalogyMilestone, sessionId }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)

  // Drain any offline-queued milestones from previous sessions
  useEffect(() => { syncPendingMilestones() }, [])

  // ── Analogy overlay ────────────────────────────────────────────────────────
  const [overlayConceptId, setOverlayConceptId] = useState(null)
  const [overlayVisible, setOverlayVisible] = useState(false)

  // ── Game screen state ──────────────────────────────────────────────────────
  const [gameState, setGameState] = useState('title') // 'title' | 'playing'

  // ── Economy state ──────────────────────────────────────────────────────────
  const [currency, setCurrency] = useState(() => {
    try { return parseFloat(localStorage.getItem('mst_coins_v2') || '0') || 0 } catch { return 0 }
  })
  const [lifetimeCoins, setLifetimeCoins] = useState(() => {
    try { return parseFloat(localStorage.getItem('mst_lifetime_v2') || '0') || 0 } catch { return 0 }
  })
  const [cps, setCps] = useState(0)
  const [floorStates, setFloorStates] = useState(initFloorStates)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [scrollOffset, setScrollOffset] = useState(0)
  const [selectedFloorIdx, setSelectedFloorIdx] = useState(null)
  const [buyQty, setBuyQty] = useState('1')
  const [floatingNums, setFloatingNums] = useState([])
  const [showStats, setShowStats] = useState(false)

  // ── Recompute total CPS whenever floor states change ───────────────────────
  useEffect(() => {
    const total = floorStates.reduce((sum, fs, i) => {
      const def = TYCOON_FLOORS[i]
      return sum + getFloorCPS(def, fs.level)
    }, 0)
    setCps(total)
  }, [floorStates])

  // ── Passive income tick (1 s) ──────────────────────────────────────────────
  useEffect(() => {
    if (cps <= 0) return
    const id = setInterval(() => {
      setCurrency(c => parseFloat((c + cps).toFixed(2)))
      setLifetimeCoins(lc => parseFloat((lc + cps).toFixed(2)))
    }, 1000)
    return () => clearInterval(id)
  }, [cps])

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('mst_coins_v2', String(currency)) } catch {}
  }, [currency])
  useEffect(() => {
    try {
      localStorage.setItem('mst_floors_v2', JSON.stringify(
        floorStates.map(fs => ({ level: fs.level, currentCost: fs.currentCost }))
      ))
    } catch {}
  }, [floorStates])
  useEffect(() => {
    try { localStorage.setItem('mst_lifetime_v2', String(lifetimeCoins)) } catch {}
  }, [lifetimeCoins])

  // ── Manual tap: earns max(1, 0.5% of CPS) coins ───────────────────────────
  const handleManualTap = useCallback((e) => {
    const bonus = Math.max(1, Math.ceil(cps * 0.005))
    setCurrency(c => parseFloat((c + bonus).toFixed(2)))
    setLifetimeCoins(lc => parseFloat((lc + bonus).toFixed(2)))
    playClick()
    if (e) {
      const id = Date.now() + Math.random()
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? window.innerWidth / 2
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? window.innerHeight / 2
      setFloatingNums(prev => [...prev, { id, x, y, val: bonus }])
      setTimeout(() => setFloatingNums(prev => prev.filter(n => n.id !== id)), 900)
    }
  }, [cps])

  // ── Buy floor upgrades ─────────────────────────────────────────────────────
  const handleBuyFloor = useCallback((idx, qty, cost) => {
    if (cost <= 0 || qty <= 0 || currency < cost) return
    const def = TYCOON_FLOORS[idx]
    setCurrency(c => parseFloat((c - cost).toFixed(2)))
    setFloorStates(prev => prev.map((fs, i) => {
      if (i !== idx) return fs
      const newLevel = fs.level + qty
      return { level: newLevel, currentCost: getLevelCost(def, newLevel) }
    }))
    playChaChing()
    trackEvent('tycoon_purchase', { floor: def?.name, qty, cost })
    confetti({
      particleCount: Math.min(50 + qty * 3, 180),
      spread: 60,
      origin: { x: 0.5, y: 0.5 },
      colors: [def?.color ?? '#00c8ff', '#fbbf24', '#a855f7', '#22c55e'],
      ticks: 140,
    })
  }, [currency])

  // ── Phaser: milestone bridge ───────────────────────────────────────────────
  const milestoneCallbackRef = useRef(onAnalogyMilestone)
  useEffect(() => { milestoneCallbackRef.current = onAnalogyMilestone }, [onAnalogyMilestone])

  const handleMilestone = useCallback((data) => {
    setOverlayConceptId(data?.conceptId ?? null)
    setOverlayVisible(true)
    milestoneCallbackRef.current?.(data)
  }, [])

  const handleOverlayComplete = useCallback(() => {
    setOverlayVisible(false)
    // Bonus coins for completing a math puzzle
    const bonus = Math.max(50, Math.ceil(cps * 10))
    setCurrency(c => parseFloat((c + bonus).toFixed(2)))
    setLifetimeCoins(lc => parseFloat((lc + bonus).toFixed(2)))
    if (gameRef.current) gameRef.current.scene.resume('PlayScene')
  }, [cps])

  // ── Phaser canvas resize + boot ────────────────────────────────────────────
  const handleResize = useCallback(() => {
    if (!containerRef.current) return
    const { width, height } = computeCanvasSize()
    containerRef.current.style.width = `${width}px`
    containerRef.current.style.height = `${height}px`
    if (gameRef.current) gameRef.current.scale.resize(width, height)
  }, [])

  useEffect(() => {
    handleResize()
    let cancelled = false
    Promise.all([
      import('phaser'),
      import('../game/BootScene'),
      import('../game/PreloadScene'),
      import('../game/PlayScene'),
    ]).then(([mod, { default: BootScene }, { default: PreloadScene }, { default: PlayScene }]) => {
      if (cancelled || !containerRef.current) return
      const Phaser = mod
      const { width, height } = computeCanvasSize()
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: 'phaser-game-container',
        backgroundColor: '#0a0e1a',
        scale: { mode: Phaser.Scale.NONE },
        scene: [BootScene, PreloadScene, PlayScene],
      })
      gameRef.current = game
      game.registry.set('onAnalogyMilestone', (data) => handleMilestone(data))
    })
    window.addEventListener('resize', handleResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null }
    }
  }, [handleResize, handleMilestone])

  // ── Derived popup values ───────────────────────────────────────────────────
  const selFloor = selectedFloorIdx !== null ? floorStates[selectedFloorIdx] : null
  const selDef   = selectedFloorIdx !== null ? TYCOON_FLOORS[selectedFloorIdx] : null

  let popupQty = 0, popupCost = 0
  if (selFloor && selDef) {
    if (buyQty === '1') {
      popupQty = 1
      popupCost = selFloor.currentCost
    } else if (buyQty === '10') {
      popupQty = 10
      popupCost = getBulkCost(selDef, selFloor.level, 10)
    } else if (buyQty === '50') {
      popupQty = 50
      popupCost = getBulkCost(selDef, selFloor.level, 50)
    } else {
      const m = getMaxQty(selDef, selFloor.level, currency)
      popupQty = m.qty
      popupCost = m.cost
    }
  }

  const canScrollUp   = scrollOffset > 0
  const canScrollDown = scrollOffset + FLOORS_VISIBLE < TYCOON_FLOORS.length
  const visibleDefs   = TYCOON_FLOORS.slice(scrollOffset, scrollOffset + FLOORS_VISIBLE)
  const visibleStates = floorStates.slice(scrollOffset, scrollOffset + FLOORS_VISIBLE)

  // ── Shared CSS animations (injected once) ─────────────────────────────────
  const CSS = `
    @keyframes mst-float-up  { 0%{opacity:1;transform:translateY(0) scale(1)} 60%{opacity:.9;transform:translateY(-42px) scale(1.2)} 100%{opacity:0;transform:translateY(-80px) scale(.8)} }
    @keyframes mst-walk      { 0%,100%{transform:translateX(0) scaleX(1)} 40%{transform:translateX(32px) scaleX(1)} 50%{transform:translateX(32px) scaleX(-1)} 90%{transform:translateX(0) scaleX(-1)} }
    @keyframes mst-walk2     { 0%,100%{transform:translateX(0) scaleX(-1)} 40%{transform:translateX(-32px) scaleX(-1)} 50%{transform:translateX(-32px) scaleX(1)} 90%{transform:translateX(0) scaleX(1)} }
    @keyframes mst-pulse     { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.85;transform:scale(1.04)} }
    @keyframes mst-orbit     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
    @keyframes mst-orbit-rev { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
    @keyframes mst-glow-cyan { 0%,100%{text-shadow:0 0 18px rgba(0,200,255,.5)} 50%{text-shadow:0 0 36px rgba(0,200,255,1),0 0 60px rgba(0,200,255,.4)} }
    @keyframes mst-float-hero{ 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
    @keyframes mst-coin-spin { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(.25)} }
    @keyframes mst-bar-fill  { from{width:0} to{width:var(--bar-w,50%)} }
    .walk-a { animation: mst-walk  3.8s ease-in-out infinite; display:inline-block }
    .walk-b { animation: mst-walk2 4.5s ease-in-out infinite .8s; display:inline-block }
    .walk-c { animation: mst-walk  3.2s ease-in-out infinite 1.4s; display:inline-block }
    .walk-d { animation: mst-walk2 5.0s ease-in-out infinite .3s; display:inline-block }
    .mst-float-num { position:fixed; pointer-events:none; font-family:'Orbitron',monospace; font-size:18px; font-weight:800; color:#fbbf24; text-shadow:0 0 8px rgba(251,191,36,.8); z-index:9999; animation:mst-float-up .9s ease-out forwards; user-select:none }
  `

  // ═══════════════════════════════════════════════════════════════════════════
  // TITLE SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (gameState === 'title') {
    const ORBIT_HEROES = ['🔥', '🌙', '⚡', '💪', '🌪️', '🥷', '🕸️']
    return (
      <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 15%, #111b38 0%, #0a0e1a 65%)', overflow:'hidden' }}>
        <style>{CSS}</style>

        {/* Subtle grid overlay */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(0,200,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.03) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />

        {/* Orbiting ring */}
        <div style={{ position:'absolute', width:320, height:320, animation:'mst-orbit 22s linear infinite', pointerEvents:'none' }}>
          {ORBIT_HEROES.map((em, i) => {
            const angle = (i / ORBIT_HEROES.length) * 2 * Math.PI
            const x = 160 + 145 * Math.cos(angle) - 16
            const y = 160 + 145 * Math.sin(angle) - 16
            return (
              <div key={i} style={{ position:'absolute', left:x, top:y, fontSize:26, filter:'drop-shadow(0 0 6px rgba(0,200,255,.55))', animation:'mst-orbit-rev 22s linear infinite' }}>
                {em}
              </div>
            )
          })}
        </div>

        {/* Ring border glow */}
        <div style={{ position:'absolute', width:310, height:310, borderRadius:'50%', border:'2px solid rgba(0,200,255,0.18)', boxShadow:'0 0 30px rgba(0,200,255,0.08) inset', pointerEvents:'none' }} />

        {/* Center hero */}
        <div style={{ fontSize:88, animation:'mst-float-hero 3s ease-in-out infinite', zIndex:10, marginBottom:6, filter:'drop-shadow(0 0 24px rgba(168,85,247,.7))' }}>🧙‍♂️</div>

        {/* Title */}
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(18px,4.5vw,28px)', fontWeight:900, color:'#00c8ff', letterSpacing:'3px', animation:'mst-glow-cyan 2.5s ease-in-out infinite', zIndex:10, textAlign:'center', marginBottom:2 }}>
          MATH SCRIPT
        </div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(28px,7vw,48px)', fontWeight:900, color:'#fbbf24', letterSpacing:'5px', textShadow:'0 0 24px rgba(251,191,36,.7)', zIndex:10, textAlign:'center', marginBottom:6 }}>
          TYCOON
        </div>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:'#4b8fa8', letterSpacing:'4px', textTransform:'uppercase', zIndex:10, marginBottom:36 }}>
          BUILD YOUR ACADEMY · MASTER ALL MATH
        </div>

        {/* PLAY button */}
        <button
          onClick={() => { playClick(); setGameState('playing') }}
          style={{ padding:'16px 64px', background:'linear-gradient(135deg,#f59e0b 0%,#fbbf24 100%)', border:'none', borderRadius:12, color:'#0a0e1a', fontFamily:"'Orbitron',monospace", fontSize:20, fontWeight:900, letterSpacing:'3px', cursor:'pointer', zIndex:10, boxShadow:'0 0 32px rgba(251,191,36,.55), 0 4px 20px rgba(0,0,0,.4)', animation:'mst-pulse 2s ease-in-out infinite', transition:'transform .15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >PLAY</button>

        {/* Saved progress indicator */}
        {lifetimeCoins > 0 && (
          <div style={{ position:'absolute', bottom:24, fontFamily:"'Rajdhani',sans-serif", fontSize:12, color:'#4b5563', letterSpacing:'1px' }}>
            📖 SAVED · {fmtNum(lifetimeCoins)} LIFETIME COINS
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAYING: BUILDING VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'#0a0e1a', overflow:'hidden', fontFamily:"'Rajdhani',sans-serif" }}>
      <style>{CSS}</style>

      {/* Floating +coins */}
      {floatingNums.map(n => (
        <div key={n.id} className="mst-float-num" style={{ left: n.x - 14, top: n.y - 20 }}>
          +{fmtNum(n.val)} 🪙
        </div>
      ))}

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div style={{ background:'linear-gradient(180deg,#0f1629 0%,#0a0e1a 100%)', borderBottom:'1px solid rgba(0,200,255,0.15)', padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, boxShadow:'0 2px 16px rgba(0,200,255,0.08)' }}>

        {/* Back arrow */}
        <button onClick={() => setGameState('title')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#4b8fa8', padding:'4px 8px', borderRadius:8, transition:'color .2s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#00c8ff' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#4b8fa8' }}>◀</button>

        {/* Coin display */}
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(0,200,255,0.06)', border:'1px solid rgba(0,200,255,0.18)', borderRadius:10, padding:'5px 12px' }}>
          <span style={{ fontSize:20, animation:'mst-coin-spin 2.5s ease-in-out infinite' }}>🪙</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16, fontWeight:700, color:'#fbbf24', lineHeight:1 }}>
              {fmtNum(currency)}
            </div>
            <div style={{ fontSize:10, color:'#4b8fa8', textAlign:'right', marginTop:1 }}>
              +<span style={{ color:'#22c55e' }}>{fmtCps(cps)}</span>/s
            </div>
          </div>
        </div>

        {/* Stats toggle */}
        <button onClick={() => setShowStats(s => !s)} style={{ background: showStats ? 'rgba(0,200,255,0.12)' : 'none', border:'1px solid rgba(0,200,255,0.2)', cursor:'pointer', fontSize:16, color:'#4b8fa8', padding:'6px 10px', borderRadius:8, transition:'all .2s' }}>
          📊
        </button>
      </div>

      {/* Stats drawer */}
      {showStats && (
        <div style={{ background:'rgba(15,22,42,0.97)', borderBottom:'1px solid rgba(0,200,255,0.12)', padding:'10px 16px', display:'flex', gap:24, justifyContent:'center', flexShrink:0 }}>
          {[
            ['LIFETIME COINS', fmtNum(lifetimeCoins)],
            ['COINS/SEC', fmtCps(cps)],
            ['DEPTS ACTIVE', floorStates.filter(fs => fs.level > 0).length + '/' + TYCOON_FLOORS.length],
          ].map(([label, val]) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#00c8ff' }}>{val}</div>
              <div style={{ fontSize:10, color:'#4b5563', letterSpacing:'1px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── BUILDING MIDDLE ──────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', position:'relative' }}>

        {/* Scroll arrows */}
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:10, padding:'0 8px', flexShrink:0 }}>
          {[
            { dir:'up', label:'▲', can: canScrollUp,   fn: () => setScrollOffset(o => Math.max(0, o - 1)) },
            { dir:'dn', label:'▼', can: canScrollDown, fn: () => setScrollOffset(o => Math.min(TYCOON_FLOORS.length - FLOORS_VISIBLE, o + 1)) },
          ].map(({ dir, label, can, fn }) => (
            <button key={dir} onClick={fn} disabled={!can}
              style={{ width:40, height:40, background: can ? 'rgba(0,200,255,0.12)' : 'rgba(255,255,255,0.02)', border:`1px solid ${can ? 'rgba(0,200,255,0.35)' : 'rgba(255,255,255,0.06)'}`, borderRadius:10, color: can ? '#00c8ff' : '#1e293b', fontSize:16, cursor: can ? 'pointer' : 'default', transition:'all .2s' }}
            >{label}</button>
          ))}
        </div>

        {/* Floor list */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4, overflow:'hidden', paddingRight:10, paddingTop:6, paddingBottom:6 }}>
          {visibleDefs.map((def, vi) => {
            const realIdx = scrollOffset + vi
            const fs   = visibleStates[vi]
            const locked = fs.level === 0
            const canAfford = currency >= fs.currentCost
            const workers   = workerCount(fs.level)
            const floorCPS  = getFloorCPS(def, fs.level)
            const nextML    = MILESTONE_LEVELS.find(ml => ml > fs.level) ?? null
            const mlPct     = nextML ? Math.min(100, (fs.level / nextML) * 100) : 100
            const WALK_CLASSES = ['walk-a', 'walk-b', 'walk-c', 'walk-d']

            return (
              <div key={def.id}
                onClick={() => { playClick(); setSelectedFloorIdx(realIdx) }}
                style={{ flex:1, background: locked ? 'rgba(12,18,36,0.7)' : `linear-gradient(135deg,${def.bg} 0%,rgba(10,14,26,0.92) 60%)`, border:`1px solid ${locked ? 'rgba(255,255,255,0.05)' : def.glow}`, borderLeft:`4px solid ${locked ? '#1a2035' : def.color}`, borderRadius:10, padding:'8px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all .2s', boxShadow: locked ? 'none' : `0 0 10px ${def.glow}`, overflow:'hidden', position:'relative' }}
                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)' }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}
              >
                {/* Floor number */}
                <div style={{ width:34, height:34, background: locked ? 'rgba(20,30,55,0.8)' : 'rgba(0,0,0,0.45)', border:`1px solid ${locked ? '#1a2035' : def.color}`, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color: locked ? '#1e293b' : def.color, flexShrink:0 }}>
                  {locked ? '🔒' : realIdx + 1}
                </div>

                {/* Hero workers + info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    {/* Walking workers */}
                    {locked ? (
                      <span style={{ fontSize:20, filter:'grayscale(1) opacity(.25)' }}>{def.emoji}</span>
                    ) : (
                      Array.from({ length: workers }, (_, wi) => (
                        <span key={wi} className={WALK_CLASSES[wi % 4]} style={{ fontSize:20 }}>{def.emoji}</span>
                      ))
                    )}
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color: locked ? '#1e293b' : '#e8e8f0', letterSpacing:'.5px', textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {def.shortName}
                      </div>
                      <div style={{ fontSize:10, color: locked ? '#1a2035' : '#4b8fa8' }}>{def.desc}</div>
                    </div>
                  </div>

                  {/* Milestone progress bar */}
                  {!locked && nextML && (
                    <div style={{ height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden', marginTop:2 }}>
                      <div style={{ height:'100%', background:def.color, width:`${mlPct}%`, borderRadius:2, transition:'width .6s ease', boxShadow:`0 0 4px ${def.color}` }} />
                    </div>
                  )}
                  {!locked && (
                    <div style={{ fontSize:10, color:'#4b5563', marginTop:2 }}>
                      {nextML
                        ? <><span style={{ color: def.color }}>{fs.level}</span>/{nextML} → ×{getMilestoneMultiplier(nextML)}</>
                        : <span style={{ color:'#fbbf24' }}>✦ ALL MILESTONES CLEARED</span>
                      }
                    </div>
                  )}
                </div>

                {/* Right: CPS + action */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
                  {!locked && (
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#22c55e', textAlign:'right' }}>
                      +{fmtCps(floorCPS)}/s
                    </div>
                  )}
                  {locked ? (
                    <div onClick={e => { e.stopPropagation(); if (canAfford) handleBuyFloor(realIdx, 1, fs.currentCost) }}
                      style={{ padding:'4px 10px', background: canAfford ? `linear-gradient(135deg,${def.color},rgba(0,0,0,.3))` : 'rgba(20,30,55,0.8)', border:`1px solid ${canAfford ? def.color : '#1a2035'}`, borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: canAfford ? '#fff' : '#1e293b', cursor: canAfford ? 'pointer' : 'default', textAlign:'center', lineHeight:1.5 }}>
                      UNLOCK<br />{fmtNum(fs.currentCost)}🪙
                    </div>
                  ) : (
                    <>
                      <div style={{ background:'rgba(0,0,0,.5)', border:`1px solid ${def.color}`, borderRadius:5, padding:'1px 7px', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color:def.color }}>
                        LV {fmtNum(fs.level)}
                      </div>
                      <div onClick={e => { e.stopPropagation(); if (canAfford) handleBuyFloor(realIdx, 1, fs.currentCost) }}
                        style={{ padding:'3px 9px', background: canAfford ? `linear-gradient(135deg,${def.color},rgba(0,0,0,.3))` : 'rgba(20,30,55,0.6)', border:`1px solid ${canAfford ? def.color : '#1a2035'}`, borderRadius:7, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: canAfford ? '#fff' : '#1e293b', cursor: canAfford ? 'pointer' : 'default', textAlign:'center', minWidth:52, lineHeight:1.5 }}>
                        UP<br />{fmtNum(fs.currentCost)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── BOTTOM BAR ──────────────────────────────────────────────────── */}
      <div style={{ background:'linear-gradient(0deg,#0f1629 0%,#0a0e1a 100%)', borderTop:'1px solid rgba(0,200,255,0.12)', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:'#00c8ff', letterSpacing:'2px', textShadow:'0 0 10px rgba(0,200,255,.4)' }}>
          MATH SCRIPT ACADEMY
        </div>
        <button onClick={handleManualTap}
          style={{ padding:'9px 18px', background:'linear-gradient(135deg,#7c3aed 0%,#5b21b6 100%)', border:'1px solid rgba(167,139,250,.4)', borderRadius:9, color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, cursor:'pointer', letterSpacing:'.5px', boxShadow:'0 0 14px rgba(124,58,237,.35)', transition:'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}>
          ⚡ TAP
        </button>
      </div>

      {/* ── PHASER (hidden, runs in background for milestone detection) ─── */}
      <div id="phaser-game-container" ref={containerRef}
        style={{ position:'absolute', left:'-9999px', top:'-9999px', opacity:0, pointerEvents:'none' }} />

      {/* ── FLOOR DETAIL POPUP ───────────────────────────────────────────── */}
      {selFloor && selDef && (
        <div onClick={() => setSelectedFloorIdx(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.72)', backdropFilter:'blur(7px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(135deg,#0f1629 0%,#12172a 100%)', border:`2px solid ${selDef.color}`, borderRadius:18, padding:22, width:'100%', maxWidth:360, boxShadow:`0 0 44px ${selDef.glow}`, position:'relative', maxHeight:'90vh', overflowY:'auto' }}>

            {/* Close */}
            <button onClick={() => setSelectedFloorIdx(null)}
              style={{ position:'absolute', top:12, right:12, width:28, height:28, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:13, cursor:'pointer' }}>✕</button>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:56, height:56, background:'rgba(0,0,0,.45)', border:`2px solid ${selDef.color}`, borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, boxShadow:`0 0 16px ${selDef.glow}` }}>
                {selDef.emoji}
              </div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:selDef.color, letterSpacing:'1px' }}>{selDef.shortName}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{selDef.hero} · {selDef.desc}</div>
                <div style={{ display:'inline-block', background:'rgba(0,0,0,.4)', border:`1px solid ${selDef.color}`, borderRadius:5, padding:'1px 7px', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color:selDef.color, marginTop:4 }}>
                  LEVEL {fmtNum(selFloor.level)}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ background:'rgba(0,200,255,0.04)', border:'1px solid rgba(0,200,255,0.12)', borderRadius:12, padding:'12px 14px', marginBottom:14 }}>
              {[
                ['OUTPUT NOW',    `${fmtCps(getFloorCPS(selDef, selFloor.level))}/s`,
                                  popupQty > 0 ? `→ ${fmtCps(getFloorCPS(selDef, selFloor.level + popupQty))}/s` : null],
                ['PER UPGRADE',   `+${selDef.cpsBoost}/s × ${getMilestoneMultiplier(selFloor.level)}×`, null],
                ['NEXT MILESTONE',(() => {
                  const nm = MILESTONE_LEVELS.find(ml => ml > selFloor.level)
                  return nm ? `Lv ${nm} → ×${getMilestoneMultiplier(nm)}` : '✦ MAX BONUS'
                })(), null],
              ].map(([lbl, val, next]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, fontSize:12 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600, letterSpacing:'.4px' }}>{lbl}</span>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ color:'#e8e8f0' }}>{val}</span>
                    {next && <span style={{ color:'#22c55e', fontSize:11 }}>{next}</span>}
                  </div>
                </div>
              ))}

              {/* Milestone progress */}
              {(() => {
                const nm = MILESTONE_LEVELS.find(ml => ml > selFloor.level)
                if (!nm) return null
                const pct = Math.min(100, (selFloor.level / nm) * 100)
                return (
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#4b5563', marginBottom:3 }}>
                      <span>MILESTONE PROGRESS</span>
                      <span style={{ color:selDef.color }}>{selFloor.level} / {nm}</span>
                    </div>
                    <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg,${selDef.color},#fbbf24)`, borderRadius:3, transition:'width .4s', boxShadow:`0 0 6px ${selDef.color}` }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Qty selector */}
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              {[['1','×1'],['10','×10'],['50','×50'],['max','MAX']].map(([val, lbl]) => (
                <button key={val} onClick={() => setBuyQty(val)}
                  style={{ flex:1, padding:'8px 2px', background: buyQty === val ? selDef.color : 'rgba(15,22,42,0.8)', border:`1px solid ${buyQty === val ? selDef.color : 'rgba(255,255,255,0.08)'}`, borderRadius:8, color: buyQty === val ? '#0a0e1a' : '#64748b', fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, cursor:'pointer', transition:'all .15s' }}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Cost hint */}
            <div style={{ textAlign:'center', marginBottom:10, fontSize:12, color:'#4b8fa8', minHeight:18 }}>
              {popupQty > 0
                ? <>Buy <span style={{ color:selDef.color, fontWeight:700 }}>×{fmtNum(popupQty)}</span> for <span style={{ color:'#fbbf24' }}>{fmtNum(popupCost)} 🪙</span></>
                : <span style={{ color:'#334155' }}>Not enough coins</span>
              }
            </div>

            {/* Upgrade button */}
            <button
              disabled={popupQty === 0 || currency < popupCost}
              onClick={() => { if (popupQty > 0 && currency >= popupCost) handleBuyFloor(selectedFloorIdx, popupQty, popupCost) }}
              style={{ width:'100%', padding:'13px', background:(popupQty > 0 && currency >= popupCost) ? `linear-gradient(135deg,${selDef.color} 0%,rgba(0,0,0,.25) 100%)` : 'rgba(20,30,55,.6)', border:`1px solid ${(popupQty > 0 && currency >= popupCost) ? selDef.color : '#1a2035'}`, borderRadius:12, color:(popupQty > 0 && currency >= popupCost) ? '#fff' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, letterSpacing:'1px', cursor:(popupQty > 0 && currency >= popupCost) ? 'pointer' : 'not-allowed', boxShadow:(popupQty > 0 && currency >= popupCost) ? `0 0 20px ${selDef.glow}` : 'none', transition:'all .2s' }}>
              {selFloor.level === 0 ? 'UNLOCK DEPARTMENT' : `UPGRADE ⚡ ${fmtNum(popupCost)} 🪙`}
            </button>
          </div>
        </div>
      )}

      {/* ── ANALOGY OVERLAY (math puzzle, fires from Phaser milestone) ─── */}
      <AnalogyOverlay
        key={overlayConceptId ?? 'none'}
        conceptId={overlayConceptId}
        isVisible={overlayVisible}
        onComplete={handleOverlayComplete}
        userId={sessionId}
      />
    </div>
  )
}
