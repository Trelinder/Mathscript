/**
 * OrbitalEngineers — angles & geometry mini-game for ages 8–13.
 *
 * Students play as satellite engineers who must position their probe on the
 * correct orbit angle to relay a maths signal back to Earth. Each puzzle
 * shows a target angle on the dial; the player uses ◀ ▶ nudge buttons (or
 * drags the probe directly) to match it within the tolerance window.
 *
 * Five progressively harder puzzles per session:
 *   Easy   45° / 90° (multiples of 45)
 *   Medium 30° / 60° / 120° / 150° (multiples of 30)
 *   Hard   custom angles such as 135°, 225°, 315°, 270°
 *
 * Telemetry is fired asynchronously to POST /api/orbital-engineers/telemetry.
 * The UI never blocks on the network call.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { sendOrbitalEngineersTelemetry } from '../api/client'

// ── puzzle bank ───────────────────────────────────────────────────────────────

const PUZZLES = [
  { target: 45,  tolerance: 5,  hint: 'Think of cutting a right angle perfectly in half!' },
  { target: 90,  tolerance: 4,  hint: 'A right angle — like the corner of a square.' },
  { target: 135, tolerance: 4,  hint: '90° plus another 45°.' },
  { target: 60,  tolerance: 4,  hint: 'One-sixth of a full rotation.' },
  { target: 120, tolerance: 4,  hint: 'Double a 60° angle.' },
]

// ── geometry helpers ──────────────────────────────────────────────────────────

const DEG2RAD = Math.PI / 180

/** Normalise any angle to [0, 360). */
function normDeg(d) {
  return ((d % 360) + 360) % 360
}

