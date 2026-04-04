import { useState, useCallback } from 'react'

/* ─── Ingredient pool ─────────────────────────────────────────────────────── */
const INGREDIENTS = [
  { name: 'Cheese',     emoji: '🧀' },
  { name: 'Apple',      emoji: '🍎' },
  { name: 'Bread',      emoji: '🍞' },
  { name: 'Milk',       emoji: '🥛' },
  { name: 'Carrot',     emoji: '🥕' },
  { name: 'Cookie',     emoji: '🍪' },
  { name: 'Egg',        emoji: '🥚' },
  { name: 'Strawberry', emoji: '🍓' },
  { name: 'Butter',     emoji: '🧈' },
  { name: 'Tomato',     emoji: '🍅' },
  { name: 'Lemon',      emoji: '🍋' },
  { name: 'Chocolate',  emoji: '🍫' },
  { name: 'Orange',     emoji: '🍊' },
  { name: 'Broccoli',   emoji: '🥦' },
  { name: 'Banana',     emoji: '🍌' },
  { name: 'Muffin',     emoji: '🧁' },
  { name: 'Pear',       emoji: '🍐' },
  { name: 'Grapes',     emoji: '🍇' },
  { name: 'Pepper',     emoji: '🌶️' },
  { name: 'Pizza',      emoji: '🍕' },
]

const QUEST_COUNT = 5

/* ─── Quest generator ─────────────────────────────────────────────────────── */
function generateQuests(count) {
  const pool = [...INGREDIENTS].sort(() => Math.random() - 0.5)
  return pool.slice(0, count).map(ingredient => ({
    ...ingredient,
    x: Math.floor(Math.random() * 10) + 1, // Drawer 1-10
    y: Math.floor(Math.random() * 10) + 1, // Shelf 1-10
  }))
}

