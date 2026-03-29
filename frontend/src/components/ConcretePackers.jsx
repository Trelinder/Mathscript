/**
 * ConcretePackers — "The Concrete Packers" mini-game for 5–7-year-olds.
 *
 * Teaches basic addition and place-value (making 10s) via a tactile cargo
 * drag-and-drop metaphor.  A problem like "8 + 4" is shown.  Loose cargo
 * blocks appear in a source tray; the child drags them into a conveyor belt
 * of slots.  When 10 blocks fill the belt they visually fuse into one
 * "10-Crate" and the belt resets to hold any remainder.  The game ends when
 * the correct total number of blocks have been placed.
 *
 * All state transitions are handled synchronously on the client (zero latency
 * optimistic UI).  Telemetry events are fired asynchronously to
 * POST /api/concrete-packers/telemetry without ever blocking the UI.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { sendConcretePackersTelemetry } from '../api/client'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse "8 + 4", "3+7", "5 + 5" → { a, b, total } */
function parseEquation(eq) {
  const m = String(eq).match(/(\d+)\s*\+\s*(\d+)/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    return { a, b, total: a + b }
  }
  return { a: 5, b: 5, total: 10 }
}

/** Generate an array of N unique block ids */
function makeBlocks(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `blk-${i}`, placed: false }))
}

// ── palette ───────────────────────────────────────────────────────────────────
const BELT_SLOTS = 10          // belt always holds exactly 10 slots
const BLOCK_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f59e0b', // amber
]

