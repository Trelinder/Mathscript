import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

const PARTICLES = ['✨', '⭐', '🎮', '🗡️', '🛡️', '💎', '🏆', '🔮', '⚡', '🔥', '🌟', '💫']

const HEROES = [
  { name: 'Wizard', img: '/images/hero-wizard.png', color: '#7B1FA2' },
  { name: 'Goku', img: '/images/hero-goku.png', color: '#FF6F00' },
  { name: 'Ninja', img: '/images/hero-ninja.png', color: '#37474F' },
  { name: 'Princess', img: '/images/hero-princess.png', color: '#E91E63' },
  { name: 'Hulk', img: '/images/hero-hulk.png', color: '#2E7D32' },
  { name: 'Spider-Man', img: '/images/hero-spiderman.png', color: '#D32F2F' },
  { name: 'Miles Morales', img: '/images/hero-miles.png', color: '#B71C1C' },
  { name: 'Storm', img: '/images/hero-storm.png', color: '#1565C0' },
]

export default function Onboarding({ onStart }) {
  const containerRef = useRef(null)
  const titleRef = useRef(null)
  const subtitleRef = useRef(null)
  const heroRowRef = useRef(null)
  const missionRef = useRef(null)
  const stepsRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })

    tl.from(titleRef.current, { y: -40, scale: 0.7, duration: 0.6, ease: 'back.out(1.7)' })
    .from(subtitleRef.current, { y: -20, duration: 0.4 }, '-=0.3')

    const heroEls = heroRowRef.current?.children
    if (heroEls) {
      tl.from(Array.from(heroEls), { y: 60, scale: 0.3, rotation: -20, duration: 0.5, ease: 'back.out(1.4)', stagger: 0.08 }, '-=0.2')
    }

    tl.from(missionRef.current, { y: 15, duration: 0.4 }, '-=0.1')

    const stepEls = stepsRef.current?.children
    if (stepEls) {
      tl.from(Array.from(stepEls), { x: -40, duration: 0.3, stagger: 0.1 }, '-=0.2')
    }

    tl.from(buttonRef.current, { y: 20, scale: 0.8, duration: 0.4, ease: 'elastic.out(1, 0.5)' }, '-=0.1')

    if (heroEls) {
      Array.from(heroEls).forEach((el, i) => {
        gsap.to(el, {
          y: -8 - Math.random() * 8, duration: 1.5 + Math.random() * 1,
          ease: 'sine.inOut', repeat: -1, yoyo: true, delay: i * 0.3,
        })
      })
    }

    gsap.to(titleRef.current, {
      textShadow: '0 0 30px rgba(78,204,163,0.8), 0 4px 0 #2a9d6a',
      duration: 2, ease: 'sine.inOut', repeat: -1, yoyo: true,
    })

    const particles = []
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div')
      p.textContent = PARTICLES[Math.floor(Math.random() * PARTICLES.length)]
      p.style.cssText = `position:absolute;font-size:${14 + Math.random() * 24}px;pointer-events:none;opacity:0;z-index:0;`
      container.appendChild(p)
      particles.push(p)
      const startX = Math.random() * (container.offsetWidth || 800)
      const startY = Math.random() * (container.offsetHeight || 600)
      gsap.set(p, { x: startX, y: startY })
      gsap.to(p, {
        opacity: 0.2 + Math.random() * 0.4,
        y: `-=${40 + Math.random() * 80}`,
        x: `+=${(Math.random() - 0.5) * 120}`,
        rotation: Math.random() * 360,
        duration: 3 + Math.random() * 5,
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
      padding: '40px 20px 40px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'radial-gradient(circle at 20% 80%, rgba(78,204,163,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(233,69,96,0.06) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', marginBottom: '8px', position: 'relative', zIndex: 1 }}>
        <div ref={titleRef} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(22px, 4.5vw, 40px)',
          color: '#4ecca3', textShadow: '0 0 20px rgba(78,204,163,0.5), 0 4px 0 #2a9d6a',
          letterSpacing: '2px',
        }}>THE MATH SCRIPT</div>
        <div ref={subtitleRef} style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(10px, 1.5vw, 16px)',
          color: '#e94560', textShadow: '0 0 10px rgba(233,69,96,0.4)',
          marginTop: '4px',
        }}>ULTIMATE QUEST</div>
      </div>

      <div ref={heroRowRef} className="onboarding-hero-row" style={{
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        gap: 'clamp(6px, 2vw, 16px)', margin: '20px 0 24px',
        position: 'relative', zIndex: 1, flexWrap: 'wrap',
      }}>
        {HEROES.map((h) => (
          <div key={h.name} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
          }}>
            <div className="onboarding-hero-circle" style={{
              width: 'clamp(60px, 12vw, 100px)', height: 'clamp(60px, 12vw, 100px)',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${h.color}33, ${h.color}11)`,
              border: `3px solid ${h.color}66`,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${h.color}44, inset 0 0 15px ${h.color}22`,
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = `0 0 30px ${h.color}88` }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <img src={h.img} alt={h.name} style={{
                width: '85%', height: '85%', objectFit: 'contain',
              }} />
            </div>
            <div className="onboarding-hero-name" style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 'clamp(6px, 1vw, 9px)',
              color: h.color,
              textShadow: `0 0 6px ${h.color}66`,
              textAlign: 'center',
            }}>{h.name}</div>
          </div>
        ))}
      </div>

      <div ref={missionRef} style={{
        fontFamily: "'Press Start 2P', monospace", fontSize: 'clamp(10px, 1.5vw, 14px)',
        color: '#f0e68c', margin: '10px 0 24px', textAlign: 'center', lineHeight: '2.2',
        position: 'relative', zIndex: 1,
      }}>
        Your mission, should you choose to accept it:
      </div>

      <ul ref={stepsRef} style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', maxWidth: '600px', width: '100%', position: 'relative', zIndex: 1 }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            fontSize: '16px', color: '#ccc', padding: '12px 20px',
            borderLeft: '3px solid #4ecca3', marginBottom: '12px',
            background: 'rgba(78,204,163,0.08)', borderRadius: '0 8px 8px 0',
            transition: 'background 0.2s, transform 0.2s',
            cursor: 'default',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(78,204,163,0.16)'; e.currentTarget.style.transform = 'translateX(6px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(78,204,163,0.08)'; e.currentTarget.style.transform = '' }}
          >
            <span style={{ marginRight: '12px', fontSize: '20px' }}>{step.icon}</span>
            {step.text}
          </li>
        ))}
      </ul>

      <button
        ref={buttonRef}
        className="onboarding-btn"
        onClick={onStart}
        style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '16px', color: '#fff',
          background: 'linear-gradient(180deg, #4ecca3, #2a9d6a)', border: '3px solid #1a7a52',
          borderRadius: '8px', padding: '18px 40px', cursor: 'pointer',
          boxShadow: '0 4px 0 #1a7a52, 0 6px 20px rgba(78,204,163,0.3)',
          textTransform: 'uppercase', position: 'relative', zIndex: 1,
          animation: 'btnGlow 2s ease-in-out infinite',
        }}
        onMouseDown={e => { e.target.style.transform = 'translateY(4px)'; e.target.style.boxShadow = '0 0 0 #1a7a52' }}
        onMouseUp={e => { e.target.style.transform = ''; e.target.style.boxShadow = '' }}
      >
        Start My First Mission
      </button>

      <style>{`
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 4px 0 #1a7a52, 0 6px 20px rgba(78,204,163,0.3); }
          50% { box-shadow: 0 4px 0 #1a7a52, 0 6px 30px rgba(78,204,163,0.6); }
        }
      `}</style>
    </div>
  )
}
