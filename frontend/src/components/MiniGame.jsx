import { useState, useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'

const GAME_STYLES = {
  quicktime: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.4)', accent: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)' },
  dragdrop: { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.4)', accent: '#fbbf24', gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
  timed: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.4)', accent: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
  choice: { bg: 'rgba(168, 85, 247, 0.08)', border: 'rgba(168, 85, 247, 0.4)', accent: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)' },
}

function GameIcon({ type, size = 28 }) {
  const s = size
  if (type === 'quicktime') {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M8 6L26 16L8 26V6Z" fill="#ef4444" stroke="#fff" strokeWidth="1.5"/>
        <path d="M14 11L22 16L14 21V11Z" fill="#fca5a5"/>
        <circle cx="16" cy="16" r="14" stroke="#ef4444" strokeWidth="2" fill="none" strokeDasharray="4 3"/>
      </svg>
    )
  }
  if (type === 'dragdrop') {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect x="3" y="3" width="11" height="11" rx="3" fill="#fbbf24" opacity="0.8"/>
        <rect x="18" y="3" width="11" height="11" rx="3" fill="#f59e0b" opacity="0.6"/>
        <rect x="3" y="18" width="11" height="11" rx="3" fill="#f59e0b" opacity="0.6"/>
        <rect x="18" y="18" width="11" height="11" rx="3" fill="#fbbf24" opacity="0.8"/>
        <path d="M16 8V24M8 16H24" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    )
  }
  if (type === 'timed') {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="17" r="12" stroke="#3b82f6" strokeWidth="2.5" fill="rgba(59,130,246,0.15)"/>
        <path d="M16 10V17L21 20" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="13" y="2" width="6" height="3" rx="1.5" fill="#3b82f6"/>
        <path d="M24 8L26 6" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  }
  if (type === 'choice') {
    return (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <path d="M16 4L16 12" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M16 12L6 22" stroke="#a855f7" strokeWidth="2" strokeLinecap="round"/>
        <path d="M16 12L26 22" stroke="#a855f7" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="6" cy="24" r="4" fill="#7c3aed" stroke="#a855f7" strokeWidth="1.5"/>
        <circle cx="26" cy="24" r="4" fill="#7c3aed" stroke="#a855f7" strokeWidth="1.5"/>
        <circle cx="16" cy="4" r="3" fill="#a855f7"/>
      </svg>
    )
  }
  return null
}

function BossIcon({ color = '#ef4444', size = 64 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 35%, ${color}44, ${color}11)`,
      border: `3px solid ${color}88`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 30px ${color}44, inset 0 0 20px ${color}22`,
      margin: '0 auto',
    }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 40 40" fill="none">
        <path d="M10 14C10 14 13 10 16 12C19 14 14 18 14 18" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M30 14C30 14 27 10 24 12C21 14 26 18 26 18" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="14" cy="20" r="2.5" fill={color}/>
        <circle cx="26" cy="20" r="2.5" fill={color}/>
        <path d="M14 28C14 28 17 32 20 32C23 32 26 28 26 28" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M16 29L18 31" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M24 29L22 31" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

function VictoryBurst({ color = '#22c55e', size = 64 }) {
  return (
    <div style={{
      width: size, height: size, position: 'relative',
      margin: '0 auto',
    }}>
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{ position: 'absolute', top: 0, left: 0 }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle * Math.PI) / 180
          const x1 = 32 + Math.cos(rad) * 16
          const y1 = 32 + Math.sin(rad) * 16
          const x2 = 32 + Math.cos(rad) * 28
          const y2 = 32 + Math.sin(rad) * 28
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i % 2 === 0 ? '#fbbf24' : color} strokeWidth="3" strokeLinecap="round"/>
        })}
        <circle cx="32" cy="32" r="14" fill={color} opacity="0.9"/>
        <path d="M25 32L30 37L40 27" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function PathIndicator({ index, color, size = 24 }) {
  const labels = ['A', 'B', 'C', 'D']
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${color}, ${color}cc)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Orbitron', sans-serif", fontSize: size * 0.45,
      fontWeight: 800, color: '#fff', flexShrink: 0,
      boxShadow: `0 0 10px ${color}66`,
    }}>
      {labels[index] || index + 1}
    </div>
  )
}

