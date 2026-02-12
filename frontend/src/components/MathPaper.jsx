import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

export default function MathPaper({ steps, activeStep, color }) {
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

        {steps.map((step, i) => {
          const isVisible = i <= activeStep
          const isAnswer = step.toLowerCase().startsWith('answer:')
          return (
            <div
              key={i}
              ref={el => stepRefs.current[i] = el}
              style={{
                opacity: isVisible ? 1 : 0.15,
                paddingLeft: '48px',
                paddingRight: '8px',
                marginBottom: '8px',
                lineHeight: '32px',
                transition: 'opacity 0.3s',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <span style={{
                fontFamily: "'Patrick Hand', cursive, sans-serif",
                fontSize: isAnswer ? '16px' : '14px',
                color: isAnswer ? '#e74c3c' : color || '#2c3e50',
                fontWeight: isAnswer ? 700 : 600,
                minWidth: '24px',
                flexShrink: 0,
              }}>
                {isAnswer ? '★' : `${i + 1}.`}
              </span>
              <span style={{
                fontFamily: "'Patrick Hand', 'Caveat', cursive, sans-serif",
                fontSize: isAnswer ? '17px' : '15px',
                color: isAnswer ? '#c0392b' : '#34495e',
                fontWeight: isAnswer ? 700 : 400,
                textDecoration: isAnswer ? 'underline' : 'none',
                textDecorationColor: isAnswer ? '#e74c3c' : undefined,
              }}>
                {step}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
