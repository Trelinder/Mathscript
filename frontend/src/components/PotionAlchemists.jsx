/**
 * PotionAlchemists — fraction equivalence mini-game for 8–13-year-olds.
 *
 * A target beaker must be filled to an exact fraction by clicking/dragging
 * measuring cups labelled 1/4, 1/3, 1/2, 2/3, and 3/4.  The beaker's liquid
 * level updates instantly (optimistic UI) and glows green when the target is
 * reached exactly, or red on overfill.  Telemetry events are fired
 * asynchronously to POST /api/potion-alchemists/telemetry.
 *
 * Fill arithmetic is done with integer numerator/denominator to avoid
 * floating-point drift (e.g. 1/3 + 1/3 + 1/3 === 1 exactly).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { sendPotionAlchemistsTelemetry } from '../api/client'

// ── fraction helpers ──────────────────────────────────────────────────────────

function gcd(a, b) {
  while (b) { const t = b; b = a % b; a = t }
  return a
}

function addFractions(a, b) {
  const num = a.num * b.den + b.num * a.den
  const den = a.den * b.den
  const g = gcd(Math.abs(num), Math.abs(den))
  return { num: num / g, den: den / g }
}

function fracToFloat(f) {
  return f.num / f.den
}

function fracEqual(a, b) {
  // cross-multiply to avoid float comparison
  return a.num * b.den === b.num * a.den
}

function fracToString(f) {
  if (f.den === 1) return String(f.num)
  return `${f.num}/${f.den}`
}

// ── cup definitions ───────────────────────────────────────────────────────────

const CUPS = [
  { id: 'quarter',       label: '¼',   fraction: { num: 1, den: 4 },  color: '#3b82f6', emoji: '🔵' },
  { id: 'third',         label: '⅓',   fraction: { num: 1, den: 3 },  color: '#a855f7', emoji: '🟣' },
  { id: 'half',          label: '½',   fraction: { num: 1, den: 2 },  color: '#22c55e', emoji: '🟢' },
  { id: 'two_thirds',    label: '⅔',   fraction: { num: 2, den: 3 },  color: '#f97316', emoji: '🟠' },
  { id: 'three_quarters',label: '¾',   fraction: { num: 3, den: 4 },  color: '#ec4899', emoji: '🩷' },
]

// ── puzzles ───────────────────────────────────────────────────────────────────

const PUZZLES = [
  { target: { num: 1, den: 2  }, hint: 'Two 1/4 cups fill a 1/2 cup slot!'   },
  { target: { num: 1, den: 1  }, hint: 'Four 1/4 cups — or two halves!'       },
  { target: { num: 2, den: 3  }, hint: 'Two 1/3 cups reach 2/3!'              },
  { target: { num: 3, den: 4  }, hint: 'Three 1/4 cups equals 3/4!'           },
  { target: { num: 5, den: 6  }, hint: 'Try a 1/2 and a 1/3 together!'        },
  { target: { num: 7, den: 12 }, hint: 'Can you get there with 1/4 + 1/3?'    },
]

// ── beaker SVG path geometry ──────────────────────────────────────────────────
// viewBox 0 0 80 120; beaker inner fill height goes from y=100 (empty) to y=10 (full)
const BEAKER_INNER_HEIGHT = 90   // pixel range for fill
const BEAKER_INNER_TOP_Y = 10

// ── component ─────────────────────────────────────────────────────────────────

export default function PotionAlchemists({ sessionId, onComplete }) {
  const [puzzleIdx, setPuzzleIdx] = useState(0)
  const puzzle = PUZZLES[puzzleIdx % PUZZLES.length]
  const target = puzzle.target

  // current total poured as a reduced fraction
  const [poured, setPoured] = useState({ num: 0, den: 1 })
  // pour history for undo & telemetry
  const [history, setHistory] = useState([])
  // pour animations queued (so ripples don't overlap)
  const [ripple, setRipple] = useState(null)
  // completed state
  const [status, setStatus] = useState('playing')  // 'playing' | 'success' | 'overfill'
  // total pours across all puzzles for stats
  const [totalPours, setTotalPours] = useState(0)

  const startTimeRef = useRef(Date.now())
  const beakerLiquidRef = useRef(null)
  const beakerGlowRef = useRef(null)
  const successBannerRef = useRef(null)
  const cupRefs = useRef({})

  const pourFraction = fracToFloat(poured)
  const targetFraction = fracToFloat(target)

  // ── telemetry ────────────────────────────────────────────────────────────

  const fireTelemetry = useCallback((eventType, extra = {}) => {
    sendPotionAlchemistsTelemetry({
      event_type: eventType,
      session_id: sessionId,
      puzzle_index: puzzleIdx,
      target_fraction: fracToString(target),
      current_fill: fracToString(poured),
      elapsed_ms: Date.now() - startTimeRef.current,
      timestamp: Date.now(),
      ...extra,
    }).catch(() => { /* never block UI */ })
  }, [sessionId, puzzleIdx, target, poured])

  // ── beaker animation ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!beakerLiquidRef.current) return
    const fillY = BEAKER_INNER_TOP_Y + BEAKER_INNER_HEIGHT * (1 - Math.min(pourFraction, 1))
    const fillH = BEAKER_INNER_HEIGHT * Math.min(pourFraction, 1)
    gsap.to(beakerLiquidRef.current, {
      attr: { y: fillY, height: Math.max(0, fillH) },
      duration: 0.4,
      ease: 'power2.out',
    })
  }, [pourFraction])

  // glow on success / overfill
  useEffect(() => {
    if (!beakerGlowRef.current) return
    if (status === 'success') {
      gsap.to(beakerGlowRef.current, { opacity: 1, duration: 0.3 })
      gsap.from(beakerGlowRef.current, { scale: 0.92, duration: 0.4, ease: 'back.out(2)' })
    } else if (status === 'overfill') {
      gsap.to(beakerGlowRef.current, { opacity: 1, duration: 0.2 })
    } else {
      gsap.to(beakerGlowRef.current, { opacity: 0, duration: 0.25 })
    }
  }, [status])

  // ── pour a cup ───────────────────────────────────────────────────────────

  const handlePour = (cup) => {
    if (status !== 'playing') return

    const newPoured = addFractions(poured, cup.fraction)
    const newFloat = fracToFloat(newPoured)
    const newTotalPours = totalPours + 1

    setHistory(prev => [...prev, { cup, poured }])
    setPoured(newPoured)
    setTotalPours(newTotalPours)

    // ripple animation
    setRipple({ cupId: cup.id, color: cup.color })
    setTimeout(() => setRipple(null), 700)

    // cup bounce
    const cupEl = cupRefs.current[cup.id]
    if (cupEl) {
      gsap.from(cupEl, { y: -10, duration: 0.35, ease: 'bounce.out' })
    }

    let newStatus = 'playing'
    if (fracEqual(newPoured, target)) {
      newStatus = 'success'
      fireTelemetry('puzzle_complete', {
        cup_poured: cup.id,
        cup_fraction: fracToString(cup.fraction),
        pours_taken: newTotalPours,
        pour_history: [...history, { cup: cup.id, fraction: fracToString(cup.fraction) }].map(h => ({
          cup: h.cup?.id || h.cup,
          fraction: h.cup?.fraction ? fracToString(h.cup.fraction) : h.fraction,
        })),
      })
      setTimeout(() => {
        if (successBannerRef.current) {
          gsap.from(successBannerRef.current, { y: 20, opacity: 0, duration: 0.5, ease: 'power3.out' })
        }
      }, 30)
      setTimeout(() => nextPuzzle(), 2800)
    } else if (newFloat > 1) {
      newStatus = 'overfill'
      fireTelemetry('overfill', {
        cup_poured: cup.id,
        overfill_amount: fracToString(newPoured),
      })
    } else {
      fireTelemetry('pour', {
        cup_poured: cup.id,
        cup_fraction: fracToString(cup.fraction),
        fill_after: fracToString(newPoured),
      })
    }
    setStatus(newStatus)
  }

  // ── empty beaker ─────────────────────────────────────────────────────────

  const handleEmpty = () => {
    fireTelemetry('beaker_emptied', {
      fill_before: fracToString(poured),
      pours_wasted: history.length,
    })
    setPoured({ num: 0, den: 1 })
    setHistory([])
    setStatus('playing')
  }

  // ── next puzzle ──────────────────────────────────────────────────────────

  const nextPuzzle = () => {
    const next = puzzleIdx + 1
    if (next >= PUZZLES.length) {
      if (onComplete) onComplete()
      return
    }
    setPuzzleIdx(next)
    setPoured({ num: 0, den: 1 })
    setHistory([])
    setStatus('playing')
    startTimeRef.current = Date.now()
  }

  // ── derived UI values ────────────────────────────────────────────────────

  const fillPercent = Math.min(pourFraction / targetFraction, 1) * 100
  const isOverfill = pourFraction > 1
  const liquidColor = isOverfill
    ? '#ef4444'
    : status === 'success'
      ? '#22c55e'
      : '#8b5cf6'

  const fillY = BEAKER_INNER_TOP_Y + BEAKER_INNER_HEIGHT * (1 - Math.min(pourFraction, 1))
  const fillH = BEAKER_INNER_HEIGHT * Math.min(pourFraction, 1)

  // Target line position inside beaker (y coordinate)
  const targetLineY = BEAKER_INNER_TOP_Y + BEAKER_INNER_HEIGHT * (1 - Math.min(targetFraction, 1))

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Rajdhani', sans-serif",
      maxWidth: '540px',
      margin: '0 auto',
      padding: '16px',
      userSelect: 'none',
      WebkitUserSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '11px',
          letterSpacing: '2px',
          color: '#a855f7',
          marginBottom: '6px',
        }}>
          ⚗️ POTION ALCHEMISTS — Puzzle {puzzleIdx + 1}/{PUZZLES.length}
        </div>
        <div style={{ fontSize: '26px', fontWeight: 800, color: '#fde68a', lineHeight: 1.2 }}>
          Fill to <span style={{ color: '#a855f7' }}>{fracToString(target)}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
          {puzzle.hint}
        </div>
      </div>

      {/* Main layout: cups + beaker */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', justifyContent: 'center', flexWrap: 'wrap' }}>

        {/* Measuring cups column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '12px' }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '8px',
            letterSpacing: '2px',
            color: '#6b7280',
            textAlign: 'center',
            marginBottom: '4px',
          }}>
            CUPS
          </div>
          {CUPS.map((cup) => (
            <button
              key={cup.id}
              ref={el => { cupRefs.current[cup.id] = el }}
              onClick={() => handlePour(cup)}
              disabled={status !== 'playing'}
              title={`Pour ${fracToString(cup.fraction)}`}
              style={{
                width: '74px',
                background: status !== 'playing'
                  ? 'rgba(255,255,255,0.03)'
                  : `linear-gradient(180deg, ${cup.color}22, ${cup.color}44)`,
                border: `2px solid ${status !== 'playing' ? 'rgba(255,255,255,0.1)' : cup.color + '88'}`,
                borderRadius: '12px',
                padding: '8px 4px 6px',
                cursor: status !== 'playing' ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                transition: 'transform 0.1s, box-shadow 0.15s',
                boxShadow: ripple?.cupId === cup.id
                  ? `0 0 18px ${cup.color}99`
                  : 'none',
                opacity: status !== 'playing' ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (status === 'playing') e.currentTarget.style.transform = 'scale(1.07)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {/* Mini cup SVG */}
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                {/* cup body */}
                <path d="M6 6 L8 30 L28 30 L30 6 Z" fill={cup.color + '33'} stroke={cup.color} strokeWidth="1.5" strokeLinejoin="round" />
                {/* liquid inside at matching fraction */}
                <clipPath id={`cup-clip-${cup.id}`}>
                  <path d="M6 6 L8 30 L28 30 L30 6 Z" />
                </clipPath>
                <rect
                  x="6" y={6 + 24 * (1 - fracToFloat(cup.fraction))}
                  width="24" height={24 * fracToFloat(cup.fraction)}
                  fill={cup.color + 'bb'}
                  clipPath={`url(#cup-clip-${cup.id})`}
                />
                {/* label line */}
                <line
                  x1="9" y1={6 + 24 * (1 - fracToFloat(cup.fraction))}
                  x2="27" y2={6 + 24 * (1 - fracToFloat(cup.fraction))}
                  stroke={cup.color} strokeWidth="1" strokeDasharray="3,2"
                />
              </svg>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '13px',
                fontWeight: 900,
                color: cup.color,
              }}>
                {cup.label}
              </div>
            </button>
          ))}
        </div>

        {/* Beaker column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '8px',
            letterSpacing: '2px',
            color: '#6b7280',
            marginBottom: '4px',
          }}>
            BEAKER
          </div>

          <div style={{ position: 'relative' }}>
            {/* Outer glow ring — success/overfill */}
            <div
              ref={beakerGlowRef}
              style={{
                position: 'absolute',
                inset: '-8px',
                borderRadius: '20px',
                opacity: 0,
                background: status === 'overfill'
                  ? 'radial-gradient(ellipse at center, rgba(239,68,68,0.3), transparent 70%)'
                  : 'radial-gradient(ellipse at center, rgba(34,197,94,0.3), transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <svg
              width="100"
              height="140"
              viewBox="0 0 80 120"
              style={{ display: 'block', filter: 'drop-shadow(0 4px 12px rgba(139,92,246,0.3))' }}
            >
              {/* Beaker outer shape */}
              <path
                d="M12 8 L14 112 L66 112 L68 8 Z"
                fill="rgba(255,255,255,0.04)"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />

              {/* Clip path for liquid */}
              <clipPath id="beaker-clip">
                <path d="M12.5 8.5 L14.5 111.5 L65.5 111.5 L67.5 8.5 Z" />
              </clipPath>

              {/* Liquid fill — animated via ref */}
              <rect
                ref={beakerLiquidRef}
                x="12"
                y={fillY}
                width="56"
                height={Math.max(0, fillH)}
                fill={liquidColor + 'cc'}
                clipPath="url(#beaker-clip)"
              />

              {/* Ripple wave on top of liquid */}
              {ripple && (
                <ellipse
                  cx="40"
                  cy={fillY}
                  rx="22"
                  ry="4"
                  fill={ripple.color + '66'}
                  style={{ animation: 'ripple-fade 0.7s ease-out forwards' }}
                />
              )}

              {/* Target line */}
              <line
                x1="10" y1={targetLineY}
                x2="70" y2={targetLineY}
                stroke="#fbbf24"
                strokeWidth="2"
                strokeDasharray="5,3"
              />
              {/* Target label */}
              <text
                x="72" y={targetLineY + 4}
                fontFamily="Orbitron, sans-serif"
                fontSize="7"
                fill="#fbbf24"
                fontWeight="bold"
              >
                {fracToString(target)}
              </text>

              {/* Tick marks at 1/4 intervals */}
              {[0.25, 0.5, 0.75].map((tick) => {
                const tickY = BEAKER_INNER_TOP_Y + BEAKER_INNER_HEIGHT * (1 - tick)
                return (
                  <g key={tick}>
                    <line x1="10" y1={tickY} x2="18" y2={tickY} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                    <text x="2" y={tickY + 3} fontFamily="sans-serif" fontSize="5" fill="rgba(255,255,255,0.3)">
                      {tick === 0.25 ? '¼' : tick === 0.5 ? '½' : '¾'}
                    </text>
                  </g>
                )
              })}

              {/* Beaker outline on top (glass effect) */}
              <path
                d="M12 8 L14 112 L66 112 L68 8 Z"
                fill="none"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />

              {/* Glass highlight */}
              <line x1="16" y1="12" x2="18" y2="108" stroke="rgba(255,255,255,0.12)" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          {/* Current fill label */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '18px',
              fontWeight: 900,
              color: status === 'overfill' ? '#ef4444' : status === 'success' ? '#22c55e' : '#e0e0e0',
            }}>
              {fracToString(poured)}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
              {Math.round(fillPercent)}% full
            </div>
          </div>

          {/* Empty button */}
          {poured.num > 0 && status !== 'success' && (
            <button
              onClick={handleEmpty}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '12px', fontWeight: 700,
                color: '#6b7280',
                background: 'transparent',
                border: '1px solid rgba(107,114,128,0.3)',
                borderRadius: '8px',
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >
              🗑 Empty
            </button>
          )}
        </div>
      </div>

      {/* Overfill warning */}
      {status === 'overfill' && (
        <div style={{
          marginTop: '16px',
          padding: '12px 14px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.35)',
          borderRadius: '12px',
          textAlign: 'center',
          fontWeight: 700,
          color: '#fca5a5',
          fontSize: '14px',
        }}>
          💧 Beaker overflowed! Hit Empty and try a different mix.
        </div>
      )}

      {/* Success banner */}
      {status === 'success' && (
        <div
          ref={successBannerRef}
          style={{
            marginTop: '16px',
            padding: '18px 14px',
            background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(139,92,246,0.12))',
            border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: '14px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '6px' }}>✨</div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '13px', fontWeight: 800, color: '#22c55e', letterSpacing: '1px',
          }}>
            PERFECT MIX!
          </div>
          <div style={{ fontSize: '14px', color: '#e0e0e0', marginTop: '6px' }}>
            You filled exactly <strong style={{ color: '#a855f7' }}>{fracToString(target)}</strong>!
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
            Pours used: {history.length + 1}
          </div>
        </div>
      )}

      {/* CSS keyframe for ripple */}
      <style>{`
        @keyframes ripple-fade {
          0%   { opacity: 0.9; transform: scaleX(1);   }
          100% { opacity: 0;   transform: scaleX(1.5); }
        }
      `}</style>
    </div>
  )
}
