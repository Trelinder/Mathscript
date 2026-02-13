import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { gsap } from 'gsap'

const HERO_IMGS = {
  Arcanos: '/images/hero-arcanos.png',
  Blaze: '/images/hero-blaze.png',
  Shadow: '/images/hero-shadow.png',
  Luna: '/images/hero-luna.png',
  Titan: '/images/hero-titan.png',
  Webweaver: '/images/hero-webweaver.png',
  Volt: '/images/hero-volt.png',
  Tempest: '/images/hero-tempest.png',
}

const HERO_ATTACKS = {
  Arcanos: { name: 'Arcane Blast', color: '#a855f7', particle: 'spell' },
  Blaze: { name: 'Fire Punch', color: '#ef4444', particle: 'fire' },
  Shadow: { name: 'Shadow Strike', color: '#6366f1', particle: 'slash' },
  Luna: { name: 'Moon Beam', color: '#06b6d4', particle: 'spell' },
  Titan: { name: 'Ground Smash', color: '#f59e0b', particle: 'impact' },
  Webweaver: { name: 'Web Whip', color: '#3b82f6', particle: 'slash' },
  Volt: { name: 'Lightning Bolt', color: '#facc15', particle: 'lightning' },
  Tempest: { name: 'Storm Gale', color: '#14b8a6', particle: 'spell' },
}

const BOSS_NAMES = ['Algebrakk', 'Divisaurus', 'Fractonix', 'Equatron', 'Calculord', 'Numberon', 'Operatus', 'Mathulox']

let coinIdCounter = 0
function GoldCoinIcon({ size = 24 }) {
  const [id] = useState(() => `cg_${++coinIdCounter}`)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={`url(#${id})`} stroke="#b8860b" strokeWidth="1.5"/>
      <text x="12" y="16" textAnchor="middle" fill="#8B6914" fontSize="12" fontWeight="bold" fontFamily="Orbitron, sans-serif">G</text>
      <defs>
        <radialGradient id={id} cx="40%" cy="35%">
          <stop offset="0%" stopColor="#ffe066"/>
          <stop offset="70%" stopColor="#fbbf24"/>
          <stop offset="100%" stopColor="#d4930a"/>
        </radialGradient>
      </defs>
    </svg>
  )
}

function HealthBar({ current, max, color, label, side }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100))
  const barColor = pct > 50 ? color : pct > 25 ? '#fbbf24' : '#ef4444'
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex', justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
        alignItems: 'center', gap: '4px', marginBottom: '2px',
      }}>
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '8px', fontWeight: 700,
          color: '#9ca3af', letterSpacing: '1px',
        }}>{label}</span>
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 800,
          color: barColor,
        }}>{current}/{max}</span>
      </div>
      <div style={{
        height: '8px', borderRadius: '4px',
        background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%', borderRadius: '4px',
          background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
          width: `${pct}%`, transition: 'width 0.5s ease, background 0.3s',
          boxShadow: `0 0 8px ${barColor}66`,
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
          borderRadius: '4px 4px 0 0',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.3), transparent)',
        }} />
      </div>
    </div>
  )
}

function DamageNumber({ value, x, y, color, isCrit }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { y: 0, opacity: 1, scale: 0.3 },
        { y: -70, opacity: 0, scale: isCrit ? 2.0 : 1.4, duration: 1.4, ease: 'power2.out' }
      )
    }
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', left: x, top: y,
      fontFamily: "'Orbitron', sans-serif", fontSize: isCrit ? '32px' : '24px', fontWeight: 900,
      color: color || '#ef4444',
      textShadow: `0 0 15px ${color || '#ef4444'}, 0 0 30px ${color || '#ef4444'}88, 0 2px 4px rgba(0,0,0,0.9)`,
      pointerEvents: 'none', zIndex: 30, whiteSpace: 'nowrap',
    }}>
      {isCrit ? 'CRIT! ' : ''}-{value}
    </div>
  )
}

function AttackLabel({ text, color }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 0, scale: 0.5, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(2)' }
      )
      gsap.to(ref.current, { opacity: 0, y: -20, delay: 0.8, duration: 0.4 })
    }
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
      fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 800,
      color: color, letterSpacing: '2px', whiteSpace: 'nowrap', zIndex: 35,
      textShadow: `0 0 10px ${color}, 0 0 20px ${color}88`,
    }}>
      {text}
    </div>
  )
}