function ResultBadge({ correct, size = 24 }) {
  if (correct) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#22c55e"/>
        <path d="M7 12L10.5 15.5L17 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#ef4444"/>
      <path d="M8 8L16 16M16 8L8 16" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

let coinIdCounter = 0
function GoldCoinIcon({ size = 24 }) {
  const [id] = useState(() => `coinGrad_${++coinIdCounter}`)
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

function QuickTimeGame({ game, onAnswer, heroColor }) {
  const [selected, setSelected] = useState(null)
  const [shaking, setShaking] = useState(false)
  const bossRef = useRef(null)
  const choicesRef = useRef(null)

  useEffect(() => {
    if (bossRef.current) {
      gsap.fromTo(bossRef.current, { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)' })
    }
    if (choicesRef.current) {
      gsap.fromTo(choicesRef.current.children, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'power2.out', delay: 0.3 })
    }
  }, [])

  const handleChoice = (choice, idx) => {
    if (selected !== null) return
    setSelected(idx)
    const correct = choice === game.correct_answer
    if (!correct) {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      setTimeout(() => {
        setSelected(null)
      }, 800)
    } else {
      onAnswer(true)
    }
  }

  return (
    <div>
      <div ref={bossRef} style={{ textAlign: 'center', marginBottom: '16px' }}>
        <BossIcon color="#ef4444" size={72} />
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '13px', color: '#ef4444', fontWeight: 700, letterSpacing: '1px', marginTop: '10px' }}>
          MATH BOSS ATTACKS!
        </div>
      </div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', color: '#fff', fontWeight: 600, marginBottom: '16px' }}>
        {game.question}
      </div>
      <div ref={choicesRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '360px', margin: '0 auto' }}>
        {(game.choices || []).map((choice, idx) => {
          const isSelected = selected === idx
          const correct = choice === game.correct_answer
          let bg = 'rgba(255,255,255,0.06)'
          let borderColor = 'rgba(255,255,255,0.15)'
          if (isSelected && correct) { bg = 'rgba(34, 197, 94, 0.3)'; borderColor = '#22c55e' }
          if (isSelected && !correct) { bg = 'rgba(239, 68, 68, 0.3)'; borderColor = '#ef4444' }
          return (
            <button key={idx} onClick={() => handleChoice(choice, idx)} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', fontWeight: 700, color: '#fff',
              background: bg, border: `2px solid ${borderColor}`, borderRadius: '12px', padding: '14px 16px',
              cursor: selected !== null && !shaking ? 'default' : 'pointer', transition: 'all 0.2s',
              animation: isSelected && !correct ? 'shake 0.4s ease' : 'none',
            }}>
              {choice}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DragDropGame({ game, onAnswer }) {
  const items = game.drag_items || game.choices || []
  const correctOrder = game.drag_correct_order || []
  const [slots, setSlots] = useState([])
  const [available, setAvailable] = useState([...items])
  const [result, setResult] = useState(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' })
    }
  }, [])

  const addToSlot = (item, idx) => {
    const newAvailable = [...available]
    newAvailable.splice(idx, 1)
    setAvailable(newAvailable)
    setSlots([...slots, item])
  }

  const removeFromSlot = (idx) => {
    const item = slots[idx]
    const newSlots = [...slots]
    newSlots.splice(idx, 1)
    setSlots(newSlots)
    setAvailable([...available, item])
    setResult(null)
  }

  const checkAnswer = () => {
    if (correctOrder.length > 0) {
      const correct = JSON.stringify(slots) === JSON.stringify(correctOrder)
      setResult(correct)
      if (correct) onAnswer(true)
      else setTimeout(() => setResult(null), 1500)
    } else {
      const answer = slots.join(' ')
      const correct = answer === game.correct_answer || slots.join('') === game.correct_answer
      setResult(correct)
      if (correct) onAnswer(true)
      else setTimeout(() => setResult(null), 1500)
    }
  }

  return (
    <div ref={containerRef}>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', color: '#e0e0e0', marginBottom: '16px' }}>
        {game.prompt || 'Arrange the pieces in the correct order!'}
      </div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', color: '#fff', fontWeight: 600, marginBottom: '16px' }}>
        {game.question}
      </div>
      <div style={{
        minHeight: '50px', border: '2px dashed rgba(251,191,36,0.4)', borderRadius: '12px',
        padding: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center',
        marginBottom: '14px', background: result === true ? 'rgba(34,197,94,0.1)' : result === false ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.02)',
        transition: 'background 0.3s',
      }}>
        {slots.length === 0 && <span style={{ color: '#666', fontFamily: "'Rajdhani', sans-serif", fontSize: '14px', alignSelf: 'center' }}>Tap items below to place them here</span>}
        {slots.map((item, idx) => (
          <button key={idx} onClick={() => removeFromSlot(idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fff',
            background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.5)',
            borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
          }}>
            {item}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '14px' }}>
        {available.map((item, idx) => (
          <button key={idx} onClick={() => addToSlot(item, idx)} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fbbf24',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', transition: 'all 0.2s',
          }}>
            {item}
          </button>
        ))}
      </div>
      {slots.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={checkAnswer} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', border: 'none',
            borderRadius: '10px', padding: '10px 28px', cursor: 'pointer', letterSpacing: '1px',
          }}>
            CHECK ORDER
          </button>
        </div>
      )}
      {result === false && (
        <div style={{ textAlign: 'center', marginTop: '10px', fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '14px', fontWeight: 600 }}>
          {game.fail_message || 'Not quite! Try rearranging!'}
        </div>
      )}
    </div>
  )
}