/* ─── CoordinateKitchen ───────────────────────────────────────────────────── */
export default function CoordinateKitchen({ onComplete }) {
  const [quests, setQuests]             = useState(() => generateQuests(QUEST_COUNT))
  const [questIdx, setQuestIdx]         = useState(0)
  const [lunchbox, setLunchbox]         = useState([])
  const [hint, setHint]                 = useState({ text: '👆 Click a cell on the grid to find the ingredient!', type: 'neutral' })
  const [gameState, setGameState]       = useState('playing') // 'playing' | 'complete'
  const [flashCell, setFlashCell]       = useState(null) // { x, y, kind: 'hit'|'miss' }
  const [hoveredCell, setHoveredCell]   = useState(null)

  const currentQuest = quests[questIdx]

  /* ── Cell click handler ── */
  const handleCellClick = useCallback((x, y) => {
    if (gameState !== 'playing') return

    const { x: cx, y: cy, emoji, name } = currentQuest

    if (x === cx && y === cy) {
      // ✅ Correct!
      setFlashCell({ x, y, kind: 'hit' })
      setHint({ text: `🎉 You found the ${emoji} ${name}! Into the Lunchbox!`, type: 'success' })

      const newLunchbox = [...lunchbox, currentQuest]
      setLunchbox(newLunchbox)

      setTimeout(() => {
        setFlashCell(null)
        const next = questIdx + 1
        if (next >= quests.length) {
          setGameState('complete')
        } else {
          setQuestIdx(next)
          setHint({ text: '👆 Click a cell on the grid to find the ingredient!', type: 'neutral' })
        }
      }, 1100)
    } else {
      // ❌ Wrong — give analogy hint
      setFlashCell({ x, y, kind: 'miss' })
      setTimeout(() => setFlashCell(null), 550)

      const rightDrawer = x === cx
      const rightShelf  = y === cy

      if (rightDrawer && !rightShelf) {
        const dir = y < cy ? 'higher' : 'lower'
        setHint({ text: `✅ Right Drawer! Now reach ${dir} — look for Shelf ${cy}!`, type: 'close' })
      } else if (!rightDrawer && rightShelf) {
        const dir = x < cx ? 'right' : 'left'
        setHint({ text: `✅ Right Shelf! But walk ${dir} — look for Drawer ${cx}!`, type: 'close' })
      } else {
        setHint({ text: `🚶 Walk to Drawer ${cx} first, then reach for Shelf ${cy}!`, type: 'neutral' })
      }
    }
  }, [gameState, currentQuest, lunchbox, questIdx, quests.length])

  /* ── Restart ── */
  const handleRestart = () => {
    setQuests(generateQuests(QUEST_COUNT))
    setQuestIdx(0)
    setLunchbox([])
    setHint({ text: '👆 Click a cell on the grid to find the ingredient!', type: 'neutral' })
    setGameState('playing')
    setFlashCell(null)
  }

  /* ── Shared typography tokens ── */
  const fontOrbitron = "'Orbitron', sans-serif"
  const fontFredoka  = "'Fredoka One', 'Rajdhani', sans-serif"
  const fontRajdhani = "'Rajdhani', sans-serif"

  /* ── Hint color map ── */
  const hintColor = {
    neutral: '#94a3b8',
    close:   '#fbbf24',
    success: '#4ade80',
    error:   '#f87171',
  }

  /* ─── COMPLETE SCREEN ─────────────────────────────────────────────────── */
  if (gameState === 'complete') {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)',
        textAlign: 'center',
        gap: '16px',
      }}>
        <div style={{ fontSize: '64px', lineHeight: 1 }}>🎉</div>
        <div style={{
          fontFamily: fontOrbitron,
          fontSize: '22px',
          fontWeight: 900,
          color: '#a78bfa',
          letterSpacing: '1px',
        }}>
          LUNCHBOX COMPLETE!
        </div>
        <div style={{
          fontFamily: fontRajdhani,
          fontSize: '16px',
          color: '#94a3b8',
          fontWeight: 600,
          maxWidth: '320px',
        }}>
          You found all {QUEST_COUNT} ingredients using Drawers and Shelves!
        </div>
        {/* Collected items */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          justifyContent: 'center',
          marginTop: '8px',
        }}>
          {lunchbox.map((item, i) => (
            <div key={i} style={{
              background: 'rgba(124,58,237,0.2)',
              border: '1px solid rgba(124,58,237,0.4)',
              borderRadius: '12px',
              padding: '10px 14px',
              fontFamily: fontFredoka,
              fontSize: '15px',
              color: '#e2e8f0',
            }}>
              {item.emoji} {item.name}
            </div>
          ))}
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={handleRestart}
            style={{
              fontFamily: fontFredoka,
              fontSize: '15px',
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(135deg, #7c3aed, #0ea5e9)',
              border: 'none',
              borderRadius: '14px',
              padding: '14px 28px',
              cursor: 'pointer',
              boxShadow: '0 5px 0 #3b1a8a',
            }}
          >
            🔄 Play Again
          </button>
          {onComplete && (
            <button
              onClick={onComplete}
              style={{
                fontFamily: fontFredoka,
                fontSize: '15px',
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                border: 'none',
                borderRadius: '14px',
                padding: '14px 28px',
                cursor: 'pointer',
                boxShadow: '0 5px 0 #065f46',
              }}
            >
              ✅ Done!
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ─── PLAYING SCREEN ──────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
    }}>

      {/* ── Quest Card ──────────────────────────────────────────────────── */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: 'rgba(17,24,39,0.8)',
        border: '1px solid rgba(124,58,237,0.45)',
        borderRadius: '16px',
        padding: '16px',
      }}>
        {/* Title row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}>
          <div style={{
            fontFamily: fontOrbitron,
            fontSize: '11px',
            letterSpacing: '1.5px',
            color: '#a78bfa',
            fontWeight: 700,
          }}>
            🍳 COORDINATE KITCHEN
          </div>
          <div style={{
            fontFamily: fontRajdhani,
            fontSize: '13px',
            color: '#64748b',
            fontWeight: 700,
          }}>
            Quest {questIdx + 1} / {QUEST_COUNT}
          </div>
        </div>

        {/* Current ingredient */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
        }}>
          <div style={{ fontSize: '48px', lineHeight: 1, flexShrink: 0 }}>
            {currentQuest.emoji}
          </div>
          <div>
            <div style={{
              fontFamily: fontFredoka,
              fontSize: '20px',
              fontWeight: 700,
              color: '#fff',
              marginBottom: '4px',
            }}>
              Find the {currentQuest.name}!
            </div>
            <div style={{
              fontFamily: fontRajdhani,
              fontSize: '15px',
              color: '#fbbf24',
              fontWeight: 700,
            }}>
              📦 Drawer {currentQuest.x} &nbsp;·&nbsp; 🗄️ Shelf {currentQuest.y}
            </div>
            <div style={{
              fontFamily: fontRajdhani,
              fontSize: '12px',
              color: '#64748b',
              fontWeight: 600,
              marginTop: '3px',
            }}>
              Walk to Drawer {currentQuest.x}, then reach for Shelf {currentQuest.y}
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: 'rgba(17,24,39,0.8)',
        border: '1px solid rgba(124,58,237,0.35)',
        borderRadius: '16px',
        padding: '12px',
        overflowX: 'auto',
      }}>
        {/* Axis labels row: top-left corner + Drawer numbers */}
        <div style={{ display: 'flex', marginBottom: '4px', paddingLeft: '28px' }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(x => (
            <div key={x} style={{
              width: 'clamp(26px, 8vw, 44px)',
              flexShrink: 0,
              textAlign: 'center',
              fontFamily: fontOrbitron,
              fontSize: 'clamp(8px, 2vw, 11px)',
              fontWeight: 700,
              color: hoveredCell?.x === x ? '#a78bfa' : '#475569',
              transition: 'color 0.15s',
            }}>
              {x}
            </div>
          ))}
        </div>

        {/* Grid rows: Shelf 10 at top → Shelf 1 at bottom */}
        {Array.from({ length: 10 }, (_, rowIndex) => {
          const shelfNum = 10 - rowIndex // Shelf 10 at top, 1 at bottom
          return (
            <div key={shelfNum} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
              {/* Shelf label */}
              <div style={{
                width: '28px',
                flexShrink: 0,
                textAlign: 'right',
                paddingRight: '5px',
                fontFamily: fontOrbitron,
                fontSize: 'clamp(8px, 2vw, 11px)',
                fontWeight: 700,
                color: hoveredCell?.y === shelfNum ? '#a78bfa' : '#475569',
                transition: 'color 0.15s',
              }}>
                {shelfNum}
              </div>

              {/* Cells */}
              {Array.from({ length: 10 }, (_, colIndex) => {
                const drawerNum = colIndex + 1
                const isHovered = hoveredCell?.x === drawerNum && hoveredCell?.y === shelfNum
                const isFlashHit  = flashCell?.kind === 'hit'  && flashCell.x === drawerNum && flashCell.y === shelfNum
                const isFlashMiss = flashCell?.kind === 'miss' && flashCell.x === drawerNum && flashCell.y === shelfNum
                // Highlight column/row if hovering
                const colHighlight = hoveredCell?.x === drawerNum
                const rowHighlight = hoveredCell?.y === shelfNum

                let bg = 'rgba(30,41,59,0.6)'
                let border = '1px solid rgba(51,65,85,0.5)'
                let scale = 1

                if (isFlashHit) {
                  bg = 'rgba(74,222,128,0.45)'
                  border = '1.5px solid #4ade80'
                  scale = 1.2
                } else if (isFlashMiss) {
                  bg = 'rgba(248,113,113,0.35)'
                  border = '1.5px solid #f87171'
                  scale = 0.92
                } else if (isHovered) {
                  bg = 'rgba(124,58,237,0.35)'
                  border = '1.5px solid #7c3aed'
                  scale = 1.1
                } else if (colHighlight || rowHighlight) {
                  bg = 'rgba(124,58,237,0.08)'
                  border = '1px solid rgba(124,58,237,0.2)'
                }

                return (
                  <div
                    key={drawerNum}
                    onClick={() => handleCellClick(drawerNum, shelfNum)}
                    onMouseEnter={() => setHoveredCell({ x: drawerNum, y: shelfNum })}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      width: 'clamp(26px, 8vw, 44px)',
                      height: 'clamp(26px, 8vw, 44px)',
                      flexShrink: 0,
                      background: bg,
                      border,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transform: `scale(${scale})`,
                      transition: 'transform 0.1s ease, background 0.1s ease, border-color 0.1s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '2px',
                    }}
                  />
                )
              })}
            </div>
          )
        })}

        {/* X-axis label */}
        <div style={{
          paddingLeft: '28px',
          marginTop: '6px',
          fontFamily: fontRajdhani,
          fontSize: '11px',
          color: '#475569',
          fontWeight: 700,
          letterSpacing: '1px',
          textAlign: 'center',
        }}>
          ← DRAWERS (walk left / right) →
        </div>

        {/* Y-axis label — rotated, positioned via a wrapper trick */}
        <div style={{
          position: 'absolute',
          fontSize: '10px',
          fontFamily: fontRajdhani,
          color: '#475569',
          fontWeight: 700,
          letterSpacing: '1px',
          pointerEvents: 'none',
          opacity: 0,           // hidden on small screens (too cramped), accessible via shelf numbers
        }}>
          ↑ SHELVES (reach up / down) ↓
        </div>
      </div>

      {/* ── Hint Banner ─────────────────────────────────────────────────── */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: 'rgba(17,24,39,0.8)',
        border: `1px solid ${hintColor[hint.type]}40`,
        borderRadius: '14px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minHeight: '50px',
      }}>
        <div style={{
          fontFamily: fontFredoka,
          fontSize: 'clamp(13px, 3.5vw, 15px)',
          color: hintColor[hint.type],
          fontWeight: 700,
          lineHeight: 1.4,
          transition: 'color 0.25s',
        }}>
          {hint.text}
        </div>
      </div>

      {/* ── Lunchbox Inventory ──────────────────────────────────────────── */}
      {lunchbox.length > 0 && (
        <div style={{
          width: '100%',
          maxWidth: '560px',
          background: 'rgba(17,24,39,0.8)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: '14px',
          padding: '12px 16px',
        }}>
          <div style={{
            fontFamily: fontOrbitron,
            fontSize: '11px',
            color: '#fbbf24',
            letterSpacing: '1.5px',
            marginBottom: '8px',
            fontWeight: 700,
          }}>
            🥡 LUNCHBOX ({lunchbox.length}/{QUEST_COUNT})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {lunchbox.map((item, i) => (
              <div key={i} style={{
                background: 'rgba(251,191,36,0.12)',
                border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: '10px',
                padding: '6px 12px',
                fontFamily: fontFredoka,
                fontSize: '14px',
                color: '#fde68a',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                {item.emoji} {item.name}
              </div>
            ))}
            {/* Empty slots */}
            {Array.from({ length: QUEST_COUNT - lunchbox.length }).map((_, i) => (
              <div key={`empty-${i}`} style={{
                background: 'rgba(71,85,105,0.15)',
                border: '1px dashed rgba(71,85,105,0.4)',
                borderRadius: '10px',
                padding: '6px 12px',
                fontFamily: fontFredoka,
                fontSize: '14px',
                color: '#334155',
              }}>
                ?
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        height: '6px',
        background: 'rgba(71,85,105,0.3)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${(lunchbox.length / QUEST_COUNT) * 100}%`,
          background: 'linear-gradient(90deg, #7c3aed, #0ea5e9)',
          borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>

    </div>
  )
}
