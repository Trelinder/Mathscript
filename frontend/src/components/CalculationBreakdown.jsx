import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { parseArithmeticSteps } from '../utils/parseArithmeticSteps'

/**
 * CalculationBreakdown
 *
 * Renders a stylised step-by-step arithmetic breakdown derived from a raw
 * math expression string.  Used on the Quest victory screen to show the
 * player exactly how the winning calculation was evaluated.
 *
 * Props
 * ─────
 *   mathProblem  {string}  – the user-typed equation (e.g. "5 * 6 * 6")
 *   heroColor    {string}  – accent colour that matches the chosen hero
 */
export default function CalculationBreakdown({ mathProblem, heroColor = '#a855f7' }) {
  const containerRef = useRef(null)
  const steps = parseArithmeticSteps(mathProblem)

  // Nothing to show for algebra, single numbers, or empty input
  if (steps.length === 0) return null

  const finalResult = steps[steps.length - 1].result

  return (
    <CalculationBreakdownInner
      steps={steps}
      finalResult={finalResult}
      heroColor={heroColor}
      containerRef={containerRef}
    />
  )
}

// Separate inner component so the animation hook always runs the same number
// of times regardless of whether steps is empty (hooks must not be called
// conditionally).
function CalculationBreakdownInner({ steps, finalResult, heroColor, containerRef }) {
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { opacity: 0, y: 18, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'power2.out', delay: 0.15 }
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{
        marginTop: '16px',
        padding: '16px 18px',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.07), rgba(0,212,255,0.05))',
        border: `1px solid ${heroColor}44`,
        borderRadius: '14px',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Section heading */}
      <div
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '2px',
          color: heroColor,
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: `${heroColor}22`,
            border: `1px solid ${heroColor}55`,
            fontSize: '11px',
            flexShrink: 0,
          }}
        >
          🧮
        </span>
        CALCULATION BREAKDOWN
      </div>

      {/* Step list */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {steps.map((s) => (
          <li
            key={s.stepNum}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {/* Step number badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: `${heroColor}22`,
                border: `1px solid ${heroColor}55`,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '9px',
                fontWeight: 700,
                color: heroColor,
              }}
            >
              {s.stepNum}
            </span>

            {/* Equation pill */}
            <span
              style={{
                fontFamily: "'Patrick Hand', 'Rajdhani', sans-serif",
                fontSize: '15px',
                fontWeight: 600,
                color: '#e2e8f0',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '3px 10px',
              }}
            >
              {/* Left operand */}
              <span style={{ color: '#e2e8f0' }}>{fmtDisplay(s.left)}</span>
              {' '}
              {/* Operator highlighted with hero accent */}
              <span
                style={{
                  color: heroColor,
                  fontWeight: 700,
                  fontSize: '17px',
                  lineHeight: 1,
                }}
              >
                {s.op}
              </span>
              {' '}
              {/* Right operand */}
              <span style={{ color: '#e2e8f0' }}>{fmtDisplay(s.right)}</span>
              {' = '}
              {/* Result — bold, slightly larger */}
              <span
                style={{
                  color: '#fbbf24',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {fmtDisplay(s.result)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Final answer banner */}
      <div
        style={{
          marginTop: '14px',
          padding: '8px 12px',
          background: `${heroColor}18`,
          border: `1px solid ${heroColor}44`,
          borderRadius: '9px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '16px' }}>⭐</span>
        <span
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            color: heroColor,
            letterSpacing: '1px',
          }}
        >
          ANSWER:
        </span>
        <span
          style={{
            fontFamily: "'Patrick Hand', 'Rajdhani', sans-serif",
            fontSize: '18px',
            fontWeight: 700,
            color: '#fbbf24',
          }}
        >
          {fmtDisplay(finalResult)}
        </span>
      </div>
    </div>
  )
}

/**
 * Format a number for inline display: integers without decimal point,
 * decimals with at most 4 significant decimal places, no trailing zeros.
 *
 * @param {number} n
 * @returns {string}
 */
function fmtDisplay(n) {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n)) return String(n)
  return parseFloat(n.toFixed(4)).toString()
}
