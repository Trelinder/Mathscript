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
        alignItems: 'center', gap: '6px', marginBottom: '4px',
      }}>
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '9px', fontWeight: 700,
          color: '#9ca3af', letterSpacing: '1px', textTransform: 'uppercase',
        }}>{label}</span>
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 800,
          color: barColor,
        }}>{current}/{max}</span>
      </div>
      <div style={{
        height: '10px', borderRadius: '5px',
        background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%', borderRadius: '5px',
          background: `linear-gradient(90deg, ${barColor}cc, ${barColor})`,
          width: `${pct}%`, transition: 'width 0.5s ease, background 0.3s',
          boxShadow: `0 0 8px ${barColor}66`,
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
          borderRadius: '5px 5px 0 0',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.25), transparent)',
        }} />
      </div>
    </div>
  )
}

function DamageNumber({ value, x, y, color }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current,
        { y: 0, opacity: 1, scale: 0.5 },
        { y: -60, opacity: 0, scale: 1.5, duration: 1.2, ease: 'power2.out' }
      )
    }
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', left: x, top: y,
      fontFamily: "'Orbitron', sans-serif", fontSize: '28px', fontWeight: 900,
      color: color || '#ef4444', textShadow: `0 0 10px ${color || '#ef4444'}, 0 2px 4px rgba(0,0,0,0.8)`,
      pointerEvents: 'none', zIndex: 20, whiteSpace: 'nowrap',
    }}>
      -{value}
    </div>
  )
}

function ImpactFlash({ color = '#fff' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current, { opacity: 0.7 }, { opacity: 0, duration: 0.4, ease: 'power2.out' })
    }
  }, [])
  return (
    <div ref={ref} style={{
      position: 'absolute', inset: 0, borderRadius: '16px',
      background: `radial-gradient(circle, ${color}88, transparent 70%)`,
      pointerEvents: 'none', zIndex: 15,
    }} />
  )
}