function TimedGame({ game, onAnswer }) {
  const timeLimit = game.time_limit || 10
  const [timeLeft, setTimeLeft] = useState(timeLimit)
  const [selected, setSelected] = useState(null)
  const [expired, setExpired] = useState(false)
  const timerRef = useRef(null)
  const barRef = useRef(null)

  useEffect(() => {
    if (barRef.current) {
      gsap.fromTo(barRef.current, { scaleX: 1 }, { scaleX: 0, duration: timeLimit, ease: 'linear' })
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [timeLimit])

  const handleChoice = (choice, idx) => {
    if (selected !== null || expired) return
    setSelected(idx)
    clearInterval(timerRef.current)
    const correct = choice === game.correct_answer
    if (correct) {
      onAnswer(true)
    }
  }

  const retry = () => {
    setSelected(null)
    setExpired(false)
    setTimeLeft(timeLimit)
    if (barRef.current) {
      gsap.fromTo(barRef.current, { scaleX: 1 }, { scaleX: 0, duration: timeLimit, ease: 'linear' })
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  return (
    <div>
      <div style={{
        height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)',
        marginBottom: '16px', overflow: 'hidden',
      }}>
        <div ref={barRef} style={{
          height: '100%', borderRadius: '4px', transformOrigin: 'left',
          background: timeLeft > 3 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'linear-gradient(90deg, #ef4444, #f87171)',
          transition: 'background 0.3s',
        }} />
      </div>
      <div style={{ textAlign: 'center', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <GameIcon type="timed" size={24} />
        <span style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '28px', fontWeight: 800,
          color: timeLeft > 3 ? '#3b82f6' : '#ef4444',
        }}>
          {timeLeft}s
        </span>
      </div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', color: '#fff', fontWeight: 600, marginBottom: '14px' }}>
        {game.question}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '360px', margin: '0 auto' }}>
        {(game.choices || []).map((choice, idx) => {
          const isSelected = selected === idx
          const correct = choice === game.correct_answer
          let bg = 'rgba(255,255,255,0.06)'
          let borderColor = 'rgba(255,255,255,0.15)'
          if (isSelected && correct) { bg = 'rgba(34, 197, 94, 0.3)'; borderColor = '#22c55e' }
          if (isSelected && !correct) { bg = 'rgba(239, 68, 68, 0.3)'; borderColor = '#ef4444' }
          return (
            <button key={idx} onClick={() => handleChoice(choice, idx)}
              disabled={selected !== null || expired}
              style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', fontWeight: 700, color: '#fff',
                background: bg, border: `2px solid ${borderColor}`, borderRadius: '12px', padding: '14px 16px',
                cursor: (selected !== null || expired) ? 'default' : 'pointer', transition: 'all 0.2s',
                opacity: (selected !== null || expired) ? 0.7 : 1,
              }}>
              {choice}
            </button>
          )
        })}
      </div>
      {expired && selected === null && (
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>
            Time's up! Try again?
          </div>
          <button onClick={retry} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none',
            borderRadius: '10px', padding: '10px 24px', cursor: 'pointer', letterSpacing: '1px',
          }}>
            RETRY
          </button>
        </div>
      )}
      {selected !== null && game.choices[selected] !== game.correct_answer && (
        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>
            {game.fail_message || 'Not quite! Try again!'}
          </div>
          <button onClick={retry} style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '11px', fontWeight: 700, color: '#fff',
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none',
            borderRadius: '10px', padding: '10px 24px', cursor: 'pointer', letterSpacing: '1px',
          }}>
            RETRY
          </button>
        </div>
      )}
    </div>
  )
}

