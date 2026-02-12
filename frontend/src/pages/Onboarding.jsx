import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const PARTICLES = ['✨', '⭐', '🎮', '🗡️', '🛡️', '💎', '🏆', '🔮']

export default function Onboarding({ onStart }) {
  const containerRef = useRef(null)
  const rocketRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (rocketRef.current) {
      gsap.fromTo(rocketRef.current,
        { y: -100, rotation: 360, opacity: 0 },
        { y: 0, rotation: 0, opacity: 1, duration: 1, ease: 'bounce.out' }
      )
    }

    const particles = []
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div')
      p.textContent = PARTICLES[Math.floor(Math.random() * PARTICLES.length)]
      p.style.cssText = `position:absolute;font-size:${16 + Math.random() * 20}px;pointer-events:none;opacity:0;`
      container.appendChild(p)
      particles.push(p)
      gsap.set(p, {
        x: Math.random() * (container.offsetWidth || 800),
        y: Math.random() * (container.offsetHeight || 600),
      })
      gsap.to(p, {
        opacity: 0.3 + Math.random() * 0.4,
        y: `-=${50 + Math.random() * 100}`,
        x: `+=${(Math.random() - 0.5) * 100}`,
        duration: 3 + Math.random() * 4,
        repeat: -1, yoyo: true, ease: 'sine.inOut',
        delay: Math.random() * 3,
      })
    }
    return () => particles.forEach(p => p.remove())
  }, [])

  const steps = [
    { icon: '🦸', text: 'Choose a Hero to guide you through the Math Realms.' },
    { icon: '⚔️', text: 'Fight Math Bosses by turning scary problems into fun stories.' },
    { icon: '🪙', text: 'Earn Gold to buy legendary gear in the Hero Shop.' },
    { icon: '🧠', text: 'Level Up your brain!' },
  ]

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh', background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      padding: '50px 20px 40px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(20px, 4vw, 36px)',
          color: '#4ecca3', textShadow: '0 0 20px rgba(78,204,163,0.5), 0 4px 0 #2a9d6a',
        }}>THE MATH SCRIPT</div>
        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(10px, 1.5vw, 14px)',
          color: '#e94560', textShadow: '0 0 10px rgba(233,69,96,0.4)',
        }}>ULTIMATE QUEST</div>
      </div>

      <div ref={rocketRef} style={{ fontSize: '60px', marginBottom: '10px' }}>🚀</div>

      <div style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(10px, 1.5vw, 14px)',
        color: '#f0e68c', margin: '20px 0 30px', textAlign: 'center', lineHeight: '2.2',
      }}>
        Your mission, should you choose to accept it:
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 40px 0', maxWidth: '600px', width: '100%' }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            fontSize: '16px', color: '#ccc', padding: '12px 20px',
            borderLeft: '3px solid #4ecca3', marginBottom: '12px',
            background: 'rgba(78,204,163,0.08)', borderRadius: '0 8px 8px 0',
          }}>
            <span style={{ marginRight: '12px', fontSize: '20px' }}>{step.icon}</span>
            {step.text}
          </li>
        ))}
      </ul>

      <button
        onClick={onStart}
        style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '16px', color: '#fff',
          background: 'linear-gradient(180deg, #4ecca3, #2a9d6a)', border: '3px solid #1a7a52',
          borderRadius: '8px', padding: '18px 40px', cursor: 'pointer',
          boxShadow: '0 4px 0 #1a7a52, 0 6px 20px rgba(78,204,163,0.3)',
          textTransform: 'uppercase',
        }}
        onMouseDown={e => { e.target.style.transform = 'translateY(4px)'; e.target.style.boxShadow = '0 0 0 #1a7a52' }}
        onMouseUp={e => { e.target.style.transform = ''; e.target.style.boxShadow = '' }}
      >
        Start My First Mission
      </button>
    </div>
  )
}
