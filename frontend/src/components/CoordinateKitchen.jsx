import { useState, useCallback, useEffect, useRef } from 'react'

/* ─── Web Audio sound engine (zero external dependencies) ────────────────── */
// Creates and immediately plays a short sound, then disposes the AudioContext.

/** Pleasant ascending 2-note chime — played on a correct coordinate hit. */
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime

    // Note 1: E5 (659 Hz) — bright, short chime
    const o1 = ctx.createOscillator()
    const g1 = ctx.createGain()
    o1.connect(g1); g1.connect(ctx.destination)
    o1.type = 'sine'
    o1.frequency.setValueAtTime(659, now)
    g1.gain.setValueAtTime(0, now)
    g1.gain.linearRampToValueAtTime(0.35, now + 0.012)
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    o1.start(now); o1.stop(now + 0.35)

    // Note 2: B5 (988 Hz) — higher note, enters just after
    const o2 = ctx.createOscillator()
    const g2 = ctx.createGain()
    o2.connect(g2); g2.connect(ctx.destination)
    o2.type = 'sine'
    o2.frequency.setValueAtTime(988, now + 0.16)
    g2.gain.setValueAtTime(0, now + 0.16)
    g2.gain.linearRampToValueAtTime(0.28, now + 0.172)
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
    o2.start(now + 0.16); o2.stop(now + 0.55)

    setTimeout(() => ctx.close(), 700)
  } catch { /* AudioContext unavailable — fail silently */ }
}

/** Gentle low-pitched single "boop" — played on a wrong coordinate click. */
function playErrorSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const now = ctx.currentTime

    // Single tone that slides down from 220 Hz → 140 Hz
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(220, now)
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.28, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30)
    osc.start(now); osc.stop(now + 0.30)

    setTimeout(() => ctx.close(), 450)
  } catch { /* fail silently */ }
}

/* ─── Layout constants ────────────────────────────────────────────────────── */
const CS = 40          // cell size in px
const GN = 10          // grid dimension (10 × 10 cells)
const GW = GN * CS     // grid width  = 400 px
const GH = GN * CS     // grid height = 400 px

// Total width of the y-axis sidebar (title + labels) sitting left of the grid.
// Y-title: 20 px | gap: 4 px | Y-labels: 22 px | gap: 6 px  → 52 px
const Y_SIDEBAR = 52

/* ─── Game data ───────────────────────────────────────────────────────────── */
const LEVELS = [
  {
    name:   'Level 1: Sandwich Run',
    title:  'The Secret Sandwich',
    quests: [
      { ingredient: 'Cheese',  emoji: '🧀', x: 5, y: 1 },
      { ingredient: 'Bread',   emoji: '🍞', x: 3, y: 7 },
      { ingredient: 'Tomato',  emoji: '🍅', x: 8, y: 4 },
      { ingredient: 'Lettuce', emoji: '🥬', x: 1, y: 6 },
      { ingredient: 'Butter',  emoji: '🧈', x: 6, y: 2 },
    ],
  },
  {
    name:   'Level 2: Salad Secrets',
    title:  'The Mystery Bowl',
    quests: [
      { ingredient: 'Apple',   emoji: '🍎', x: 4, y: 8 },
      { ingredient: 'Carrot',  emoji: '🥕', x: 7, y: 3 },
      { ingredient: 'Lemon',   emoji: '🍋', x: 2, y: 5 },
      { ingredient: 'Grapes',  emoji: '🍇', x: 9, y: 7 },
      { ingredient: 'Orange',  emoji: '🍊', x: 5, y: 0 },
    ],
  },
]

const LUNCHBOX_CAPACITY = 6

