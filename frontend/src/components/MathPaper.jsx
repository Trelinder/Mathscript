import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export default function MathPaper({ steps, activeStep, color, isFinalSegment }) {
  const paperRef = useRef(null)
  const stepRefs = useRef([])

  useEffect(() => {
    if (paperRef.current) {
      gsap.fromTo(paperRef.current,
        { opacity: 0, y: 20, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power2.out' }
      )
    }
  }, [])

  useEffect(() => {
    if (activeStep >= 0 && activeStep < steps.length && stepRefs.current[activeStep]) {
      gsap.fromTo(stepRefs.current[activeStep],
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out' }
      )
    }
  }, [activeStep])

  if (!steps || steps.length === 0) return null

  const solvingSteps = steps.filter(s => !s.toLowerCase().startsWith('answer:'))
  const answerStep = steps.find(s => s.toLowerCase().startsWith('answer:'))

  const visibleSteps = solvingSteps.slice(0, activeStep + 1)

  if (visibleSteps.length === 0 && !(isFinalSegment && answerStep)) return null

  return (
    <div ref={paperRef} style={{
      background: 'linear-gradient(180deg, #fffef5 0%, #faf8e8 100%)',
      borderRadius: '10px',
      padding: '18px 20px',
      margin: '12px 0',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15), inset 0 0 30px rgba(0,0,0,0.03)',
      position: 'relative',
      overflow: 'hidden',
      border: '1px solid #e0dcc8',
    }}>
      <div style={{
        position: 'absolute',
        left: '42px',
        top: 0,
        bottom: 0,
        width: '2px',
        background: '#f0a0a0',
        opacity: 0.5,
      }} />

      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, #c8e0f0 31px, #c8e0f0 32px)',
        backgroundSize: '100% 32px',
        opacity: 0.4,
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          fontFamily: "'Patrick Hand', 'Caveat', cursive, sans-serif",
          fontSize: '16px',
          fontWeight: 700,
          color: '#2c3e50',
          marginBottom: '12px',
          paddingLeft: '48px',
          borderBottom: '2px solid #e0dcc8',
          paddingBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '18px' }}>📝</span>
          How to Solve It:
        </div>

        {visibleSteps.map((step, i) => (
          <div
            key={i}
            ref={el => stepRefs.current[i] = el}
            style={{
              paddingLeft: '48px',
              paddingRight: '8px',
              marginBottom: '8px',
              lineHeight: '32px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span style={{
              fontFamily: "'Patrick Hand', cursive, sans-serif",
              fontSize: '14px',
              color: color || '#2c3e50',
              fontWeight: 600,
              minWidth: '24px',
              flexShrink: 0,
            }}>
              {`${i + 1}.`}
            </span>
            <span style={{
              fontFamily: "'Patrick Hand', 'Caveat', cursive, sans-serif",
              fontSize: '15px',
              color: '#34495e',
              fontWeight: 400,
            }}>
              {step}
            </span>
          </div>
        ))}

        {isFinalSegment && answerStep && (
          <div style={{
            paddingLeft: '48px',
            paddingRight: '8px',
            marginTop: '4px',
            lineHeight: '32px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            borderTop: '2px dashed #e0dcc8',
            paddingTop: '8px',
          }}>
            <span style={{
              fontFamily: "'Patrick Hand', cursive, sans-serif",
              fontSize: '16px',
              color: '#e74c3c',
              fontWeight: 700,
              minWidth: '24px',
              flexShrink: 0,
            }}>
              ★
            </span>
            <span style={{
              fontFamily: "'Patrick Hand', 'Caveat', cursive, sans-serif",
              fontSize: '17px',
              color: '#c0392b',
              fontWeight: 700,
              textDecoration: 'underline',
              textDecorationColor: '#e74c3c',
            }}>
              {answerStep}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