function ChoiceGame({ game, onAnswer }) {
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const pathsRef = useRef(null)

  useEffect(() => {
    if (pathsRef.current) {
      gsap.fromTo(pathsRef.current.children, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.15, ease: 'power2.out' })
    }
  }, [])

  const handleChoice = (choice, idx) => {
    if (selected !== null) return
    setSelected(idx)
    setRevealed(true)
    const correct = choice === game.correct_answer
    if (correct) {
      setTimeout(() => onAnswer(true), 600)
    } else {
      setTimeout(() => { setSelected(null); setRevealed(false) }, 1200)
    }
  }

  const pathColors = ['#ef4444', '#22c55e', '#3b82f6', '#fbbf24']

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <GameIcon type="choice" size={44} />
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', color: '#e0e0e0', marginBottom: '12px', marginTop: '8px' }}>
          {game.prompt || 'The path splits! Only the right answer leads forward!'}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontFamily: "'Rajdhani', sans-serif", fontSize: '18px', color: '#fff', fontWeight: 600, marginBottom: '16px' }}>
        {game.question}
      </div>
      <div ref={pathsRef} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '380px', margin: '0 auto' }}>
        {(game.choices || []).map((choice, idx) => {
          const isSelected = selected === idx
          const correct = choice === game.correct_answer
          let bg = `${pathColors[idx % pathColors.length]}15`
          let border = `${pathColors[idx % pathColors.length]}44`
          if (revealed && isSelected && correct) { bg = 'rgba(34,197,94,0.3)'; border = '#22c55e' }
          if (revealed && isSelected && !correct) { bg = 'rgba(239,68,68,0.3)'; border = '#ef4444' }
          return (
            <button key={idx} onClick={() => handleChoice(choice, idx)} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fff',
              background: bg, border: `2px solid ${border}`, borderRadius: '12px',
              padding: '14px 20px', cursor: selected !== null ? 'default' : 'pointer',
              transition: 'all 0.3s', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              <PathIndicator index={idx} color={pathColors[idx % pathColors.length]} />
              <span>Path {idx + 1}: {choice}</span>
              {revealed && isSelected && correct && <span style={{ marginLeft: 'auto' }}><ResultBadge correct={true} /></span>}
              {revealed && isSelected && !correct && <span style={{ marginLeft: 'auto' }}><ResultBadge correct={false} /></span>}
            </button>
          )
        })}
      </div>
      {revealed && selected !== null && game.choices[selected] !== game.correct_answer && (
        <div style={{ textAlign: 'center', marginTop: '12px', fontFamily: "'Rajdhani', sans-serif", color: '#fca5a5', fontSize: '14px', fontWeight: 600 }}>
          {game.fail_message || 'Wrong path! Try another one!'}
        </div>
      )}
    </div>
  )
}

export default function MiniGame({ game, hero, heroColor, onComplete, sessionId }) {
  const [completed, setCompleted] = useState(false)
  const [showReward, setShowReward] = useState(false)
  const containerRef = useRef(null)
  const rewardRef = useRef(null)
  const style = GAME_STYLES[game.type] || GAME_STYLES.quicktime

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' })
    }
  }, [])

  const handleAnswer = useCallback((correct) => {
    if (!correct || completed) return
    setCompleted(true)
    setShowReward(true)
    setTimeout(() => {
      if (rewardRef.current) {
        gsap.fromTo(rewardRef.current, { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(2)' })
      }
    }, 100)
    setTimeout(() => {
      onComplete(game.reward_coins || 15)
    }, 2000)
  }, [completed, onComplete, game.reward_coins])

  if (showReward) {
    return (
      <div ref={containerRef} style={{
        background: style.bg, border: `2px solid ${style.border}`, borderRadius: '16px',
        padding: '30px 24px', textAlign: 'center', margin: '16px 0',
      }}>
        <div ref={rewardRef}>
          <VictoryBurst color="#22c55e" size={72} />
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 800, color: '#22c55e', marginBottom: '8px', letterSpacing: '1px', marginTop: '12px' }}>
            CORRECT!
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', color: '#e0e0e0', marginBottom: '12px' }}>
            {hero} {game.hero_action || 'powers up!'}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontFamily: "'Orbitron', sans-serif", fontSize: '18px', fontWeight: 800, color: '#fbbf24',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            <GoldCoinIcon size={28} />
            +{game.reward_coins || 15} Gold!
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{
      background: style.bg, border: `2px solid ${style.border}`, borderRadius: '16px',
      padding: '24px', margin: '16px 0', position: 'relative',
    }}>
      <div style={{
        textAlign: 'center', marginBottom: '16px',
        fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 800,
        color: style.accent, letterSpacing: '2px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
      }}>
        <GameIcon type={game.type} size={24} />
        {game.title || 'MINI GAME'}
        <GameIcon type={game.type} size={24} />
      </div>

      {game.type === 'quicktime' && <QuickTimeGame game={game} onAnswer={handleAnswer} heroColor={heroColor} />}
      {game.type === 'dragdrop' && <DragDropGame game={game} onAnswer={handleAnswer} />}
      {game.type === 'timed' && <TimedGame game={game} onAnswer={handleAnswer} />}
      {game.type === 'choice' && <ChoiceGame game={game} onAnswer={handleAnswer} />}

      <div style={{
        textAlign: 'center', marginTop: '14px', fontFamily: "'Rajdhani', sans-serif",
        fontSize: '12px', color: '#6b7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      }}>
        <GoldCoinIcon size={16} />
        Reward: {game.reward_coins || 15} Gold
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-4px); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