function SlashEffect({ color, side }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 1, scale: 0.3, rotation: side === 'left' ? -30 : 30 },
        { opacity: 0, scale: 1.5, rotation: side === 'left' ? 15 : -15, duration: 0.5, ease: 'power2.out' }
      )
    }
  }, [])
  const cx = side === 'left' ? '30%' : '70%'
  return (
    <div ref={ref} style={{
      position: 'absolute', left: cx, top: '35%', zIndex: 25, pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <path d="M10 40L35 15L40 40L35 65Z" fill={color} opacity="0.8"/>
        <path d="M40 10L55 35L40 40L55 45L40 70" stroke={color} strokeWidth="3" fill="none" opacity="0.6"/>
        <path d="M25 25L55 55M55 25L25 55" stroke="#fff" strokeWidth="2" opacity="0.5"/>
      </svg>
    </div>
  )
}

function SpellEffect({ color, side }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 1, scale: 0.2 },
        { opacity: 0, scale: 2, duration: 0.7, ease: 'power2.out' }
      )
    }
  }, [])
  const cx = side === 'left' ? '30%' : '70%'
  return (
    <div ref={ref} style={{
      position: 'absolute', left: cx, top: '40%', zIndex: 25, pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    }}>
      <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle * Math.PI) / 180
          const x1 = 50 + Math.cos(rad) * 15
          const y1 = 50 + Math.sin(rad) * 15
          const x2 = 50 + Math.cos(rad) * 45
          const y2 = 50 + Math.sin(rad) * 45
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" opacity="0.7" strokeLinecap="round"/>
        })}
        <circle cx="50" cy="50" r="20" fill="none" stroke={color} strokeWidth="2" opacity="0.5"/>
        <circle cx="50" cy="50" r="10" fill={color} opacity="0.4"/>
      </svg>
    </div>
  )
}

function ImpactEffect({ color, side }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 1, scale: 0.3 },
        { opacity: 0, scale: 1.8, duration: 0.5, ease: 'power2.out' }
      )
    }
  }, [])
  const cx = side === 'left' ? '30%' : '70%'
  return (
    <div ref={ref} style={{
      position: 'absolute', left: cx, top: '45%', zIndex: 25, pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    }}>
      <svg width="90" height="90" viewBox="0 0 90 90" fill="none">
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const rad = (angle * Math.PI) / 180
          const x2 = 45 + Math.cos(rad) * 40
          const y2 = 45 + Math.sin(rad) * 40
          return <line key={i} x1="45" y1="45" x2={x2} y2={y2} stroke={i % 2 === 0 ? color : '#fff'} strokeWidth="3" opacity="0.6" strokeLinecap="round"/>
        })}
        <circle cx="45" cy="45" r="12" fill="#fff" opacity="0.5"/>
        <circle cx="45" cy="45" r="6" fill={color} opacity="0.8"/>
      </svg>
    </div>
  )
}

function LightningEffect({ color, side }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 1, scaleY: 0.3 },
        { opacity: 0, scaleY: 1.5, duration: 0.4, ease: 'power3.out' }
      )
    }
  }, [])
  const cx = side === 'left' ? '28%' : '68%'
  return (
    <div ref={ref} style={{
      position: 'absolute', left: cx, top: '10%', zIndex: 25, pointerEvents: 'none',
      transformOrigin: 'top center',
    }}>
      <svg width="60" height="120" viewBox="0 0 60 120" fill="none">
        <path d="M30 0L15 45L28 40L10 90L35 55L22 58L40 20L30 25Z" fill={color} opacity="0.9"/>
        <path d="M30 0L15 45L28 40L10 90L35 55L22 58L40 20L30 25Z" fill="#fff" opacity="0.3"/>
        <path d="M35 5L22 50L33 46L18 95" stroke="#fff" strokeWidth="1" opacity="0.5" fill="none"/>
      </svg>
    </div>
  )
}

function FireEffect({ color, side }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { opacity: 1, scale: 0.5, y: 0 },
        { opacity: 0, scale: 1.5, y: -30, duration: 0.6, ease: 'power2.out' }
      )
    }
  }, [])
  const cx = side === 'left' ? '30%' : '70%'
  return (
    <div ref={ref} style={{
      position: 'absolute', left: cx, top: '30%', zIndex: 25, pointerEvents: 'none',
      transform: 'translate(-50%, -50%)',
    }}>
      <svg width="80" height="100" viewBox="0 0 80 100" fill="none">
        <path d="M40 5C40 5 60 25 60 50C60 65 55 80 40 90C25 80 20 65 20 50C20 25 40 5 40 5Z" fill={color} opacity="0.7"/>
        <path d="M40 25C40 25 52 38 52 55C52 65 48 75 40 82C32 75 28 65 28 55C28 38 40 25 40 25Z" fill="#fbbf24" opacity="0.6"/>
        <path d="M40 45C40 45 47 52 47 62C47 68 45 73 40 76C35 73 33 68 33 62C33 52 40 45 40 45Z" fill="#fff" opacity="0.5"/>
      </svg>
    </div>
  )
}