/** Shortest signed distance between two angles on a circle. */
function angleDiff(a, b) {
  let d = normDeg(b) - normDeg(a)
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Cartesian position on a circle given centre, radius and angle (degrees, 0 = right). */
function polarToCart(cx, cy, r, angleDeg) {
  const rad = angleDeg * DEG2RAD
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

// ── SVG constants ─────────────────────────────────────────────────────────────

const CX = 150
const CY = 150
const ORBIT_R = 95
const PLANET_R = 22
const PROBE_R = 10

// ── sub-components ────────────────────────────────────────────────────────────

function TickMarks() {
  const ticks = []
  for (let a = 0; a < 360; a += 15) {
    const isMajor = a % 45 === 0
    const inner = polarToCart(CX, CY, ORBIT_R + (isMajor ? 10 : 5), a)
    const outer = polarToCart(CX, CY, ORBIT_R + (isMajor ? 18 : 10), a)
    ticks.push(
      <line key={a}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke={isMajor ? 'rgba(251,191,36,0.6)' : 'rgba(255,255,255,0.15)'}
        strokeWidth={isMajor ? 1.5 : 0.8}
        strokeLinecap="round"
      />
    )
    if (isMajor) {
      const lp = polarToCart(CX, CY, ORBIT_R + 28, a)
      ticks.push(
        <text key={`l${a}`} x={lp.x} y={lp.y}
          textAnchor="middle" dominantBaseline="central"
          fill="rgba(251,191,36,0.5)" fontSize="8" fontFamily="Orbitron, monospace"
        >{a}°</text>
      )
    }
  }
  return <>{ticks}</>
}

// ── main component ─────────────────────────────────────────────────────────────

export default function OrbitalEngineers({ sessionId, onComplete }) {
  const [puzzleIdx, setPuzzleIdx]   = useState(0)
  const [probeAngle, setProbeAngle] = useState(0)
  const [phase, setPhase]           = useState('playing')   // 'playing' | 'success' | 'done'
  const [showHint, setShowHint]     = useState(false)
  const [attempts, setAttempts]     = useState(0)
  const [startTs]                   = useState(() => Date.now())
  const svgRef  = useRef(null)
  const probeRef = useRef(null)
  const successRef = useRef(null)
  const isDragging = useRef(false)

  const puzzle = PUZZLES[puzzleIdx]

  // ── angle from SVG pointer event ──────────────────────────────────────────
  const angleFromEvent = useCallback((e) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const scaleX = 300 / rect.width
    const scaleY = 300 / rect.height
    const svgX = (clientX - rect.left) * scaleX
    const svgY = (clientY - rect.top)  * scaleY
    // SVG y grows downward; flip so 0° = right, angles increase counter-clockwise
    const rawRad = Math.atan2(CY - svgY, svgX - CX)
    return normDeg(rawRad / DEG2RAD)
  }, [])

  // ── nudge by fixed step ───────────────────────────────────────────────────
  const nudge = useCallback((delta) => {
    setProbeAngle(prev => normDeg(prev + delta))
  }, [])

  // ── telemetry ─────────────────────────────────────────────────────────────
  const fireTelemetry = useCallback((outcome) => {
    sendOrbitalEngineersTelemetry({
      session_id: sessionId,
      puzzle_index: puzzleIdx,
      target_angle: puzzle.target,
      final_angle: probeAngle,
      attempts,
      outcome,
      elapsed_ms: Date.now() - startTs,
    }).catch(() => { /* fire-and-forget */ })
  }, [sessionId, puzzleIdx, puzzle.target, probeAngle, attempts, startTs])

  // ── submit answer ─────────────────────────────────────────────────────────
  const handleCheck = useCallback(() => {
    setAttempts(a => a + 1)
    const diff = Math.abs(angleDiff(probeAngle, puzzle.target))
    if (diff <= puzzle.tolerance) {
      setPhase('success')
      fireTelemetry('correct')
      if (successRef.current) {
        gsap.fromTo(successRef.current,
          { scale: 0.3, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' }
        )
      }
    } else {
      // Wrong: visually shake the probe
      if (probeRef.current) {
        gsap.fromTo(probeRef.current,
          { x: -6 },
          { x: 0, duration: 0.4, ease: 'elastic.out(4, 0.3)' }
        )
      }
      setShowHint(true)
      fireTelemetry('wrong')
    }
  }, [probeAngle, puzzle, fireTelemetry])

  const handleNext = useCallback(() => {
    const next = puzzleIdx + 1
    if (next >= PUZZLES.length) {
      setPhase('done')
    } else {
      setPuzzleIdx(next)
      setProbeAngle(0)
      setPhase('playing')
      setShowHint(false)
      setAttempts(0)
    }
  }, [puzzleIdx])

  // ── drag handlers ─────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    setProbeAngle(angleFromEvent(e))
  }, [angleFromEvent])

  const onPointerMove = useCallback((e) => {
    if (!isDragging.current) return
    e.preventDefault()
    setProbeAngle(angleFromEvent(e))
  }, [angleFromEvent])

  const onPointerUp = useCallback(() => { isDragging.current = false }, [])

  useEffect(() => {
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [onPointerMove, onPointerUp])

  // ── completion ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(139,92,246,0.12))',
        border: '1px solid rgba(14,165,233,0.3)',
        borderRadius: '16px', padding: '28px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>🛰️</div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 800,
          color: '#38bdf8', letterSpacing: '1px', marginBottom: '8px',
        }}>ORBITAL SEQUENCE COMPLETE</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 600,
          color: '#e0e0e0', marginBottom: '20px',
        }}>
          All {PUZZLES.length} satellites locked in. Mission success, Engineer!
        </div>
        <button
          onClick={() => onComplete && onComplete(30)}
          style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700,
            letterSpacing: '1.5px', color: '#fff',
            background: 'linear-gradient(135deg, #0ea5e9, #7c3aed)',
            border: 'none', borderRadius: '10px',
            padding: '12px 28px', cursor: 'pointer',
          }}
        >
          COLLECT REWARD +30 GOLD
        </button>
      </div>
    )
  }

  // ── computed geometry ──────────────────────────────────────────────────────
  const probePos   = polarToCart(CX, CY, ORBIT_R, probeAngle)
  const targetPos  = polarToCart(CX, CY, ORBIT_R, puzzle.target)
  const diff = Math.abs(angleDiff(probeAngle, puzzle.target))
  const accuracy = Math.max(0, 100 - (diff / puzzle.tolerance) * 100)
  const isClose = diff <= puzzle.tolerance * 2.5

  // Gradient arc: draw a sector from 0 to probeAngle
  const arcPath = (() => {
    const large = normDeg(probeAngle) > 180 ? 1 : 0
    const ep = polarToCart(CX, CY, ORBIT_R, probeAngle)
    const sp = polarToCart(CX, CY, ORBIT_R, 0)
    return `M ${CX} ${CY} L ${sp.x} ${sp.y} A ${ORBIT_R} ${ORBIT_R} 0 ${large} 0 ${ep.x} ${ep.y} Z`
  })()

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(2,6,23,0.95), rgba(14,10,40,0.95))',
      border: '1px solid rgba(14,165,233,0.25)',
      borderRadius: '16px',
      padding: '16px',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: '#38bdf8' }}>
          🛰️ ORBITAL ENGINEERS
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', color: '#6b7280' }}>
          Puzzle {puzzleIdx + 1} / {PUZZLES.length}
        </div>
      </div>

      <div style={{
        fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 600,
        color: '#e0e0e0', marginBottom: '4px', textAlign: 'center',
      }}>
        Position the probe at <span style={{ color: '#fbbf24', fontWeight: 800 }}>{puzzle.target}°</span>
      </div>
      <div style={{ textAlign: 'center', marginBottom: '10px', fontSize: '12px', color: '#6b7280', fontFamily: "'Rajdhani', sans-serif" }}>
        Drag the probe or use ◀ ▶ to rotate. Hit <strong style={{ color: '#38bdf8' }}>Lock Orbit</strong> when ready.
      </div>

      {/* SVG dial */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
        <svg
          ref={svgRef}
          viewBox="0 0 300 300"
          width="260"
          height="260"
          style={{ touchAction: 'none', cursor: isDragging.current ? 'grabbing' : 'grab', maxWidth: '100%' }}
          onPointerDown={onPointerDown}
        >
          <defs>
            <radialGradient id="oe-planet" cx="40%" cy="35%">
              <stop offset="0%" stopColor="#60a5fa"/>
              <stop offset="60%" stopColor="#1d4ed8"/>
              <stop offset="100%" stopColor="#1e3a8a"/>
            </radialGradient>
            <radialGradient id="oe-probe" cx="35%" cy="30%">
              <stop offset="0%" stopColor="#fde68a"/>
              <stop offset="100%" stopColor="#f59e0b"/>
            </radialGradient>
            <filter id="oe-glow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Star field */}
          {[[30,20],[80,40],[200,30],[250,80],[40,200],[260,220],[130,260],[220,260],[70,270]].map(([sx,sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={Math.random() < 0.5 ? 1 : 1.5} fill="rgba(255,255,255,0.4)" />
          ))}

          {/* Angle sector fill */}
          <path d={arcPath} fill="rgba(14,165,233,0.07)" />

          {/* Orbit ring */}
          <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke="rgba(14,165,233,0.2)" strokeWidth="1" strokeDasharray="4 4"/>

          {/* Tick marks */}
          <TickMarks />

          {/* Target indicator */}
          <line
            x1={CX} y1={CY}
            x2={targetPos.x} y2={targetPos.y}
            stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.7"
          />
          <circle cx={targetPos.x} cy={targetPos.y} r={8} fill="rgba(251,191,36,0.15)" stroke="#fbbf24" strokeWidth="1.5" />
          <text x={targetPos.x} y={targetPos.y} textAnchor="middle" dominantBaseline="central"
            fill="#fbbf24" fontSize="7" fontFamily="Orbitron, monospace"
          >{puzzle.target}°</text>

          {/* Current angle line */}
          <line
            x1={CX} y1={CY}
            x2={probePos.x} y2={probePos.y}
            stroke={isClose ? '#22c55e' : '#38bdf8'} strokeWidth="1.5" opacity="0.6"
          />

          {/* 0° reference */}
          <line x1={CX} y1={CY} x2={CX + ORBIT_R} y2={CY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

          {/* Planet */}
          <circle cx={CX} cy={CY} r={PLANET_R} fill="url(#oe-planet)" />
          <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="central" fontSize="13">🌍</text>

          {/* Probe */}
          <g ref={probeRef}>
            <circle
              cx={probePos.x} cy={probePos.y} r={PROBE_R + 6}
              fill="transparent" style={{ cursor: 'grab' }}
            />
            <circle
              cx={probePos.x} cy={probePos.y} r={PROBE_R}
              fill={isClose ? 'rgba(34,197,94,0.3)' : 'rgba(14,165,233,0.25)'}
              stroke={isClose ? '#22c55e' : '#38bdf8'} strokeWidth="2"
              filter="url(#oe-glow)"
            />
            <text x={probePos.x} y={probePos.y} textAnchor="middle" dominantBaseline="central" fontSize="10">🛰️</text>
          </g>

          {/* Live angle label */}
          <text x={CX} y={CY + PLANET_R + 14}
            textAnchor="middle"
            fill={isClose ? '#22c55e' : '#38bdf8'}
            fontSize="11" fontFamily="Orbitron, monospace" fontWeight="bold"
          >
            {Math.round(normDeg(probeAngle))}°
          </text>

          {/* Success flash */}
          {phase === 'success' && (
            <g ref={successRef}>
              <circle cx={CX} cy={CY} r={110} fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.6"/>
              <text x={CX} y={CY - 115} textAnchor="middle" fill="#22c55e"
                fontSize="11" fontFamily="Orbitron, monospace" fontWeight="800"
              >✓ LOCKED</text>
            </g>
          )}
        </svg>
      </div>

      {/* Accuracy bar */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', color: '#6b7280', letterSpacing: '1px' }}>ALIGNMENT</span>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', color: isClose ? '#22c55e' : '#38bdf8' }}>
            {phase === 'playing' ? `${Math.round(accuracy)}%` : '✓ LOCKED'}
          </span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '3px',
            background: isClose
              ? 'linear-gradient(90deg, #22c55e, #86efac)'
              : 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
            width: `${accuracy}%`,
            transition: 'width 0.15s ease, background 0.3s',
          }}/>
        </div>
      </div>

      {/* Hint */}
      {showHint && phase === 'playing' && (
        <div style={{
          marginBottom: '10px', padding: '8px 12px',
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: '8px', fontSize: '13px', color: '#fde68a',
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 600,
        }}>
          💡 {puzzle.hint}
        </div>
      )}

      {/* Controls */}
      {phase === 'playing' && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {[[-15,'◀◀'], [-1,'◀'], [1,'▶'], [15,'▶▶']].map(([delta, label]) => (
            <button key={label} onClick={() => nudge(delta)} style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700,
              color: '#38bdf8', background: 'rgba(14,165,233,0.1)',
              border: '1px solid rgba(14,165,233,0.3)',
              borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
              transition: 'background 0.15s',
            }}>
              {label}
            </button>
          ))}
          <button onClick={handleCheck} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 800,
            letterSpacing: '1px', color: '#fff',
            background: 'linear-gradient(135deg, #0ea5e9, #7c3aed)',
            border: 'none', borderRadius: '8px',
            padding: '8px 18px', cursor: 'pointer',
          }}>
            🔒 LOCK ORBIT
          </button>
        </div>
      )}

      {phase === 'success' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700,
            color: '#22c55e', marginBottom: '12px',
          }}>
            ✅ Orbit locked at {puzzle.target}°! {puzzleIdx < PUZZLES.length - 1 ? 'Next satellite incoming…' : 'Final satellite secured!'}
          </div>
          <button onClick={handleNext} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 800,
            letterSpacing: '1px', color: '#fff',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            border: 'none', borderRadius: '8px',
            padding: '10px 24px', cursor: 'pointer',
          }}>
            {puzzleIdx < PUZZLES.length - 1 ? '→ NEXT SATELLITE' : '🏆 COMPLETE MISSION'}
          </button>
        </div>
      )}
    </div>
  )
}