// ── component ─────────────────────────────────────────────────────────────────
export default function ConcretePackers({ equation = '8 + 4', sessionId, onComplete }) {
  const { a, b, total } = parseEquation(equation)

  // source tray: array of block-ids not yet placed
  const [sourceTray, setSourceTray] = useState(() => makeBlocks(total))
  // conveyor belt: 10 slots; each is null or a blockId
  const [beltSlots, setBeltSlots] = useState(() => Array(BELT_SLOTS).fill(null))
  // finished 10-crates
  const [crates, setCrates] = useState([])
  // blocks that have been placed in *any* slot (placed OR crated)
  const [placedCount, setPlacedCount] = useState(0)
  // which source block is being dragged
  const [dragging, setDragging] = useState(null)
  // drag position for ghost element (pointer-move)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  // completed flag
  const [completed, setCompleted] = useState(false)
  // feedback message
  const [message, setMessage] = useState('')

  const startTimeRef = useRef(Date.now())
  const fusedRef = useRef(null)      // ref to last-fused crate DOM node for GSAP
  const completionRef = useRef(null) // ref to completion banner

  // fire telemetry without blocking
  const fireTelemetry = useCallback((eventType, extra = {}) => {
    sendConcretePackersTelemetry({
      event_type: eventType,
      session_id: sessionId,
      equation,
      correct_answer: total,
      placed_count: placedCount,
      elapsed_ms: Date.now() - startTimeRef.current,
      timestamp: Date.now(),
      ...extra,
    }).catch(() => { /* swallow — telemetry must never block UI */ })
  }, [sessionId, equation, total, placedCount])

  // ── drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = (blockId, e) => {
    e.preventDefault()
    setDragging(blockId)
    const touch = e.touches ? e.touches[0] : e
    setDragPos({ x: touch.clientX, y: touch.clientY })
    fireTelemetry('drag_start', { block_id: blockId })
  }

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return
    const touch = e.touches ? e.touches[0] : e
    setDragPos({ x: touch.clientX, y: touch.clientY })
  }, [dragging])

  const handlePointerUp = useCallback(() => {
    if (!dragging) return
    setDragging(null)
    fireTelemetry('drag_cancel', { block_id: dragging })
  }, [dragging, fireTelemetry])

  // attach global listeners only while dragging
  useEffect(() => {
    if (!dragging) return
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove, { passive: false })
    window.addEventListener('touchend', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [dragging, handlePointerMove, handlePointerUp])

  // ── drop onto a belt slot ────────────────────────────────────────────────

  const handleSlotDrop = (slotIdx) => {
    if (!dragging) return
    if (beltSlots[slotIdx] !== null) {
      // slot already occupied — ignore
      fireTelemetry('slot_occupied', { slot_index: slotIdx, block_id: dragging })
      setDragging(null)
      return
    }

    // remove block from source tray
    setSourceTray(prev => prev.filter(b => b.id !== dragging))

    const newSlots = [...beltSlots]
    newSlots[slotIdx] = dragging
    const newPlacedCount = placedCount + 1

    fireTelemetry('block_placed', {
      block_id: dragging,
      slot_index: slotIdx,
      belt_after: newSlots.map(s => s ?? null),
    })

    const filledSlots = newSlots.filter(Boolean).length

    if (filledSlots === BELT_SLOTS) {
      // ── fuse to 10-Crate ────────────────────────────────────────────────
      const newCrates = [...crates, { id: `crate-${crates.length}` }]
      setCrates(newCrates)
      setBeltSlots(Array(BELT_SLOTS).fill(null))
      setPlacedCount(newPlacedCount)
      setDragging(null)
      setMessage('🚂 10-Crate packed! Keep loading!')

      fireTelemetry('fuse_to_crate', {
        crate_number: newCrates.length,
        placed_count_after: newPlacedCount,
      })

      // GSAP bounce on new crate
      setTimeout(() => {
        if (fusedRef.current) {
          gsap.from(fusedRef.current, { scale: 0.3, opacity: 0, duration: 0.45, ease: 'back.out(1.8)' })
        }
      }, 30)

      // Check completion (all blocks placed)
      if (newPlacedCount === total) {
        handleCompletion(newPlacedCount, newCrates.length)
      }
    } else {
      setBeltSlots(newSlots)
      setPlacedCount(newPlacedCount)
      setDragging(null)

      if (newPlacedCount === total) {
        handleCompletion(newPlacedCount, crates.length)
      }
    }
  }

  const handleCompletion = (placed, crateCount) => {
    setCompleted(true)
    fireTelemetry('puzzle_complete', {
      placed_count: placed,
      crate_count: crateCount,
      elapsed_ms: Date.now() - startTimeRef.current,
    })
    setTimeout(() => {
      if (completionRef.current) {
        gsap.from(completionRef.current, { y: 30, opacity: 0, duration: 0.6, ease: 'power3.out' })
      }
    }, 30)
    setTimeout(() => { if (onComplete) onComplete() }, 3200)
  }

  // ── reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setSourceTray(makeBlocks(total))
    setBeltSlots(Array(BELT_SLOTS).fill(null))
    setCrates([])
    setPlacedCount(0)
    setCompleted(false)
    setMessage('')
    startTimeRef.current = Date.now()
    fireTelemetry('reset')
  }

  // ── computed style helpers ───────────────────────────────────────────────
  const blockColor = (blockId) => {
    const idx = parseInt((blockId || '0').replace(/\D/g, ''), 10) % BLOCK_COLORS.length
    return BLOCK_COLORS[idx]
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        padding: '16px',
        fontFamily: "'Rajdhani', sans-serif",
        maxWidth: '520px',
        margin: '0 auto',
      }}
      onMouseMove={handlePointerMove}
      onTouchMove={handlePointerMove}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '11px',
          letterSpacing: '2px',
          color: '#f97316',
          marginBottom: '6px',
        }}>
          🏗️ CONCRETE PACKERS
        </div>
        <div style={{
          fontSize: '26px',
          fontWeight: 800,
          color: '#fde68a',
          lineHeight: 1.2,
        }}>
          {a} + {b} = ?
        </div>
        <div style={{
          fontSize: '13px',
          color: '#9ca3af',
          marginTop: '4px',
        }}>
          Drag blocks onto the belt! Fill 10 to pack a crate.
        </div>
      </div>

      {/* 10-Crates row */}
      {crates.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
          {crates.map((crate, i) => (
            <div
              key={crate.id}
              ref={i === crates.length - 1 ? fusedRef : null}
              title="10-Crate"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: '3px solid #fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                boxShadow: '0 4px 14px rgba(245,158,11,0.4)',
                color: '#fff',
              }}
            >
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '18px', fontWeight: 900 }}>10</div>
              <div style={{ fontSize: '9px', letterSpacing: '1px', color: '#fef3c7' }}>CRATE</div>
            </div>
          ))}
        </div>
      )}

      {/* Conveyor Belt */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '2px solid rgba(249,115,22,0.3)',
        borderRadius: '14px',
        padding: '12px 10px',
        marginBottom: '18px',
        position: 'relative',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '8px',
          letterSpacing: '2px',
          color: '#f97316',
          textAlign: 'center',
          marginBottom: '10px',
        }}>
          ▶ CONVEYOR BELT ({beltSlots.filter(Boolean).length}/10)
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {beltSlots.map((occupant, slotIdx) => (
            <div
              key={slotIdx}
              onMouseUp={() => handleSlotDrop(slotIdx)}
              onTouchEnd={(e) => { e.preventDefault(); handleSlotDrop(slotIdx) }}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                border: occupant
                  ? `2px solid ${blockColor(occupant)}`
                  : dragging
                    ? '2px dashed rgba(249,115,22,0.6)'
                    : '2px dashed rgba(255,255,255,0.15)',
                background: occupant ? blockColor(occupant) + '33' : 'rgba(255,255,255,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 0.2s, background 0.2s',
                cursor: dragging && !occupant ? 'copy' : 'default',
              }}
            >
              {occupant && (
                <div style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '5px',
                  background: blockColor(occupant),
                  boxShadow: `0 2px 8px ${blockColor(occupant)}88`,
                }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Source Tray */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px',
        padding: '12px 10px',
        marginBottom: '14px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '8px',
          letterSpacing: '2px',
          color: '#9ca3af',
          textAlign: 'center',
          marginBottom: '10px',
        }}>
          CARGO YARD — drag blocks above ↑
        </div>
        {sourceTray.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4b5563', fontSize: '13px', padding: '8px 0' }}>
            All blocks loaded!
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {sourceTray.map((blk) => (
              <div
                key={blk.id}
                onMouseDown={(e) => handleDragStart(blk.id, e)}
                onTouchStart={(e) => { e.preventDefault(); handleDragStart(blk.id, e) }}
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '9px',
                  background: blockColor(blk.id),
                  boxShadow: `0 3px 10px ${blockColor(blk.id)}66`,
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: dragging === blk.id ? 0.35 : 1,
                  transform: dragging === blk.id ? 'scale(0.9)' : 'scale(1)',
                  transition: 'opacity 0.15s, transform 0.15s',
                  border: '2px solid rgba(255,255,255,0.15)',
                }}
              >
                <div style={{ width: '18px', height: '18px', background: 'rgba(255,255,255,0.25)', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px',
        }}>
          <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: "'Rajdhani', sans-serif" }}>
            Progress
          </span>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>
            {placedCount}/{total}
          </span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(placedCount / total) * 100}%`,
            background: 'linear-gradient(90deg, #f97316, #fbbf24)',
            borderRadius: '3px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Feedback message */}
      {message && !completed && (
        <div style={{
          textAlign: 'center', fontSize: '14px', fontWeight: 700,
          color: '#fbbf24', marginBottom: '10px',
        }}>
          {message}
        </div>
      )}

      {/* Completion banner */}
      {completed && (
        <div
          ref={completionRef}
          style={{
            textAlign: 'center',
            padding: '18px 14px',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(251,191,36,0.12))',
            border: '1px solid rgba(34,197,94,0.35)',
            borderRadius: '14px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '6px' }}>🎉</div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '13px', fontWeight: 800, color: '#22c55e', letterSpacing: '1px',
          }}>
            CARGO PACKED!
          </div>
          <div style={{ fontSize: '14px', color: '#e0e0e0', marginTop: '6px' }}>
            {a} + {b} = <strong style={{ color: '#fbbf24' }}>{total}</strong>
          </div>
          {crates.length > 0 && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
              {crates.length} × 10-Crate{crates.length > 1 ? 's' : ''} + {total % 10} loose block{total % 10 !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Reset button */}
      {!completed && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleReset}
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '12px', fontWeight: 700,
              color: '#6b7280',
              background: 'transparent',
              border: '1px solid rgba(107,114,128,0.3)',
              borderRadius: '8px',
              padding: '7px 18px',
              cursor: 'pointer',
            }}
          >
            ↺ Reset
          </button>
        </div>
      )}

      {/* Ghost drag element — follows pointer */}
      {dragging && (
        <div
          style={{
            position: 'fixed',
            left: dragPos.x - 21,
            top: dragPos.y - 21,
            width: '42px',
            height: '42px',
            borderRadius: '9px',
            background: blockColor(dragging),
            boxShadow: `0 6px 20px ${blockColor(dragging)}88`,
            pointerEvents: 'none',
            zIndex: 9999,
            opacity: 0.9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.3)',
          }}
        >
          <div style={{ width: '18px', height: '18px', background: 'rgba(255,255,255,0.3)', borderRadius: '4px' }} />
        </div>
      )}
    </div>
  )
}