function HitParticles({ color, x }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const particles = ref.current.querySelectorAll('.hit-particle')
    particles.forEach((p, i) => {
      const angle = (i * 45) * Math.PI / 180
      const dist = 30 + Math.random() * 40
      gsap.fromTo(p,
        { x: 0, y: 0, opacity: 1, scale: 1 },
        {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          opacity: 0, scale: 0.2,
          duration: 0.5 + Math.random() * 0.3,
          ease: 'power2.out'
        }
      )
    })
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', left: x, top: '40%', zIndex: 26, pointerEvents: 'none',
    }}>
      {[...Array(8)].map((_, i) => (
        <div key={i} className="hit-particle" style={{
          position: 'absolute', width: `${4 + Math.random() * 6}px`, height: `${4 + Math.random() * 6}px`,
          borderRadius: '50%', background: i % 2 === 0 ? color : '#fff',
          boxShadow: `0 0 6px ${color}`,
        }} />
      ))}
    </div>
  )
}

function BossSVG({ scale = 1 }) {
  return (
    <svg width={80 * scale} height={100 * scale} viewBox="0 0 80 100" fill="none">
      <ellipse cx="40" cy="88" rx="25" ry="6" fill="rgba(0,0,0,0.4)"/>
      <rect x="22" y="35" width="36" height="45" rx="8" fill="#2a1020" stroke="#ef4444" strokeWidth="2"/>
      <rect x="28" y="40" width="24" height="8" rx="2" fill="rgba(239,68,68,0.15)"/>
      <path d="M18 45L22 35L26 42Z" fill="#ef4444" opacity="0.7"/>
      <path d="M62 45L58 35L54 42Z" fill="#ef4444" opacity="0.7"/>
      <circle cx="15" cy="55" r="6" fill="#2a1020" stroke="#ef4444" strokeWidth="1.5"/>
      <circle cx="65" cy="55" r="6" fill="#2a1020" stroke="#ef4444" strokeWidth="1.5"/>
      <circle cx="40" cy="20" r="16" fill="#2a1020" stroke="#ef4444" strokeWidth="2"/>
      <path d="M28 8L24 20L32 16Z" fill="#ef4444"/>
      <path d="M52 8L56 20L48 16Z" fill="#ef4444"/>
      <circle cx="34" cy="18" r="3.5" fill="#ef4444"/>
      <circle cx="46" cy="18" r="3.5" fill="#ef4444"/>
      <circle cx="34" cy="18" r="1.5" fill="#fff"/>
      <circle cx="46" cy="18" r="1.5" fill="#fff"/>
      <path d="M34 26C34 26 37 30 40 30C43 30 46 26 46 26" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
      <path d="M36 28L38 29.5" stroke="#ef4444" strokeWidth="1" strokeLinecap="round"/>
      <path d="M44 28L42 29.5" stroke="#ef4444" strokeWidth="1" strokeLinecap="round"/>
      <rect x="32" y="80" width="7" height="14" rx="3" fill="#2a1020" stroke="#ef4444" strokeWidth="1.5"/>
      <rect x="41" y="80" width="7" height="14" rx="3" fill="#2a1020" stroke="#ef4444" strokeWidth="1.5"/>
    </svg>
  )
}

