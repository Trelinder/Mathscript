import { useEffect, useEffectEvent, useRef, useState } from 'react'
import './TycoonMathChallenge.css'

export default function TycoonMathChallenge({ challenge, onAnswer, onSkip }) {
  const [feedback, setFeedback] = useState('')
  const dialogRef = useRef(null)
  const skipChallenge = useEffectEvent(() => onSkip())

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const getFocusable = () => Array.from(dialog?.querySelectorAll('button:not([disabled])') ?? [])
    getFocusable()[0]?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        skipChallenge()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog?.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog?.removeEventListener('keydown', handleKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  const selectAnswer = option => {
    if (option.id === challenge.correctId) {
      onAnswer(option.id)
      return
    }
    setFeedback(`Not quite. ${challenge.hint}`)
  }

  return (
    <div className="tycoon-challenge-backdrop">
      <section ref={dialogRef} className="tycoon-challenge" role="dialog" aria-modal="true" aria-labelledby="tycoon-challenge-title" aria-describedby="tycoon-challenge-question">
        <div className="tycoon-challenge-eyebrow">UPGRADE BONUS · +${challenge.reward}</div>
        <h2 id="tycoon-challenge-title">{challenge.title}</h2>
        <p id="tycoon-challenge-question">{challenge.question}</p>
        <div className="tycoon-challenge-choices">
          {challenge.choices.map(option => (
            <button key={option.id} type="button" onClick={() => selectAnswer(option)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="tycoon-challenge-feedback" role="status" aria-live="polite">
          {feedback || challenge.hint}
        </div>
        <button className="tycoon-challenge-skip" type="button" onClick={onSkip}>
          Skip bonus
        </button>
      </section>
    </div>
  )
}