/* ─── CSS animations ─────────────────────────────────────────────────────── */
const GAME_STYLES = `
  @keyframes ck-pulse {
    0%,100% { box-shadow: 0 0 10px 4px rgba(139,92,246,0.75); transform: scale(1);    }
    50%      { box-shadow: 0 0 22px 9px rgba(139,92,246,1);    transform: scale(1.07); }
  }
  @keyframes ck-hit {
    0%   { transform: scale(1)   rotate(0deg);   }
    30%  { transform: scale(1.6) rotate(-15deg); }
    65%  { transform: scale(1.3) rotate(10deg);  }
    100% { transform: scale(1)   rotate(0deg);   }
  }
  @keyframes ck-miss {
    0%,100% { transform: translateX(0);   }
    20%     { transform: translateX(-6px); }
    40%     { transform: translateX(6px);  }
    60%     { transform: translateX(-4px); }
    80%     { transform: translateX(4px);  }
  }
  @keyframes ck-fadein {
    from { opacity: 0; transform: scale(0.88) translateY(6px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);   }
  }
  /* Spring-bounce entrance for the hint speech bubble */
  @keyframes ck-hint-spring {
    0%   { opacity: 0; transform: scale(0.55) translateY(14px); }
    55%  { opacity: 1; transform: scale(1.12) translateY(-4px); }
    75%  { transform: scale(0.96) translateY(2px); }
    90%  { transform: scale(1.04) translateY(-1px); }
    100% { transform: scale(1)    translateY(0);   }
  }
  @keyframes ck-wobble {
    0%,100% { transform: rotate(0deg)   scale(1);    }
    25%     { transform: rotate(-10deg) scale(1.06); }
    75%     { transform: rotate(10deg)  scale(1.06); }
  }
  @keyframes ck-shimmer {
    0%,100% { opacity: 0.55; }
    50%     { opacity: 0.90; }
  }
  /* Grid hover: faint warm overlay + subtle amber border glow */
  .ck-cell:hover {
    background: rgba(255,200,50,0.18) !important;
    border-color: rgba(251,191,36,0.90) !important;
    box-shadow: 0 0 8px 2px rgba(251,191,36,0.28) inset !important;
    cursor: pointer;
  }
  .ck-btn:active { transform: translateY(3px) !important; box-shadow: none !important; }

  /* Lunchbox slot bounce when a new item lands */
  @keyframes ck-lunchbox-bounce {
    0%   { transform: scale(1)    rotate(0deg);   }
    25%  { transform: scale(1.55) rotate(-12deg); }
    55%  { transform: scale(1.30) rotate(8deg);   }
    75%  { transform: scale(1.10) rotate(-4deg);  }
    100% { transform: scale(1)    rotate(0deg);   }
  }
  .ck-slot-bounce { animation: ck-lunchbox-bounce 0.55s ease-out forwards !important; }
`

/* ─── Typography ─────────────────────────────────────────────────────────── */
const FO = "'Orbitron', sans-serif"
const FF = "'Fredoka One', 'Rajdhani', sans-serif"
const FR = "'Rajdhani', sans-serif"

/* ─── Helpers ────────────────────────────────────────────────────────────── */
// Returns an inline-style object for an absolutely-positioned axis label.
function axisLabelStyle(axis, index, total) {
  const base = {
    position: 'absolute',
    fontFamily: FF,
    fontSize: 12,
    fontWeight: 700,
    color: '#fde68a',
    lineHeight: 1,
    userSelect: 'none',
    textShadow: '1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000',
  }
  if (axis === 'y') {
    // top: index * CS aligns label centre with gridline i (index 0 = top = label GN)
    return { ...base, top: index * CS, right: 0, transform: 'translateY(-50%)' }
  }
  // x-axis: left: index * CS aligns label centre with gridline i
  return { ...base, left: index * CS, top: 0, transform: 'translateX(-50%)' }
}

