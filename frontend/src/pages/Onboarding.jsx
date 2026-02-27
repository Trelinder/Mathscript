import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { unlockAudioForIOS } from '../utils/audio'
import { useMotionSettings } from '../utils/motion'

const PARTICLE_SVGS = [
  (c) => `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0L9 5L14 5L10 9L12 14L7 11L2 14L4 9L0 5L5 5Z" fill="${c}" opacity="0.7"/></svg>`,
  (c) => `<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 0L12 6L6 12L0 6Z" fill="${c}" opacity="0.6"/></svg>`,
  (c) => `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${c}" opacity="0.6"/></svg>`,
  (c) => `<svg width="10" height="16" viewBox="0 0 10 16"><path d="M6 0L0 9H4L3 16L10 6H6Z" fill="${c}" opacity="0.7"/></svg>`,
]
const PARTICLE_COLORS = ['#00d4ff', '#7c3aed', '#a855f7', '#3b82f6', '#22c55e', '#fbbf24']

const HEROES = [
  { name: 'Arcanos', img: '/images/hero-arcanos.png', color: '#a855f7' },
  { name: 'Blaze', img: '/images/hero-blaze.png', color: '#f97316' },
  { name: 'Shadow', img: '/images/hero-shadow.png', color: '#64748b' },
  { name: 'Luna', img: '/images/hero-luna.png', color: '#ec4899' },
  { name: 'Titan', img: '/images/hero-titan.png', color: '#22c55e' },
  { name: 'Webweaver', img: '/images/hero-webweaver.png', color: '#ef4444' },
  { name: 'Volt', img: '/images/hero-volt.png', color: '#dc2626' },
  { name: 'Tempest', img: '/images/hero-tempest.png', color: '#3b82f6' },
  { name: 'Zenith', img: '/images/hero-zenith.svg', color: '#f59e0b' },
]

const AGE_GROUPS = [
  {
    id: '5-7',
    title: 'Ages 5-7',
    subtitle: 'Rookie Explorer',
    desc: 'Bigger hints, easier questions, and extra time.',
    color: '#22c55e',
    icon: '🧩',
  },
  {
    id: '8-10',
    title: 'Ages 8-10',
    subtitle: 'Quest Adventurer',
    desc: 'Balanced challenge with fast-paced story battles.',
    color: '#3b82f6',
    icon: '⚔️',
  },
  {
    id: '11-13',
    title: 'Ages 11-13',
    subtitle: 'Elite Strategist',
    desc: 'Harder puzzles, tighter timing, strategy focus.',
    color: '#a855f7',
    icon: '🧠',
  },
]

const REALMS = [
  { id: 'Sky Citadel', icon: '☁️', desc: 'Floating islands and lightning towers' },
  { id: 'Jungle of Numbers', icon: '🌴', desc: 'Ancient vines and hidden equation ruins' },
  { id: 'Volcano Forge', icon: '🌋', desc: 'Lava arenas and molten math monsters' },
  { id: 'Cosmic Arena', icon: '🌌', desc: 'Starlight portals and galaxy bosses' },
]