function BattleArena({ hero, heroColor, bossName, bossHP, bossMaxHP, heroHP, heroMaxHP, children, containerRef, flashColor, damageNums, phase }) {
  const heroPortRef = useRef(null)
  const bossPortRef = useRef(null)
  const vsRef = useRef(null)
  const arenaRef = useRef(null)

  useEffect(() => {
    const tl = gsap.timeline()
    if (heroPortRef.current) {
      tl.fromTo(heroPortRef.current, { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.4)' })
    }
    if (bossPortRef.current) {
      tl.fromTo(bossPortRef.current, { x: 120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.4)' }, '-=0.4')
    }
    if (vsRef.current) {
      tl.fromTo(vsRef.current, { scale: 0, rotation: -360 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.3')
    }
  }, [])

  const heroImg = HERO_IMGS[hero] || HERO_IMGS.Arcanos

  return (
    <div ref={arenaRef} style={{
      position: 'relative', overflow: 'hidden', borderRadius: '16px',
    }}>
      <div style={{
        background: 'linear-gradient(180deg, #0a0e1a 0%, #1a1040 40%, #0d1117 100%)',
        padding: '20px 16px', borderRadius: '16px 16px 0 0',
        border: '1px solid rgba(255,255,255,0.08)',
        borderBottom: 'none',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(168,85,247,0.8), transparent 50%), radial-gradient(circle at 80% 50%, rgba(239,68,68,0.8), transparent 50%)',
        }} />

        {flashColor && <ImpactFlash color={flashColor} />}

        {damageNums.map((d, i) => (
          <DamageNumber key={d.id} value={d.value} x={d.x} y={d.y} color={d.color} />
        ))}

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', position: 'relative', zIndex: 5,
        }}>
          <div ref={heroPortRef} className="battle-hero-side" style={{ flex: '1', textAlign: 'center', maxWidth: '42%' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 8px',
              border: `3px solid ${heroColor}`, boxShadow: `0 0 20px ${heroColor}55`,
              overflow: 'hidden', background: `${heroColor}22`,
            }}>
              <img src={heroImg} alt={hero} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700,
              color: heroColor, marginBottom: '6px', letterSpacing: '1px',
            }}>{hero}</div>
            <HealthBar current={heroHP} max={heroMaxHP} color={heroColor} label="HP" side="left" />
          </div>

          <div ref={vsRef} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '20px', fontWeight: 900,
            background: 'linear-gradient(135deg, #fbbf24, #ef4444)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', textShadow: 'none',
            flexShrink: 0, filter: 'drop-shadow(0 0 8px rgba(251,191,36,0.5))',
          }}>VS</div>

          <div ref={bossPortRef} className="battle-boss-side" style={{ flex: '1', textAlign: 'center', maxWidth: '42%' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 8px',
              border: '3px solid #ef4444', boxShadow: '0 0 20px rgba(239,68,68,0.4)',
              background: 'radial-gradient(circle at 35% 35%, #2a1020, #1a0a15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
                <path d="M12 8L8 18L16 14Z" fill="#ef4444" opacity="0.8"/>
                <path d="M36 8L40 18L32 14Z" fill="#ef4444" opacity="0.8"/>
                <circle cx="16" cy="22" r="4" fill="#ef4444"/>
                <circle cx="32" cy="22" r="4" fill="#ef4444"/>
                <circle cx="16" cy="22" r="1.5" fill="#fff"/>
                <circle cx="32" cy="22" r="1.5" fill="#fff"/>
                <path d="M14 32C14 32 18 38 24 38C30 38 34 32 34 32" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>
                <path d="M18 34L20 36" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M24 35L24 37" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M30 34L28 36" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700,
              color: '#ef4444', marginBottom: '6px', letterSpacing: '1px',
            }}>{bossName}</div>
            <HealthBar current={bossHP} max={bossMaxHP} color="#ef4444" label="HP" side="right" />
          </div>
        </div>

        {phase === 'intro' && (
          <div style={{
            textAlign: 'center', marginTop: '16px',
            fontFamily: "'Orbitron', sans-serif", fontSize: '18px', fontWeight: 900,
            color: '#fbbf24', letterSpacing: '3px',
            textShadow: '0 0 20px rgba(251,191,36,0.5)',
            animation: 'battlePulse 1s ease-in-out infinite',
          }}>
            BATTLE START!
          </div>
        )}
      </div>

      <div ref={containerRef} style={{
        background: 'linear-gradient(180deg, #111827, #0d1117)',
        padding: '20px 16px', borderRadius: '0 0 16px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTop: '1px solid rgba(251,191,36,0.15)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: '60%', height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.4), transparent)',
        }} />
        {children}
      </div>

      <style>{`
        @keyframes battlePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}

function BattleChoices({ choices, correctAnswer, onSelect, disabled, accent = '#fff' }) {
  const [selected, setSelected] = useState(null)
  const [shaking, setShaking] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current.children, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.08, ease: 'power2.out' })
    }
  }, [])

  const handleClick = (choice, idx) => {
    if (selected !== null || disabled) return
    setSelected(idx)
    const correct = choice === correctAnswer
    if (correct) {
      onSelect(true, idx)
    } else {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      onSelect(false, idx)
      setTimeout(() => setSelected(null), 900)
    }
  }

  return (
    <div ref={ref} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
      {(choices || []).map((choice, idx) => {
        const isSelected = selected === idx
        const correct = choice === correctAnswer
        let bg = 'rgba(255,255,255,0.04)'
        let border = 'rgba(255,255,255,0.12)'
        let glow = 'none'
        if (isSelected && correct) { bg = 'rgba(34,197,94,0.25)'; border = '#22c55e'; glow = '0 0 12px rgba(34,197,94,0.4)' }
        if (isSelected && !correct) { bg = 'rgba(239,68,68,0.25)'; border = '#ef4444'; glow = '0 0 12px rgba(239,68,68,0.4)' }
        return (
          <button key={idx} onClick={() => handleClick(choice, idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fff',
            background: bg, border: `2px solid ${border}`, borderRadius: '10px', padding: '12px 10px',
            cursor: (selected !== null || disabled) ? 'default' : 'pointer',
            transition: 'all 0.2s', boxShadow: glow,
            animation: isSelected && !correct && shaking ? 'battleShake 0.4s ease' : 'none',
          }}>
            <span style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 600,
              color: accent, opacity: 0.5, display: 'block', marginBottom: '2px',
            }}>{['A', 'B', 'C', 'D'][idx]}</span>
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
    let correct
    if (correctOrder.length > 0) {
      correct = JSON.stringify(slots) === JSON.stringify(correctOrder)
    } else {
      const answer = slots.join(' ')
      correct = answer === game.correct_answer || slots.join('') === game.correct_answer
    }
    setResult(correct)
    if (correct) onCorrect()
    else { onWrong(); setTimeout(() => setResult(null), 1500) }
  }

  return (
    <div>
      <div style={{
        fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
        color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '10px',
      }}>ARRANGE THE ATTACK SEQUENCE</div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', color: '#e0e0e0', marginBottom: '12px' }}>
        {game.question}
      </div>
      <div style={{
        minHeight: '44px', border: '2px dashed rgba(251,191,36,0.3)', borderRadius: '10px',
        padding: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: '10px',
        background: result === true ? 'rgba(34,197,94,0.08)' : result === false ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.01)',
        transition: 'background 0.3s',
      }}>
        {slots.length === 0 && <span style={{ color: '#555', fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', alignSelf: 'center' }}>Tap to build your combo</span>}
        {slots.map((item, idx) => (
          <button key={idx} onClick={() => removeFromSlot(idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700, color: '#fff',
            background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)',
            borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
          }}>{item}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '10px' }}>
        {available.map((item, idx) => (
          <button key={idx} onClick={() => addToSlot(item, idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700, color: '#fbbf24',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', transition: 'all 0.2s',
          }}>{item}</button>
        ))}
      </div>
      {slots.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={check} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', border: 'none',
            borderRadius: '8px', padding: '10px 24px', cursor: 'pointer', letterSpacing: '1px',
          }}>EXECUTE COMBO</button>
        </div>
      )}
      {result === false && (
        <div style={{ textAlign: 'center', marginTop: '8px', fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '13px', fontWeight: 600 }}>
          {game.fail_message || 'Combo failed! Rearrange!'}
        </div>
      )}
    </div>
  )
}

export default function MiniGame({ game, hero, heroColor, onComplete, sessionId }) {
  const [phase, setPhase] = useState('intro')
  const [bossHP, setBossHP] = useState(100)
  const [heroHP, setHeroHP] = useState(100)
  const [flashColor, setFlashColor] = useState(null)
  const [damageNums, setDamageNums] = useState([])
  const [completed, setCompleted] = useState(false)
  const [showVictory, setShowVictory] = useState(false)
  const [timerLeft, setTimerLeft] = useState(game.time_limit || 10)
  const [timerExpired, setTimerExpired] = useState(false)
  const containerRef = useRef(null)
  const timerBarRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const dmgIdRef = useRef(0)
  const bossName = useMemo(() => BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)], [])
  const bossMaxHP = 100
  const heroMaxHP = 100
  const damagePerHit = game.type === 'quicktime' || game.type === 'timed' ? 100 : 100

  useEffect(() => {
    const timer = setTimeout(() => setPhase('battle'), 1200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (phase === 'battle' && game.type === 'timed') {
      const tl = game.time_limit || 10
      setTimerLeft(tl)
      if (timerBarRef.current) {
        gsap.fromTo(timerBarRef.current, { scaleX: 1 }, { scaleX: 0, duration: tl, ease: 'linear' })
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
  }, [phase, game.type, game.time_limit])

  const triggerFlash = (color) => {
    setFlashColor(color)
    setTimeout(() => setFlashColor(null), 400)
  }

  const addDamage = (value, side, color) => {
    const id = ++dmgIdRef.current
    const x = side === 'boss' ? '65%' : '20%'
    const y = '30%'
    setDamageNums(prev => [...prev, { id, value, x, y, color }])
    setTimeout(() => setDamageNums(prev => prev.filter(d => d.id !== id)), 1300)
  }

  const shakeArena = () => {
    if (containerRef.current?.parentElement) {
      gsap.to(containerRef.current.parentElement, {
        x: 6, duration: 0.05, repeat: 5, yoyo: true, ease: 'power4.inOut',
        onComplete: () => gsap.set(containerRef.current.parentElement, { x: 0 })
      })
    }
  }

  const heroAttack = useCallback(() => {
    if (completed) return
    const heroPt = containerRef.current?.parentElement?.querySelector('.battle-hero-side')
    if (heroPt) {
      gsap.to(heroPt, { x: 40, duration: 0.15, ease: 'power3.in' })
      gsap.to(heroPt, { x: 0, duration: 0.3, delay: 0.15, ease: 'elastic.out(1, 0.4)' })
    }
    setTimeout(() => {
      triggerFlash('#fff')
      shakeArena()
      addDamage(damagePerHit, 'boss', heroColor)
      setBossHP(prev => {
        const next = Math.max(0, prev - damagePerHit)
        if (next <= 0) {
          setCompleted(true)
          setTimeout(() => {
            setPhase('victory')
            setShowVictory(true)
          }, 600)
          setTimeout(() => {
            onComplete(game.reward_coins || 15)
          }, 2800)
        }
        return next
      })
    }, 200)
  }, [completed, damagePerHit, heroColor, game.reward_coins, onComplete])

  const bossAttack = useCallback(() => {
    const bossPt = containerRef.current?.parentElement?.querySelector('.battle-boss-side')
    if (bossPt) {
      gsap.to(bossPt, { x: -30, duration: 0.12, ease: 'power3.in' })
      gsap.to(bossPt, { x: 0, duration: 0.25, delay: 0.12, ease: 'elastic.out(1, 0.4)' })
    }
    setTimeout(() => {
      triggerFlash('#ef4444')
      shakeArena()
      const dmg = 15 + Math.floor(Math.random() * 10)
      addDamage(dmg, 'hero', '#ef4444')
      setHeroHP(prev => Math.max(10, prev - dmg))
    }, 150)
  }, [])

  const handleCorrectAnswer = useCallback(() => {
    if (completed) return
    heroAttack()
  }, [heroAttack, completed])

  const handleWrongAnswer = useCallback(() => {
    bossAttack()
  }, [bossAttack])

  const retryTimed = () => {
    setTimerExpired(false)
    const tl = game.time_limit || 10
    setTimerLeft(tl)
    if (timerBarRef.current) {
      gsap.fromTo(timerBarRef.current, { scaleX: 1 }, { scaleX: 0, duration: tl, ease: 'linear' })
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
    return (
      <div style={{
        margin: '16px 0', borderRadius: '16px', overflow: 'hidden',
        border: '1px solid rgba(34,197,94,0.3)',
        background: 'linear-gradient(180deg, #0a1a0f, #0d1117)',
        padding: '30px 20px', textAlign: 'center',
        boxShadow: '0 0 30px rgba(34,197,94,0.15)',
      }}>
        <div style={{ marginBottom: '16px' }}>
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" style={{ filter: 'drop-shadow(0 0 15px rgba(34,197,94,0.5))' }}>
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
              const rad = (angle * Math.PI) / 180
              const x1 = 36 + Math.cos(rad) * 20
              const y1 = 36 + Math.sin(rad) * 20
              const x2 = 36 + Math.cos(rad) * 32
              const y2 = 36 + Math.sin(rad) * 32
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 === 0 ? '#fbbf24' : '#22c55e'} strokeWidth="3" strokeLinecap="round"/>
            })}
            <circle cx="36" cy="36" r="16" fill="#22c55e"/>
            <path d="M28 36L34 42L45 30" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '20px', fontWeight: 900,
          background: 'linear-gradient(135deg, #fbbf24, #22c55e)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent', marginBottom: '8px', letterSpacing: '2px',
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
          fontFamily: "'Orbitron', sans-serif", fontSize: '20px', fontWeight: 800, color: '#fbbf24',
          animation: 'battlePulse 1s ease-in-out infinite',
        }}>
          <GoldCoinIcon size={28} />
          +{game.reward_coins || 15} Gold!
        </div>
        <style>{`@keyframes battlePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ margin: '16px 0' }}>
      <BattleArena
        hero={hero} heroColor={heroColor} bossName={bossName}
        bossHP={bossHP} bossMaxHP={bossMaxHP}
        heroHP={heroHP} heroMaxHP={heroMaxHP}
        containerRef={containerRef}
        flashColor={flashColor} damageNums={damageNums}
        phase={phase}
      >
        {phase === 'intro' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', color: '#9ca3af',
              animation: 'battlePulse 1.5s ease-in-out infinite',
            }}>Preparing battle...</div>
          </div>
        )}

        {phase === 'battle' && (
          <div>
            {game.type === 'timed' && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{
                  height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden', marginBottom: '6px',
                }}>
                  <div ref={timerBarRef} style={{
                    height: '100%', borderRadius: '3px', transformOrigin: 'left',
                    background: timerLeft > 3 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'linear-gradient(90deg, #ef4444, #f87171)',
                    transition: 'background 0.3s',
                  }} />
                </div>
                <div style={{
                  textAlign: 'center', fontFamily: "'Orbitron', sans-serif", fontSize: '14px',
                  fontWeight: 800, color: timerLeft > 3 ? '#3b82f6' : '#ef4444',
                }}>
                  {timerLeft}s
                </div>
              </div>
            )}

            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700,
              color: '#fbbf24', letterSpacing: '1.5px', textAlign: 'center', marginBottom: '8px',
              textTransform: 'uppercase',
            }}>
              {game.type === 'quicktime' ? 'CHOOSE YOUR ATTACK' :
               game.type === 'timed' ? 'QUICK STRIKE' :
               game.type === 'dragdrop' ? 'BUILD YOUR COMBO' :
               'CHOOSE YOUR PATH'}
            </div>

            <div style={{
              textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '16px',
              color: '#e0e0e0', fontWeight: 600, marginBottom: '12px',
              padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
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
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
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
        textAlign: 'center', marginTop: '8px', fontFamily: "'Rajdhani', sans-serif",
        fontSize: '11px', color: '#4b5563',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
      }}>
        <GoldCoinIcon size={14} />
        Victory Reward: {game.reward_coins || 15} Gold
      </div>

      <style>{`
        @keyframes battleShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          50% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
        }
        @keyframes battlePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
      `}</style>
    </div>
  )
}