/* ─── CoordinateKitchen ──────────────────────────────────────────────────── */
// initialLevel: optional 0-based level index; lets the "PLAY →" button on the
// WorldMap call startGame(levelId) by passing <CoordinateKitchen initialLevel={id} />.
export default function CoordinateKitchen({ onComplete, initialLevel = 0 }) {
  const [levelIdx,    setLevelIdx]    = useState(() => Math.min(initialLevel, LEVELS.length - 1))
  const [questIdx,    setQuestIdx]    = useState(0)
  const [lunchbox,    setLunchbox]    = useState([])
  const [hint,        setHint]        = useState(null)
  const [flashCell,   setFlashCell]   = useState(null)
  const [celebrating, setCelebrating] = useState(false)
  const [gameOver,    setGameOver]    = useState(false)
  // Index of the lunchbox slot that just received an item — used to trigger the
  // bounce animation on that slot for exactly one render cycle.
  const [newSlotIdx,  setNewSlotIdx]  = useState(null)
  // Ref for the hint auto-dismiss timer so we can cancel on correct click / unmount.
  const hintTimerRef = useRef(null)

  const level = LEVELS[levelIdx]
  const quest = level.quests[questIdx]

  /* ── Auto-dismiss hint after 4 s ── */
  useEffect(() => {
    if (!hint) return
    hintTimerRef.current = setTimeout(() => setHint(null), 4000)
    return () => clearTimeout(hintTimerRef.current)
  }, [hint])

  /* ── Clear bounce class after animation completes (~550 ms) ── */
  useEffect(() => {
    if (newSlotIdx === null) return
    const t = setTimeout(() => setNewSlotIdx(null), 550)
    return () => clearTimeout(t)
  }, [newSlotIdx])

  /* ── Cell click ── */
  const handleCellClick = useCallback((x, y) => {
    if (celebrating || gameOver) return
    const { x: tx, y: ty, emoji, ingredient } = quest

    if (x === tx && y === ty) {
      // ✅ Correct — play chime, add to lunchbox, bounce the new slot, advance quest
      playSuccessSound()
      clearTimeout(hintTimerRef.current)
      setFlashCell({ x, y, kind: 'hit' })
      setHint(null)
      setCelebrating(true)
      setLunchbox(prev => {
        const next = [...prev, { emoji, ingredient }]
        // Record the index of the just-added slot so the bounce class can be applied.
        setNewSlotIdx(next.length - 1)
        return next
      })

      setTimeout(() => {
        setFlashCell(null)
        setCelebrating(false)
        const nq = questIdx + 1
        if (nq < level.quests.length) {
          setQuestIdx(nq)
        } else {
          const nl = levelIdx + 1
          if (nl < LEVELS.length) {
            setLevelIdx(nl)
            setQuestIdx(0)
          } else {
            setGameOver(true)
          }
        }
      }, 1400)
    } else {
      // ❌ Wrong — play boop, show analogy hint (auto-dismissed after 4 s via useEffect)
      playErrorSound()
      clearTimeout(hintTimerRef.current)
      setFlashCell({ x, y, kind: 'miss' })
      setTimeout(() => setFlashCell(null), 500)

      const rightX = x === tx
      const rightY = y === ty
      let text
      if (rightX && !rightY) {
        text = `HINT:\nCorrect Drawer! Now reach one Shelf ${y < ty ? 'HIGHER' : 'LOWER'}!\nLook at Shelf ${ty}.`
      } else if (!rightX && rightY) {
        text = `HINT:\nCorrect Shelf! Now walk ${x < tx ? 'right' : 'left'}\nto Drawer ${tx}.`
      } else {
        text = `HINT:\nWalk to Drawer ${tx} first,\nthen reach for Shelf ${ty}!`
      }
      setHint({ text, drw: tx, shf: ty })
    }
  }, [celebrating, gameOver, quest, questIdx, level.quests.length, levelIdx])

  const handleRestart = () => {
    clearTimeout(hintTimerRef.current)
    setLevelIdx(Math.min(initialLevel, LEVELS.length - 1))
    setQuestIdx(0); setLunchbox([])
    setHint(null); setFlashCell(null); setCelebrating(false)
    setGameOver(false); setNewSlotIdx(null)
  }

  /* ── GAME OVER SCREEN ─────────────────────────────────────────────────── */
  if (gameOver) {
    return (
      <>
        <style>{GAME_STYLES}</style>
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(160deg,#0f172a,#1e1b4b)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', gap: '18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '72px', lineHeight: 1 }}>🎉</div>
          <div style={{ fontFamily: FO, fontSize: '24px', fontWeight: 900, color: '#a78bfa', letterSpacing: '1px' }}>
            KITCHEN COMPLETE!
          </div>
          <div style={{ fontFamily: FR, fontSize: '16px', color: '#94a3b8', fontWeight: 600, maxWidth: 360 }}>
            Amazing! You found every ingredient using Drawers &amp; Shelves!
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            {lunchbox.map((item, i) => (
              <div key={i} style={{
                background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)',
                borderRadius: '12px', padding: '10px 16px',
                fontFamily: FF, fontSize: '15px', color: '#e2e8f0',
              }}>
                {item.emoji} {item.ingredient}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="ck-btn" onClick={handleRestart} style={{
              fontFamily: FF, fontSize: '16px', fontWeight: 700, color: '#fff',
              background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)', border: 'none',
              borderRadius: '14px', padding: '14px 30px', cursor: 'pointer',
              boxShadow: '0 5px 0 #3b1a8a',
            }}>🔄 Play Again</button>
            {onComplete && (
              <button className="ck-btn" onClick={onComplete} style={{
                fontFamily: FF, fontSize: '16px', fontWeight: 700, color: '#fff',
                background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none',
                borderRadius: '14px', padding: '14px 30px', cursor: 'pointer',
                boxShadow: '0 5px 0 #065f46',
              }}>✅ Done!</button>
            )}
          </div>
        </div>
      </>
    )
  }

  /* ── MAIN GAME SCREEN ─────────────────────────────────────────────────── */
  return (
    <>
      <style>{GAME_STYLES}</style>

      {/* ── Outer wrapper ───────────────────────────────────────────────── */}
      <div style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg,#09192e 0%,#0b2118 60%,#091624 100%)',
        overflow: 'hidden',
        fontFamily: FR,
      }}>

        {/* ── Terrain background blobs ──────────────────────────────────── */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', left: '3%',  top: '28%', width: 210, height: 165,
            background: 'radial-gradient(ellipse,rgba(56,96,42,0.72) 30%,transparent 80%)',
            borderRadius: '55% 45% 60% 40%' }} />
          <div style={{ position: 'absolute', left: '26%', top: '16%', width: 240, height: 210,
            background: 'radial-gradient(ellipse,rgba(90,70,42,0.55) 30%,transparent 78%)',
            borderRadius: '45% 55% 55% 45%' }} />
          <div style={{ position: 'absolute', right: '3%', top: '20%', width: 220, height: 200,
            background: 'radial-gradient(ellipse,rgba(52,88,40,0.72) 30%,transparent 80%)',
            borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: '10%', left: '12%', width: 320, height: 110,
            background: 'radial-gradient(ellipse,rgba(12,52,86,0.38) 50%,transparent 100%)',
            borderRadius: '50%', animation: 'ck-shimmer 3s ease-in-out infinite' }} />
        </div>

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div style={{
          position: 'relative', zIndex: 10, flexShrink: 0,
          background: 'rgba(4,10,24,0.93)',
          borderBottom: '2px solid rgba(124,58,237,0.40)',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        }}>
          <span style={{ fontFamily: FO, fontSize: 'clamp(10px,2.5vw,15px)', fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>
            Welcome to Coordinate Kitchen!
          </span>
          <span style={{ color: '#334155', fontSize: '16px' }}>|</span>
          <span style={{ fontFamily: FF, fontSize: 'clamp(10px,2.5vw,14px)', color: '#fbbf24', fontWeight: 700 }}>
            {level.name}
          </span>
        </div>

        {/* ── BODY ────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px', overflow: 'auto',
        }}>

          {/* ── QUEST PANEL — top-left ─────────────────────────────────── */}
          <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 30,
            background: 'rgba(6,14,38,0.96)',
            border: '2.5px solid rgba(96,165,250,0.55)',
            borderRadius: '14px', padding: '11px 12px',
            minWidth: 155, maxWidth: 185,
            boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          }}>
            <div style={{ fontFamily: FO, fontSize: '8px', letterSpacing: '2px', color: '#60a5fa', fontWeight: 700, marginBottom: '4px' }}>
              CURRENT QUEST:
            </div>
            <div style={{ fontFamily: FF, fontSize: '13.5px', color: '#f1f5f9', fontWeight: 700, marginBottom: '8px', lineHeight: 1.2 }}>
              {level.title}
            </div>
            {/* Parchment box */}
            <div style={{
              background: 'linear-gradient(145deg,#f5e8c8,#e8d6a8)',
              borderRadius: '8px', padding: '8px 10px',
              display: 'flex', alignItems: 'center', gap: '8px',
              border: '1.5px solid #c4a460',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.10)',
            }}>
              <div>
                <div style={{ fontFamily: FR, fontSize: '10px', color: '#7a4e10', fontWeight: 700 }}>Find:</div>
                <div style={{ fontFamily: FF, fontSize: '12.5px', color: '#3a1800', fontWeight: 700, lineHeight: 1.2 }}>
                  {quest.ingredient} at ({quest.x},{quest.y})
                </div>
              </div>
              <div style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0 }}>{quest.emoji}</div>
            </div>
            <div style={{ fontFamily: FR, fontSize: '10px', color: '#475569', fontWeight: 600, marginTop: '6px' }}>
              Quest {questIdx + 1}/{level.quests.length}
            </div>
          </div>

          {/* ── LOGO — top-right ──────────────────────────────────────────── */}
          <div style={{
            position: 'absolute', top: 10, right: 10, zIndex: 30,
            background: 'linear-gradient(135deg,#7c3aed,#5b21b6)',
            borderRadius: '16px', padding: '12px 15px',
            textAlign: 'center',
            boxShadow: '0 4px 18px rgba(124,58,237,0.55)',
            border: '1.5px solid rgba(167,139,250,0.40)',
          }}>
            <div style={{ fontSize: '28px', lineHeight: 1, color: '#fff', marginBottom: '3px' }}>▶</div>
            <div style={{ fontFamily: FO, fontSize: '7.5px', letterSpacing: '1px', color: '#e9d5ff', fontWeight: 700, lineHeight: 1.4 }}>
              THE MATH<br />SCRIPT
            </div>
          </div>

          {/* ── GRID SECTION ──────────────────────────────────────────────── */}
          {/*
            Layout (flex column):
              Row:  [Y-title 20px] [Y-labels 22px] [Grid 400px]
              Row:  [margin 52px]  [X-labels 400px relative-container]
              Row:  [margin 52px]  [X-title  400px]
              Row:  "REFRIGERATOR HOME" text
          */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            marginTop: '58px', marginBottom: '8px',
          }}>

            {/* ── Row: y-axis sidebar + grid ─────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'stretch' }}>

              {/* Y-axis title (rotated) */}
              <div style={{
                width: 20, flexShrink: 0, marginRight: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                  fontFamily: FF, fontSize: 11, color: '#fbbf24', fontWeight: 700,
                  letterSpacing: '1.5px', whiteSpace: 'nowrap',
                  textShadow: '0 0 8px rgba(251,191,36,0.55),1px 1px 0 #000',
                }}>
                  SHELVES (↑ REACH ↑)
                </span>
              </div>

              {/* Y-axis number labels — absolute positioning for exact gridline alignment */}
              <div style={{
                position: 'relative', width: 22, height: GH,
                flexShrink: 0, marginRight: 6, overflow: 'visible',
              }}>
                {Array.from({ length: GN + 1 }, (_, i) => (
                  <div key={GN - i} style={axisLabelStyle('y', i, GN)}>
                    {GN - i}
                  </div>
                ))}
              </div>

              {/* ── Grid container ────────────────────────────────────────── */}
              <div style={{ position: 'relative', width: GW, height: GH, flexShrink: 0 }}>

                {/* Map background layer */}
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 2, zIndex: 0,
                  background: 'linear-gradient(135deg,#2c5a1e 0%,#4a7530 20%,#7a6235 50%,#577840 75%,#284e22 100%)',
                  overflow: 'hidden',
                }}>
                  {/* Mountain terrain blob */}
                  <div style={{
                    position: 'absolute', left: '18%', top: '8%', width: '36%', height: '52%',
                    background: 'radial-gradient(ellipse,rgba(105,82,50,0.75) 35%,transparent 80%)',
                    borderRadius: '45% 55% 55% 45%',
                  }} />
                  {/* Spice Rack Mountains label */}
                  <div style={{
                    position: 'absolute', left: '21%', top: '14%',
                    fontFamily: FF, fontSize: 9.5, lineHeight: 1.3, textAlign: 'center',
                    color: 'rgba(255,245,210,0.90)',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.95)',
                    pointerEvents: 'none',
                  }}>
                    ⛰️ Spice Rack<br />Mountains
                  </div>
                  {/* Cereal Box Heights label */}
                  <div style={{
                    position: 'absolute', right: '4%', top: '4%',
                    fontFamily: FF, fontSize: 9.5, lineHeight: 1.3, textAlign: 'center',
                    color: 'rgba(255,245,210,0.90)',
                    textShadow: '1px 1px 2px rgba(0,0,0,0.95)',
                    pointerEvents: 'none',
                  }}>
                    📦 Cereal Box<br />Heights
                  </div>
                </div>

                {/* Grid cells layer — 10 × 10 */}
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GN}, ${CS}px)`,
                  gridTemplateRows:    `repeat(${GN}, ${CS}px)`,
                }}>
                  {Array.from({ length: GN }, (_, rowIdx) => {
                    const y = GN - 1 - rowIdx   // row 0 (top) → y=9; row 9 (bottom) → y=0
                    return Array.from({ length: GN }, (_, x) => {
                      const isTarget = !celebrating && x === quest.x && y === quest.y
                      const isHit    = flashCell?.kind === 'hit'  && flashCell.x === x && flashCell.y === y
                      const isMiss   = flashCell?.kind === 'miss' && flashCell.x === x && flashCell.y === y

                      return (
                        <div
                          key={`${x}-${y}`}
                          className="ck-cell"
                          onClick={() => handleCellClick(x, y)}
                          style={{
                            width: CS, height: CS,
                            background: isHit  ? 'rgba(74,222,128,0.55)'
                                       : isMiss ? 'rgba(248,113,113,0.45)'
                                       : 'rgba(10,24,10,0.08)',
                            border: '1px solid rgba(255,200,50,0.62)',
                            boxShadow: '0 0 4px rgba(255,200,50,0.07) inset',
                            position: 'relative',
                            transition: 'background 0.1s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: isMiss ? 'ck-miss 0.4s ease-in-out' : 'none',
                          }}
                        >
                          {/* Glowing target indicator */}
                          {isTarget && (
                            <div style={{
                              position: 'absolute', inset: 6,
                              borderRadius: '50%',
                              background: 'rgba(139,92,246,0.28)',
                              border: '2.5px solid #a78bfa',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 20,
                              animation: 'ck-pulse 1.6s ease-in-out infinite',
                              zIndex: 3,
                            }}>
                              {quest.emoji}
                            </div>
                          )}
                          {/* Celebrate flash */}
                          {isHit && (
                            <div style={{ fontSize: 22, animation: 'ck-hit 0.7s ease-in-out forwards', zIndex: 4 }}>
                              {quest.emoji}
                            </div>
                          )}
                        </div>
                      )
                    })
                  }).flat()}
                </div>
              </div>{/* end grid container */}
            </div>{/* end y-axis + grid row */}

            {/* ── X-axis number labels ───────────────────────────────────── */}
            {/* Absolute positioning inside a relative container ensures each
                label is centred exactly on its gridline (left: i * CS). */}
            <div style={{
              position: 'relative',
              width: GW, height: 20,
              marginLeft: Y_SIDEBAR, marginTop: 4,
              overflow: 'visible',
            }}>
              {Array.from({ length: GN + 1 }, (_, i) => (
                <div key={i} style={axisLabelStyle('x', i, GN)}>{i}</div>
              ))}
            </div>

            {/* ── X-axis title + Refrigerator Home row ──────────────────── */}
            <div style={{
              display: 'flex', alignItems: 'flex-start',
              marginLeft: Y_SIDEBAR, marginTop: 5,
              width: GW,
            }}>
              {/* Origin landmark */}
              <div style={{
                fontFamily: FF, fontSize: '8.5px', color: '#64748b', fontWeight: 700,
                lineHeight: 1.3, textAlign: 'left', flexShrink: 0,
              }}>
                🧊
              </div>
              {/* Axis title centred over grid */}
              <div style={{
                flex: 1, textAlign: 'center',
                fontFamily: FF, fontSize: 13, color: '#fbbf24', fontWeight: 700,
                letterSpacing: '1.5px',
                textShadow: '0 0 8px rgba(251,191,36,0.50),1px 1px 0 #000',
              }}>
                DRAWERS (→ WALK →)
              </div>
            </div>

            {/* REFRIGERATOR HOME label */}
            <div style={{
              marginLeft: Y_SIDEBAR,
              fontFamily: FF, fontSize: '8px', color: '#475569', fontWeight: 700,
              letterSpacing: '0.5px', lineHeight: 1, marginTop: 2,
            }}>
              REFRIGERATOR HOME
            </div>

            {/* ── LUNCHBOX PANEL — below X-axis, right-aligned ─────────────── */}
            <div style={{
              alignSelf: 'flex-end', marginTop: 12, zIndex: 30,
              background: 'rgba(6,14,38,0.96)',
              border: '2.5px solid rgba(251,191,36,0.55)',
              borderRadius: 14, padding: '11px 13px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
            }}>
              <div style={{
                fontFamily: FO, fontSize: '9.5px', letterSpacing: '2px',
                color: '#fbbf24', fontWeight: 700,
                marginBottom: 9, textAlign: 'center',
              }}>
                MY LUNCHBOX
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 7 }}>
                {Array.from({ length: LUNCHBOX_CAPACITY }, (_, i) => {
                  const item = lunchbox[i]
                  const isBouncing = i === newSlotIdx
                  return (
                    <div
                      key={i}
                      className={isBouncing ? 'ck-slot-bounce' : undefined}
                      style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: item ? 'rgba(124,58,237,0.22)' : 'rgba(15,28,55,0.75)',
                        border: item
                          ? '2.5px solid rgba(167,139,250,0.85)'
                          : '2px dashed rgba(71,85,105,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22, transition: 'background 0.35s, border-color 0.35s, box-shadow 0.35s',
                        boxShadow: item ? '0 0 10px rgba(124,58,237,0.35)' : 'none',
                      }}
                    >
                      {item?.emoji ?? ''}
                    </div>
                  )
                })}
              </div>
            </div>

          </div>{/* end grid section */}

          {/* ── EXPLORER MASCOT ─────────────────────────────────────────── */}
          <div style={{
            position: 'absolute', bottom: 52, left: 'clamp(16px,5%,52px)',
            fontSize: 52, zIndex: 25, lineHeight: 1,
            animation: hint ? 'ck-wobble 0.55s ease' : 'none',
            filter: 'drop-shadow(2px 4px 6px rgba(0,0,0,0.7))',
            userSelect: 'none',
          }}>
            🧒
          </div>

          {/* ── HINT SPEECH BUBBLE ──────────────────────────────────────── */}
          {hint && (
            <div style={{
              position: 'absolute', bottom: 116, left: 'clamp(68px,13%,128px)',
              background: '#ffffff', borderRadius: 16,
              padding: '11px 14px 11px 11px',
              maxWidth: 265, zIndex: 36,
              boxShadow: '0 6px 28px rgba(0,0,0,0.55)',
              animation: 'ck-hint-spring 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards', /* spring: overshoot then settle */
              border: '2px solid rgba(124,58,237,0.28)',
            }}>
              {/* Tail pointing down-left toward mascot */}
              <div style={{
                position: 'absolute', bottom: -13, left: 22,
                width: 0, height: 0,
                borderLeft: '12px solid transparent',
                borderRight: '0 solid transparent',
                borderTop: '13px solid #fff',
                filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.15))',
              }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 26, flexShrink: 0, lineHeight: 1.1 }}>🧒</div>
                <div style={{ flex: 1 }}>
                  {/* Coordinate badges */}
                  <div style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                    <div style={{
                      background: '#fbbf24', color: '#1a1a1a',
                      borderRadius: 5, padding: '2px 8px',
                      fontFamily: FF, fontSize: 13, fontWeight: 700,
                    }}>
                      {hint.drw}
                    </div>
                    <div style={{
                      background: '#7c3aed', color: '#fff',
                      borderRadius: 5, padding: '2px 8px',
                      fontFamily: FF, fontSize: 13, fontWeight: 700,
                    }}>
                      {hint.shf}
                    </div>
                  </div>
                  <div style={{
                    fontFamily: FR, fontSize: 12.5, color: '#1e293b',
                    fontWeight: 700, lineHeight: 1.45, whiteSpace: 'pre-line',
                  }}>
                    {hint.text}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setHint(null)}
                style={{
                  position: 'absolute', top: 6, right: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: '#94a3b8', padding: '2px 4px', lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          )}

        </div>{/* end body */}
      </div>
    </>
  )
}
