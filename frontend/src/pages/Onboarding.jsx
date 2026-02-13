import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { unlockAudioForIOS } from '../components/AnimatedScene'

const PARTICLE_SVGS = [
  (c) => `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0L9 5L14 5L10 9L12 14L7 11L2 14L4 9L0 5L5 5Z" fill="${c}" opacity="0.7"/></svg>`,
  (c) => `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 0L12 6L6 12L0 6Z" fill="${c}" opacity="0.6"/></svg>`,
  (c) => `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${c}" opacity="0.6"/></svg>`,
  (c) => `<svg width="10" height="16" viewBox="0 0 10 16"><path d="M6 0L0 9H4L3 16L10 6H6Z" fill="${c}" opacity="0.7"/></svg>`,
  (c) => `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M4 0H8V4H12V8H8V12H4V8H0V4H4Z" fill="${c}" opacity="0.5"/></svg>`,
]
const PARTICLE_COLORS = ['#00d4ff', '#7c3aed', '#a855f7', '#3b82f6', '#22c55e', '#fbbf24', '#ef4444', '#ec4899']

const HEROES = [
  { name: 'Arcanos', img: '/images/hero-arcanos.png', color: '#a855f7' },
  { name: 'Blaze', img: '/images/hero-blaze.png', color: '#f97316' },
  { name: 'Shadow', img: '/images/hero-shadow.png', color: '#64748b' },
  { name: 'Luna', img: '/images/hero-luna.png', color: '#ec4899' },
  { name: 'Titan', img: '/images/hero-titan.png', color: '#22c55e' },
  { name: 'Webweaver', img: '/images/hero-webweaver.png', color: '#ef4444' },
  { name: 'Volt', img: '/images/hero-volt.png', color: '#dc2626' },
  { name: 'Tempest', img: '/images/hero-tempest.png', color: '#3b82f6' },
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
      textShadow: '0 0 40px rgba(0,212,255,0.6), 0 0 80px rgba(124,58,237,0.3)',
      duration: 2, ease: 'sine.inOut', repeat: -1, yoyo: true,
    })

    const particles = []
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('div')
      const svgFn = PARTICLE_SVGS[Math.floor(Math.random() * PARTICLE_SVGS.length)]
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]
      const svgDoc = new DOMParser().parseFromString(svgFn(color), 'image/svg+xml')
      p.appendChild(svgDoc.documentElement)
      const sc = 0.8 + Math.random() * 1.5
      p.style.cssText = `position:absolute;pointer-events:none;opacity:0;z-index:0;transform:scale(${sc});filter:drop-shadow(0 0 3px ${color}66);`
      container.appendChild(p)
      particles.push(p)
      const startX = Math.random() * (container.offsetWidth || 800)
      const startY = Math.random() * (container.offsetHeight || 600)
      gsap.set(p, { x: startX, y: startY })
      gsap.to(p, {
        opacity: 0.15 + Math.random() * 0.25,
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
    { svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L15 8H20L16 12L18 18L12 14L6 18L8 12L4 8H9Z" stroke="#00d4ff" stroke-width="2" fill="rgba(0,212,255,0.2)"/></svg>', text: 'Choose a Hero to guide you through the Math Realms.' },
    { svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M14 2L4 12H10L8 22L20 10H14Z" stroke="#a855f7" stroke-width="2" fill="rgba(168,85,247,0.2)"/></svg>', text: 'Fight Math Bosses by turning scary problems into fun stories.' },
    { svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fbbf24" stroke-width="2" fill="rgba(251,191,36,0.2)"/><text x="12" y="16" text-anchor="middle" fill="#fbbf24" font-size="11" font-weight="bold">G</text></svg>', text: 'Earn Gold to buy legendary gear in the Hero Shop.' },
    { svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#22c55e" stroke-width="2" fill="rgba(34,197,94,0.15)"/><path d="M8 12L11 15L16 9" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>', text: 'Level Up your brain!' },
  ]

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 40%, #1e1b4b 100%)',
      padding: '40px 20px 40px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(0,212,255,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(124,58,237,0.08) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', marginBottom: '8px', position: 'relative', zIndex: 1 }}>
        <div ref={titleRef} style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(24px, 5vw, 48px)',
          fontWeight: 800,
          color: '#fff',
          background: 'linear-gradient(135deg, #00d4ff, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          textShadow: 'none',
          letterSpacing: '3px',
        }}>THE MATH SCRIPT</div>
        <div ref={subtitleRef} style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(11px, 1.8vw, 18px)',
          fontWeight: 600,
          color: '#00d4ff',
          letterSpacing: '6px',
          marginTop: '4px',
          opacity: 0.8,
        }}>ULTIMATE QUEST</div>
      </div>

      <div ref={heroRowRef} className="onboarding-hero-row" style={{
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        gap: 'clamp(6px, 2vw, 16px)', margin: '24px 0 28px',
        position: 'relative', zIndex: 1, flexWrap: 'wrap',
      }}>
        {HEROES.map((h) => (
          <div key={h.name} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
          }}>
            <div className="onboarding-hero-circle" style={{
              width: 'clamp(60px, 12vw, 100px)', height: 'clamp(60px, 12vw, 100px)',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${h.color}22, ${h.color}08)`,
              border: `2px solid ${h.color}55`,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 20px ${h.color}33, inset 0 0 20px ${h.color}11`,
              cursor: 'pointer',
              transition: 'transform 0.3s ease, box-shadow 0.3s ease',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = `0 0 35px ${h.color}66` }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <img src={h.img} alt={h.name} style={{
                width: '85%', height: '85%', objectFit: 'contain',
              }} />
            </div>
            <div className="onboarding-hero-name" style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 'clamp(9px, 1.2vw, 12px)',
              fontWeight: 600,
              color: h.color,
              textAlign: 'center',
              letterSpacing: '0.5px',
            }}>{h.name}</div>
          </div>
        ))}
      </div>

      <div ref={missionRef} style={{
        fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(10px, 1.4vw, 14px)',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.7)', margin: '10px 0 24px', textAlign: 'center', lineHeight: '2',
        position: 'relative', zIndex: 1, letterSpacing: '1px',
      }}>
        Your mission, should you choose to accept it:
      </div>

      <ul ref={stepsRef} style={{ listStyle: 'none', padding: 0, margin: '0 0 36px 0', maxWidth: '600px', width: '100%', position: 'relative', zIndex: 1 }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            fontSize: '17px', fontWeight: 500, color: '#c8c8d8', padding: '14px 20px',
            borderLeft: '3px solid #7c3aed', marginBottom: '10px',
            background: 'rgba(124,58,237,0.06)', borderRadius: '0 12px 12px 0',
            backdropFilter: 'blur(8px)',
            transition: 'background 0.3s, transform 0.3s',
            cursor: 'default',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.14)'; e.currentTarget.style.transform = 'translateX(6px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.06)'; e.currentTarget.style.transform = '' }}
          >
            <span style={{ marginRight: '12px', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: step.svg }} />
            {step.text}
          </li>
        ))}
      </ul>

      <button
        ref={buttonRef}
        className="onboarding-btn"
        onClick={() => { unlockAudioForIOS(); onStart() }}
        style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '15px', fontWeight: 700,
          color: '#fff',
          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
          border: 'none',
          borderRadius: '14px', padding: '18px 44px', cursor: 'pointer',
          boxShadow: '0 0 30px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.3)',
          textTransform: 'uppercase', position: 'relative', zIndex: 1,
          animation: 'btnGlow 2s ease-in-out infinite',
          letterSpacing: '2px',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseDown={e => { e.target.style.transform = 'scale(0.96)' }}
        onMouseUp={e => { e.target.style.transform = '' }}
      >
        Start My First Mission
      </button>

      <style>{`
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 50px rgba(124,58,237,0.6), 0 8px 30px rgba(0,0,0,0.4); }
        }
      `}</style>
    </div>
  )
}