export default function Onboarding({ onStart, defaultProfile }) {
  const containerRef = useRef(null)
  const titleRef = useRef(null)
  const subtitleRef = useRef(null)
  const heroRowRef = useRef(null)
  const buttonRef = useRef(null)

  const [playerName, setPlayerName] = useState(defaultProfile?.player_name || '')
  const [ageGroup, setAgeGroup] = useState(defaultProfile?.age_group || '8-10')
  const [selectedRealm, setSelectedRealm] = useState(defaultProfile?.selected_realm || REALMS[0].id)
  const motion = useMotionSettings()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const tweens = []
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
    tl.from(titleRef.current, { y: -30, scale: 0.8, duration: 0.5, ease: 'back.out(1.6)' })
      .from(subtitleRef.current, { y: -16, opacity: 0, duration: 0.35 }, '-=0.25')

    const heroEls = heroRowRef.current?.children
    if (heroEls) {
      tl.from(Array.from(heroEls), { y: 40, scale: 0.6, opacity: 0, duration: 0.45, stagger: 0.06 }, '-=0.15')
      if (!motion.reduceEffects) {
        Array.from(heroEls).forEach((el, i) => {
          const tween = gsap.to(el, {
            y: -5 - Math.random() * 6,
            duration: 1.3 + Math.random() * 1.1,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            delay: i * 0.15,
          })
          tweens.push(tween)
        })
      }
    }

    if (!motion.reduceEffects) {
      const glowTween = gsap.to(titleRef.current, {
        textShadow: '0 0 35px rgba(0,212,255,0.5), 0 0 70px rgba(124,58,237,0.25)',
        duration: 2.2,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      })
      tweens.push(glowTween)
    }

    const particles = []
    const particleCount = motion.reduceEffects
      ? 6
      : Math.max(8, Math.round(18 * motion.particleScale))
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div')
      const svgFn = PARTICLE_SVGS[Math.floor(Math.random() * PARTICLE_SVGS.length)]
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]
      const svgDoc = new DOMParser().parseFromString(svgFn(color), 'image/svg+xml')
      p.appendChild(svgDoc.documentElement)
      p.style.cssText = 'position:absolute;pointer-events:none;opacity:0;z-index:0;'
      container.appendChild(p)
      particles.push(p)
      gsap.set(p, {
        x: Math.random() * (container.offsetWidth || 800),
        y: Math.random() * (container.offsetHeight || 600),
        scale: 0.8 + Math.random() * 1.2,
      })
      const particleTween = gsap.to(p, {
        opacity: 0.14 + Math.random() * 0.18,
        y: `-=${30 + Math.random() * 90}`,
        x: `+=${(Math.random() - 0.5) * 100}`,
        rotation: Math.random() * 360,
        duration: motion.reduceEffects ? 5 + Math.random() * 3 : 3 + Math.random() * 4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: Math.random() * 2,
      })
      tweens.push(particleTween)
    }

    return () => {
      tl.kill()
      tweens.forEach((tween) => tween?.kill?.())
      particles.forEach((p) => p.remove())
    }
  }, [motion.reduceEffects, motion.particleScale])

  return (
    <div ref={containerRef} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 40%, #1e1b4b 100%)',
      padding: '34px 16px 28px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at 30% 20%, rgba(0,212,255,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(124,58,237,0.08) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ textAlign: 'center', marginBottom: '8px', position: 'relative', zIndex: 1 }}>
        <div ref={titleRef} style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(24px, 5vw, 46px)',
          fontWeight: 800,
          color: '#fff',
          background: 'linear-gradient(135deg, #00d4ff, #7c3aed, #ec4899)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '3px',
        }}>
          THE MATH SCRIPT
        </div>
        <div ref={subtitleRef} style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(10px, 1.8vw, 16px)',
          fontWeight: 600,
          color: '#00d4ff',
          letterSpacing: '5px',
          marginTop: '4px',
          opacity: 0.85,
        }}>
          ULTIMATE QUEST
        </div>
      </div>

      <div ref={heroRowRef} className="onboarding-hero-row" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        gap: 'clamp(6px, 2vw, 14px)',
        margin: '16px 0 18px',
        position: 'relative',
        zIndex: 1,
        flexWrap: 'wrap',
      }}>
        {HEROES.map((h) => (
          <div key={h.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div className="onboarding-hero-circle" style={{
              width: 'clamp(58px, 11vw, 92px)',
              height: 'clamp(58px, 11vw, 92px)',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${h.color}22, ${h.color}08)`,
              border: `2px solid ${h.color}55`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${h.color}33, inset 0 0 20px ${h.color}11`,
              backdropFilter: 'blur(8px)',
            }}>
              <img
                src={h.img}
                alt={h.name}
                loading="lazy"
                decoding="async"
                style={{ width: '84%', height: '84%', objectFit: 'contain' }}
              />
            </div>
            <div className="onboarding-hero-name" style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 'clamp(9px, 1.2vw, 12px)',
              fontWeight: 600,
              color: h.color,
              textAlign: 'center',
              letterSpacing: '0.4px',
            }}>
              {h.name}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        width: '100%',
        maxWidth: '720px',
        display: 'grid',
        gap: '12px',
        marginBottom: '14px',
        position: 'relative',
        zIndex: 1,
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#00d4ff',
            marginBottom: '8px',
          }}>
            HERO NAME
          </div>
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Type your hero name..."
            maxLength={24}
            aria-label="Hero name"
            style={{
              width: '100%',
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '10px',
              color: '#fff',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              padding: '10px 12px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#a855f7',
            marginBottom: '8px',
          }}>
            CHOOSE AGE MODE
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {AGE_GROUPS.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setAgeGroup(mode.id)}
                aria-pressed={ageGroup === mode.id}
                style={{
                  textAlign: 'left',
                  background: ageGroup === mode.id ? `${mode.color}22` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${ageGroup === mode.id ? `${mode.color}88` : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#fff',
                }}
              >
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  fontSize: '15px',
                  color: mode.color,
                }}>
                  {mode.icon} {mode.title} • {mode.subtitle}
                </div>
                <div style={{
                  marginTop: '2px',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '13px',
                  color: '#cbd5e1',
                }}>
                  {mode.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: '#fbbf24',
            marginBottom: '8px',
          }}>
            CHOOSE YOUR STARTING REALM
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {REALMS.map((realm) => (
              <button
                key={realm.id}
                onClick={() => setSelectedRealm(realm.id)}
                aria-pressed={selectedRealm === realm.id}
                style={{
                  textAlign: 'left',
                  background: selectedRealm === realm.id ? 'rgba(251,191,36,0.14)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedRealm === realm.id ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: '#fff',
                }}
              >
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: 700,
                  fontSize: '15px',
                  color: '#fbbf24',
                }}>
                  {realm.icon} {realm.id}
                </div>
                <div style={{
                  marginTop: '2px',
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '13px',
                  color: '#cbd5e1',
                }}>
                  {realm.desc}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        ref={buttonRef}
        className="onboarding-btn"
        aria-label="Enter the world map"
        onClick={() => {
          unlockAudioForIOS()
          onStart({
            playerName: playerName.trim() || 'Hero',
            ageGroup,
            selectedRealm,
          })
        }}
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '15px',
          fontWeight: 700,
          color: '#fff',
          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
          border: 'none',
          borderRadius: '14px',
          padding: '16px 34px',
          cursor: 'pointer',
          boxShadow: '0 0 30px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.3)',
          textTransform: 'uppercase',
          position: 'relative',
          zIndex: 1,
          animation: motion.reduceEffects ? 'none' : 'btnGlow 2s ease-in-out infinite',
          letterSpacing: '2px',
        }}
      >
        Enter The World Map
      </button>

      <style>{`
        @keyframes btnGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(124,58,237,0.4), 0 8px 20px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 48px rgba(124,58,237,0.6), 0 8px 28px rgba(0,0,0,0.4); }
        }
      `}</style>
    </div>
  )
}
