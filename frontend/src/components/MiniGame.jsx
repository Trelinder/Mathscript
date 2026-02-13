import { useState, useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'

const GAME_STYLES = {
  quicktime: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.4)', accent: '#ef4444', icon: '⚔️' },
  dragdrop: { bg: 'rgba(251, 191, 36, 0.08)', border: 'rgba(251, 191, 36, 0.4)', accent: '#fbbf24', icon: '🧩' },
  timed: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.4)', accent: '#3b82f6', icon: '⏱️' },
  choice: { bg: 'rgba(168, 85, 247, 0.08)', border: 'rgba(168, 85, 247, 0.4)', accent: '#a855f7', icon: '🔮' },
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
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>👹</div>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '13px', color: '#ef4444', fontWeight: 700, letterSpacing: '1px' }}>
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
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
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
  const pathEmojis = ['🔴', '🟢', '🔵', '🟡']

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔮</div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', color: '#e0e0e0', marginBottom: '12px' }}>
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
              <span style={{ fontSize: '20px' }}>{pathEmojis[idx % pathEmojis.length]}</span>
              <span>Path {idx + 1}: {choice}</span>
              {revealed && isSelected && correct && <span style={{ marginLeft: 'auto', fontSize: '20px' }}>✅</span>}
              {revealed && isSelected && !correct && <span style={{ marginLeft: 'auto', fontSize: '20px' }}>❌</span>}
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
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 800, color: '#22c55e', marginBottom: '8px', letterSpacing: '1px' }}>
            CORRECT!
          </div>
          <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', color: '#e0e0e0', marginBottom: '12px' }}>
            {hero} {game.hero_action || 'powers up!'}
          </div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif", fontSize: '18px', fontWeight: 800, color: '#fbbf24',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '20px' }}>{style.icon}</span>
        {game.title || 'MINI GAME'}
        <span style={{ fontSize: '20px' }}>{style.icon}</span>
      </div>

      {game.type === 'quicktime' && <QuickTimeGame game={game} onAnswer={handleAnswer} heroColor={heroColor} />}
      {game.type === 'dragdrop' && <DragDropGame game={game} onAnswer={handleAnswer} />}
      {game.type === 'timed' && <TimedGame game={game} onAnswer={handleAnswer} />}
      {game.type === 'choice' && <ChoiceGame game={game} onAnswer={handleAnswer} />}

      <div style={{
        textAlign: 'center', marginTop: '14px', fontFamily: "'Rajdhani', sans-serif",
        fontSize: '12px', color: '#6b7280',
      }}>
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