function BattleArena({ hero, heroColor, bossName, bossHP, bossMaxHP, heroHP, heroMaxHP,
  children, heroRef, bossRef, arenaRef, flashColor, damageNums, attackEffects, attackLabels, hitParticles, phase }) {
  const heroImg = HERO_IMGS[hero] || HERO_IMGS.Arcanos

  useEffect(() => {
    if (heroRef.current) {
      gsap.to(heroRef.current, {
        y: -6, duration: 1.2, repeat: -1, yoyo: true, ease: 'sine.inOut'
      })
    }
    if (bossRef.current) {
      gsap.to(bossRef.current, {
        y: -4, scaleX: 1.02, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut'
      })
    }
  }, [])

  useEffect(() => {
    if (phase === 'intro') {
      const tl = gsap.timeline()
      if (heroRef.current) {
        tl.fromTo(heroRef.current, { x: -200, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' })
      }
      if (bossRef.current) {
        tl.fromTo(bossRef.current, { x: 200, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, '-=0.4')
      }
    }
  }, [phase])

  return (
    <div ref={arenaRef} style={{
      position: 'relative', overflow: 'hidden', borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #050810 0%, #0c1025 25%, #151835 50%, #1a1540 75%, #0f0d18 100%)',
        position: 'relative', overflow: 'hidden', minHeight: '260px',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            radial-gradient(circle at 15% 20%, rgba(168,85,247,0.12), transparent 40%),
            radial-gradient(circle at 85% 25%, rgba(239,68,68,0.12), transparent 40%),
            radial-gradient(circle at 50% 90%, rgba(59,130,246,0.08), transparent 50%)
          `,
        }} />

        {[...Array(20)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: `${5 + Math.random() * 90}%`,
            top: `${5 + Math.random() * 60}%`,
            width: `${1 + Math.random() * 2}px`,
            height: `${1 + Math.random() * 2}px`,
            borderRadius: '50%',
            background: '#fff',
            opacity: 0.15 + Math.random() * 0.25,
            animation: `starTwinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }} />
        ))}

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px',
          background: 'linear-gradient(180deg, transparent, rgba(15,10,30,0.4) 30%, rgba(20,15,40,0.8) 70%, #0f0d18)',
        }}>
          <div style={{
            position: 'absolute', bottom: '8px', left: '5%', right: '5%', height: '3px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(168,85,247,0.3) 20%, rgba(239,68,68,0.3) 80%, transparent 100%)',
            borderRadius: '2px',
          }} />
        </div>

        {flashColor && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: `radial-gradient(circle at 50% 50%, ${flashColor}55, transparent 70%)`,
            animation: 'flashFade 0.3s ease-out forwards',
          }} />
        )}

        {attackLabels.map((label) => (
          <AttackLabel key={label.id} text={label.text} color={label.color} />
        ))}

        {attackEffects.map((effect) => {
          switch (effect.type) {
            case 'slash': return <SlashEffect key={effect.id} color={effect.color} side={effect.side} />
            case 'spell': return <SpellEffect key={effect.id} color={effect.color} side={effect.side} />
            case 'impact': return <ImpactEffect key={effect.id} color={effect.color} side={effect.side} />
            case 'lightning': return <LightningEffect key={effect.id} color={effect.color} side={effect.side} />
            case 'fire': return <FireEffect key={effect.id} color={effect.color} side={effect.side} />
            default: return <SpellEffect key={effect.id} color={effect.color} side={effect.side} />
          }
        })}

        {hitParticles.map((hp) => (
          <HitParticles key={hp.id} color={hp.color} x={hp.x} />
        ))}

        {damageNums.map((d) => (
          <DamageNumber key={d.id} value={d.value} x={d.x} y={d.y} color={d.color} isCrit={d.isCrit} />
        ))}

        <div style={{
          position: 'absolute', top: '10px', left: '10px', right: '10px',
          display: 'flex', justifyContent: 'space-between', gap: '40px', zIndex: 10,
        }}>
          <div style={{ flex: 1, maxWidth: '35%' }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
              color: heroColor, marginBottom: '3px', letterSpacing: '1px',
            }}>{hero}</div>
            <HealthBar current={heroHP} max={heroMaxHP} color={heroColor} label="HP" side="left" />
          </div>
          <div style={{ flex: 1, maxWidth: '35%' }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
              color: '#ef4444', marginBottom: '3px', letterSpacing: '1px', textAlign: 'right',
            }}>{bossName}</div>
            <HealthBar current={bossHP} max={bossMaxHP} color="#ef4444" label="HP" side="right" />
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          padding: '55px 15px 20px', position: 'relative', zIndex: 5, minHeight: '200px',
        }}>
          <div ref={heroRef} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            filter: `drop-shadow(0 0 12px ${heroColor}66)`,
          }}>
            <div style={{
              width: '90px', height: '90px', borderRadius: '12px',
              overflow: 'hidden', border: `2px solid ${heroColor}88`,
              boxShadow: `0 0 20px ${heroColor}44, 0 4px 15px rgba(0,0,0,0.5)`,
              background: `linear-gradient(135deg, ${heroColor}22, transparent)`,
            }}>
              <img src={heroImg} alt={hero} style={{
                width: '100%', height: '100%', objectFit: 'cover',
              }} />
            </div>
          </div>

          {phase === 'intro' && (
            <div style={{
              position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%, -50%)',
              fontFamily: "'Orbitron', sans-serif", fontSize: '22px', fontWeight: 900,
              color: '#fbbf24', letterSpacing: '4px', zIndex: 15,
              textShadow: '0 0 20px rgba(251,191,36,0.6), 0 0 40px rgba(251,191,36,0.3)',
              animation: 'battleIntro 1.2s ease-out forwards',
            }}>
              FIGHT!
            </div>
          )}

          <div ref={bossRef} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            filter: 'drop-shadow(0 0 12px rgba(239,68,68,0.5))',
          }}>
            <BossSVG scale={1} />
          </div>
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(180deg, #0d1117, #0a0e18)',
        padding: '16px', borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        {children}
      </div>

      <style>{`
        @keyframes starTwinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.5; }
        }
        @keyframes flashFade {
          0% { opacity: 0.7; }
          100% { opacity: 0; }
        }
        @keyframes battleIntro {
          0% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
          40% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          80% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        @keyframes battlePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}

function BattleChoices({ choices, correctAnswer, onSelect, disabled, accent }) {
  const [selected, setSelected] = useState(null)
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
      {(choices || []).map((choice, idx) => {
        const isCorrect = String(choice).trim() === String(correctAnswer).trim()
        const wasSelected = selected === idx
        let bg = 'rgba(255,255,255,0.04)'
        let border = '1px solid rgba(255,255,255,0.1)'
        if (wasSelected) {
          bg = isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'
          border = isCorrect ? '1px solid #22c55e' : '1px solid #ef4444'
        }
        return (
          <button key={idx} disabled={disabled || selected !== null} onClick={() => {
            setSelected(idx)
            onSelect(isCorrect)
            setTimeout(() => setSelected(null), 1200)
          }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700,
            color: wasSelected ? (isCorrect ? '#22c55e' : '#ef4444') : '#e0e0e0',
            background: bg, border, borderRadius: '8px', padding: '10px 16px',
            cursor: disabled || selected !== null ? 'default' : 'pointer',
            transition: 'all 0.2s', minWidth: '70px', opacity: disabled ? 0.5 : 1,
          }}>
            {choice}
          </button>
        )
      })}
    </div>
  )
}

function DragDropBattle({ game, onCorrect, onWrong }) {
  const items = game.drag_items || game.choices || []
  const correctOrder = game.drag_correct_order || []
  const [slots, setSlots] = useState([])
  const [available, setAvailable] = useState([...items])
  const [result, setResult] = useState(null)

  const addToSlot = (item, idx) => {
    const na = [...available]; na.splice(idx, 1); setAvailable(na)
    setSlots([...slots, item])
  }
  const removeFromSlot = (idx) => {
    const item = slots[idx]
    const ns = [...slots]; ns.splice(idx, 1); setSlots(ns)
    setAvailable([...available, item])
    setResult(null)
  }
  const check = () => {
    let correct = false
    const normalize = (s) => String(s).replace(/\s+/g, '').toLowerCase()
    if (correctOrder.length > 0) {
      correct = JSON.stringify(slots) === JSON.stringify(correctOrder)
      if (!correct) {
        correct = slots.length === correctOrder.length &&
          slots.every((s, i) => normalize(s) === normalize(correctOrder[i]))
      }
      if (!correct && game.correct_answer) {
        const joined = slots.join(' ').trim()
        correct = normalize(joined) === normalize(game.correct_answer) ||
          normalize(slots.join('')) === normalize(game.correct_answer)
      }
    } else {
      const answer = slots.join(' ')
      correct = normalize(answer) === normalize(game.correct_answer) ||
        normalize(slots.join('')) === normalize(game.correct_answer)
    }
    setResult(correct)
    if (correct) onCorrect()
    else { onWrong(); setTimeout(() => setResult(null), 1500) }
  }

  return (
    <div>
      <div style={{
        fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
        color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '8px',
      }}>ARRANGE THE ATTACK SEQUENCE</div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', color: '#e0e0e0', marginBottom: '10px' }}>
        {game.question}
      </div>
      <div style={{
        minHeight: '42px', border: '2px dashed rgba(251,191,36,0.3)', borderRadius: '10px',
        padding: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: '8px',
        background: result === true ? 'rgba(34,197,94,0.08)' : result === false ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.01)',
        transition: 'background 0.3s',
      }}>
        {slots.length === 0 && <span style={{ color: '#555', fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', alignSelf: 'center' }}>Tap to build your combo</span>}
        {slots.map((item, idx) => (
          <button key={idx} onClick={() => removeFromSlot(idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 700, color: '#fff',
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
          }}>{item}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '8px' }}>
        {available.map((item, idx) => (
          <button key={idx} onClick={() => addToSlot(item, idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', fontWeight: 700, color: '#fbbf24',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', transition: 'all 0.2s',
          }}>{item}</button>
        ))}
      </div>
      {slots.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={check} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', border: 'none',
            borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', letterSpacing: '1px',
          }}>EXECUTE COMBO</button>
        </div>
      )}
      {result === false && (
        <div style={{ textAlign: 'center', marginTop: '6px', fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '12px', fontWeight: 600 }}>
          {game.fail_message || 'Combo failed! Rearrange!'}
        </div>
      )}
    </div>
  )
}

export default function MiniGame({ game, hero, heroColor, onComplete, sessionId, session }) {
  const equippedEffects = useMemo(() => {
    const effects = { damage_boost: 0, defense: 0, gold_boost: 0, time_boost: 0, heal: 0, all_boost: 0 }
    const equipped = session?.equipped || []
    const ITEMS_MAP = {
      fire_sword: { type: 'damage_boost', value: 15 },
      ice_dagger: { type: 'damage_boost', value: 10 },
      magic_wand: { type: 'damage_boost', value: 20 },
      lightning_gauntlets: { type: 'damage_boost', value: 30 },
      void_blade: { type: 'damage_boost', value: 40 },
      ice_shield: { type: 'defense', value: 15 },
      dragon_armor: { type: 'defense', value: 25 },
      shadow_cloak: { type: 'defense', value: 35 },
      titan_plate: { type: 'defense', value: 50 },
      fox_companion: { type: 'gold_boost', value: 5 },
      dragon_hatchling: { type: 'damage_boost', value: 12 },
      phoenix_companion: { type: 'all_boost', value: 10 },
      star_sprite: { type: 'time_boost', value: 5 },
      rocket_board: { type: 'time_boost', value: 4 },
      dino_saddle: { type: 'damage_boost', value: 18 },
      storm_pegasus: { type: 'all_boost', value: 15 },
    }
    equipped.forEach(id => {
      const e = ITEMS_MAP[id]
      if (e) effects[e.type] = (effects[e.type] || 0) + e.value
    })
    if (effects.all_boost > 0) {
      effects.damage_boost += effects.all_boost
      effects.defense += effects.all_boost
      effects.gold_boost += effects.all_boost
      effects.time_boost += effects.all_boost
    }
    return effects
  }, [session?.equipped])

  const baseDamage = 100
  const totalDamage = baseDamage + equippedEffects.damage_boost
  const defenseReduction = equippedEffects.defense
  const goldBonus = equippedEffects.gold_boost
  const timeBonus = equippedEffects.time_boost
  const baseTimeLimit = (game.time_limit || 10) + timeBonus
  const rewardCoins = (game.reward_coins || 15) + goldBonus

  const [phase, setPhase] = useState('intro')
  const [bossHP, setBossHP] = useState(100)
  const [heroHP, setHeroHP] = useState(100)
  const [flashColor, setFlashColor] = useState(null)
  const [damageNums, setDamageNums] = useState([])
  const [attackEffects, setAttackEffects] = useState([])
  const [attackLabels, setAttackLabels] = useState([])
  const [hitParticlesArr, setHitParticlesArr] = useState([])
  const [completed, setCompleted] = useState(false)
  const [showVictory, setShowVictory] = useState(false)
  const [timerLeft, setTimerLeft] = useState(baseTimeLimit)
  const [timerExpired, setTimerExpired] = useState(false)

  const heroRef = useRef(null)
  const bossRef = useRef(null)
  const arenaRef = useRef(null)
  const timerBarRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const dmgIdRef = useRef(0)
  const effectIdRef = useRef(0)
  const bossName = useMemo(() => BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)], [])
  const bossMaxHP = 100
  const heroMaxHP = 100
  const damagePerHit = totalDamage
  const heroAttackInfo = HERO_ATTACKS[hero] || HERO_ATTACKS.Arcanos

  useEffect(() => {
    const timer = setTimeout(() => setPhase('battle'), 1500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (phase === 'battle' && game.type === 'timed') {
      setTimerLeft(baseTimeLimit)
      if (timerBarRef.current) {
        gsap.fromTo(timerBarRef.current, { scaleX: 1 }, { scaleX: 0, duration: baseTimeLimit, ease: 'linear' })
      }
      timerIntervalRef.current = setInterval(() => {
        setTimerLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerIntervalRef.current)
            setTimerExpired(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(timerIntervalRef.current)
    }
  }, [phase, game.type, baseTimeLimit])

  const triggerFlash = (color) => {
    setFlashColor(color)
    setTimeout(() => setFlashColor(null), 300)
  }

  const addDamage = (value, side, color, isCrit) => {
    const id = ++dmgIdRef.current
    const x = side === 'boss' ? '62%' : '18%'
    const y = '25%'
    setDamageNums(prev => [...prev, { id, value, x, y, color, isCrit }])
    setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1500)
  }

  const addAttackEffect = (type, color, side) => {
    const id = ++effectIdRef.current
    setAttackEffects(prev => [...prev, { id, type, color, side }])
    setTimeout(() => setAttackEffects(prev => prev.filter(e => e.id !== id)), 800)
  }

  const addAttackLabel = (text, color) => {
    const id = ++effectIdRef.current
    setAttackLabels(prev => [...prev, { id, text, color }])
    setTimeout(() => setAttackLabels(prev => prev.filter(l => l.id !== id)), 1200)
  }

  const addHitParticles = (color, side) => {
    const id = ++effectIdRef.current
    const x = side === 'boss' ? '68%' : '22%'
    setHitParticlesArr(prev => [...prev, { id, color, x }])
    setTimeout(() => setHitParticlesArr(prev => prev.filter(p => p.id !== id)), 800)
  }

  const shakeArena = () => {
    if (arenaRef.current) {
      gsap.to(arenaRef.current, {
        x: 8, duration: 0.04, repeat: 6, yoyo: true, ease: 'power4.inOut',
        onComplete: () => gsap.set(arenaRef.current, { x: 0 })
      })
    }
  }

  const heroAttack = useCallback(() => {
    if (completed) return

    addAttackLabel(heroAttackInfo.name, heroAttackInfo.color)

    if (heroRef.current) {
      const tl = gsap.timeline()
      tl.to(heroRef.current, { x: 80, y: -10, scale: 1.15, duration: 0.2, ease: 'power3.in' })
      tl.to(heroRef.current, { x: 100, duration: 0.08, ease: 'none' })
      tl.to(heroRef.current, { x: 0, y: 0, scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
    }

    setTimeout(() => {
      addAttackEffect(heroAttackInfo.particle, heroAttackInfo.color, 'right')
      addHitParticles(heroAttackInfo.color, 'boss')
      triggerFlash(heroAttackInfo.color)
      shakeArena()

      if (bossRef.current) {
        gsap.to(bossRef.current, { x: 15, scaleX: 0.9, duration: 0.1, ease: 'power3.out' })
        gsap.to(bossRef.current, { x: 0, scaleX: 1, duration: 0.5, delay: 0.1, ease: 'elastic.out(1, 0.4)' })
      }

      const isCrit = Math.random() < 0.2
      const dmg = isCrit ? Math.floor(damagePerHit * 1.5) : damagePerHit
      addDamage(dmg, 'boss', heroAttackInfo.color, isCrit)

      setBossHP(prev => {
        const next = Math.max(0, prev - dmg)
        if (next <= 0) {
          setCompleted(true)
          setTimeout(() => {
            setPhase('victory')
            setShowVictory(true)
          }, 800)
          setTimeout(() => {
            onComplete(rewardCoins)
          }, 3000)
        }
        return next
      })
    }, 280)
  }, [completed, damagePerHit, heroAttackInfo, rewardCoins, onComplete])

  const bossAttack = useCallback(() => {
    addAttackLabel('Boss Strike!', '#ef4444')

    if (bossRef.current) {
      const tl = gsap.timeline()
      tl.to(bossRef.current, { x: -60, y: -5, scale: 1.1, duration: 0.18, ease: 'power3.in' })
      tl.to(bossRef.current, { x: -75, duration: 0.06, ease: 'none' })
      tl.to(bossRef.current, { x: 0, y: 0, scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' })
    }

    setTimeout(() => {
      addAttackEffect('impact', '#ef4444', 'left')
      addHitParticles('#ef4444', 'hero')
      triggerFlash('#ef4444')
      shakeArena()

      if (heroRef.current) {
        gsap.to(heroRef.current, { x: -15, scaleX: 0.92, duration: 0.1, ease: 'power3.out' })
        gsap.to(heroRef.current, { x: 0, scaleX: 1, duration: 0.5, delay: 0.1, ease: 'elastic.out(1, 0.4)' })
      }

      const rawDmg = 15 + Math.floor(Math.random() * 10)
      const dmg = Math.max(3, rawDmg - Math.floor(defenseReduction * 0.4))
      addDamage(dmg, 'hero', '#ef4444', false)
      setHeroHP(prev => Math.max(10, prev - dmg))
    }, 240)
  }, [defenseReduction])

  const handleCorrectAnswer = useCallback(() => {
    if (completed) return
    heroAttack()
  }, [heroAttack, completed])

  const handleWrongAnswer = useCallback(() => {
    bossAttack()
  }, [bossAttack])

  const retryTimed = () => {
    setTimerExpired(false)
    setTimerLeft(baseTimeLimit)
    if (timerBarRef.current) {
      gsap.fromTo(timerBarRef.current, { scaleX: 1 }, { scaleX: 0, duration: baseTimeLimit, ease: 'linear' })
    }
    timerIntervalRef.current = setInterval(() => {
      setTimerLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          setTimerExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  if (showVictory) {
    const heroImg = HERO_IMGS[hero] || HERO_IMGS.Arcanos
    return (
      <div style={{
        margin: '16px 0', borderRadius: '16px', overflow: 'hidden',
        border: '1px solid rgba(34,197,94,0.3)',
        background: 'linear-gradient(180deg, #0a1a0f, #0d1117)',
        padding: '30px 20px', textAlign: 'center',
        boxShadow: '0 0 30px rgba(34,197,94,0.15)',
        position: 'relative',
      }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} className="victory-particle" style={{
            position: 'absolute',
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            width: `${3 + Math.random() * 5}px`,
            height: `${3 + Math.random() * 5}px`,
            borderRadius: '50%',
            background: i % 3 === 0 ? '#fbbf24' : i % 3 === 1 ? '#22c55e' : heroColor,
            animation: `victoryFloat ${1.5 + Math.random() * 2}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 1}s`,
          }} />
        ))}

        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 12px',
          overflow: 'hidden', border: `3px solid ${heroColor}`,
          boxShadow: `0 0 30px ${heroColor}66`,
          animation: 'victoryBounce 1s ease-in-out infinite',
        }}>
          <img src={heroImg} alt={hero} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '24px', fontWeight: 900,
          background: 'linear-gradient(135deg, #fbbf24, #22c55e)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', marginBottom: '8px', letterSpacing: '3px',
        }}>VICTORY!</div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', color: '#a3e635',
          marginBottom: '6px', fontWeight: 600,
        }}>{bossName} defeated!</div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', color: '#d0d0e0', marginBottom: '14px' }}>
          {hero} {game.hero_action || 'lands the final blow!'}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          fontFamily: "'Orbitron', sans-serif", fontSize: '22px', fontWeight: 800, color: '#fbbf24',
          animation: 'battlePulse 1s ease-in-out infinite',
        }}>
          <GoldCoinIcon size={30} />
          +{rewardCoins} Gold!
        </div>
        <style>{`
          @keyframes victoryFloat {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.7; }
            50% { transform: translateY(-15px) scale(1.3); opacity: 1; }
          }
          @keyframes victoryBounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-8px) scale(1.05); }
          }
          @keyframes battlePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.08); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ margin: '16px 0' }}>
      <BattleArena
        hero={hero} heroColor={heroColor} bossName={bossName}
        bossHP={bossHP} bossMaxHP={bossMaxHP}
        heroHP={heroHP} heroMaxHP={heroMaxHP}
        heroRef={heroRef} bossRef={bossRef} arenaRef={arenaRef}
        flashColor={flashColor} damageNums={damageNums}
        attackEffects={attackEffects} attackLabels={attackLabels}
        hitParticles={hitParticlesArr}
        phase={phase}
      >
        {phase === 'intro' && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {(equippedEffects.damage_boost > 0 || equippedEffects.defense > 0 || equippedEffects.gold_boost > 0 || equippedEffects.time_boost > 0) && (
              <div style={{
                display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '8px',
              }}>
                {equippedEffects.damage_boost > 0 && (
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '4px', padding: '2px 6px' }}>ATK +{equippedEffects.damage_boost}</span>
                )}
                {equippedEffects.defense > 0 && (
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '4px', padding: '2px 6px' }}>DEF +{equippedEffects.defense}</span>
                )}
                {equippedEffects.gold_boost > 0 && (
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '4px', padding: '2px 6px' }}>GOLD +{equippedEffects.gold_boost}</span>
                )}
                {equippedEffects.time_boost > 0 && (
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700, color: '#06b6d4', background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '4px', padding: '2px 6px' }}>TIME +{equippedEffects.time_boost}s</span>
                )}
              </div>
            )}
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', color: '#9ca3af',
            }}>Preparing battle...</div>
          </div>
        )}

        {phase === 'battle' && (
          <div>
            {game.type === 'timed' && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{
                  height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden', marginBottom: '4px',
                }}>
                  <div ref={timerBarRef} style={{
                    height: '100%', borderRadius: '3px', transformOrigin: 'left',
                    background: timerLeft > 3 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                    transition: 'background 0.3s',
                  }} />
                </div>
                <div style={{
                  textAlign: 'center', fontFamily: "'Orbitron', sans-serif", fontSize: '13px',
                  fontWeight: 800, color: timerLeft > 3 ? '#3b82f6' : '#ef4444',
                }}>
                  {timerLeft}s
                </div>
              </div>
            )}

            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
              color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '6px',
              textTransform: 'uppercase',
            }}>
              {game.type === 'quicktime' ? 'CHOOSE YOUR ATTACK' :
               game.type === 'timed' ? 'QUICK STRIKE' :
               game.type === 'dragdrop' ? 'BUILD YOUR COMBO' :
               'CHOOSE YOUR PATH'}
            </div>

            <div style={{
              textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '15px',
              color: '#e0e0e0', fontWeight: 600, marginBottom: '10px',
              padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {game.question}
            </div>

            {(game.type === 'quicktime' || game.type === 'timed') && (
              <>
                <BattleChoices
                  choices={game.choices}
                  correctAnswer={game.correct_answer}
                  onSelect={(correct) => correct ? handleCorrectAnswer() : handleWrongAnswer()}
                  disabled={completed || (game.type === 'timed' && timerExpired)}
                  accent={heroColor}
                />
                {game.type === 'timed' && timerExpired && (
                  <div style={{ textAlign: 'center', marginTop: '10px' }}>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Time's up!
                    </div>
                    <button onClick={retryTimed} style={{
                      fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#fff',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none',
                      borderRadius: '8px', padding: '8px 20px', cursor: 'pointer', letterSpacing: '1px',
                    }}>RETRY</button>
                  </div>
                )}
              </>
            )}

            {game.type === 'choice' && (
              <BattleChoices
                choices={game.choices}
                correctAnswer={game.correct_answer}
                onSelect={(correct) => correct ? handleCorrectAnswer() : handleWrongAnswer()}
                disabled={completed}
                accent="#a855f7"
              />
            )}

            {game.type === 'dragdrop' && (
              <DragDropBattle game={game} onCorrect={handleCorrectAnswer} onWrong={handleWrongAnswer} />
            )}
          </div>
        )}
      </BattleArena>

      <div style={{
        textAlign: 'center', marginTop: '6px', fontFamily: "'Rajdhani', sans-serif",
        fontSize: '11px', color: '#4b5563',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
      }}>
        <GoldCoinIcon size={14} />
        Victory Reward: {rewardCoins} Gold{goldBonus > 0 ? ` (+${goldBonus} bonus)` : ''}
      </div>
    </div>
  )
}
