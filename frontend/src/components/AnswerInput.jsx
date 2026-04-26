import { useState, useRef } from 'react'

/**
 * AnswerInput — validated numeric answer field.
 *
 * Can operate in two modes:
 *   Uncontrolled (default): manages its own value state.
 *   Controlled: pass `value` + `onChange` props (e.g. for photo-upload pre-fill).
 *
 * Accepts integers, floats, negative numbers, and fractions (e.g. "3/4").
 * Rejects purely alphabetic input with a friendly message.
 *
 * Props:
 *   onSubmit(value: string)  — called with the trimmed answer when valid
 *   value?: string           — controlled value (external state)
 *   onChange?(e)             — controlled change handler
 *   disabled?: boolean
 *   placeholder?: string
 */
const VALID_ANSWER = /^-?\d+([./]\d+)?$/

function isValidAnswer(val) {
  const s = (val ?? '').trim()
  if (!s) return false
  return VALID_ANSWER.test(s)
}

export default function AnswerInput({
  onSubmit,
  value: controlledValue,
  onChange: controlledOnChange,
  disabled = false,
  placeholder = 'Type your answer…',
}) {
  const isControlled = controlledValue !== undefined
  const [internalValue, setInternalValue] = useState('')
  const value = isControlled ? controlledValue : internalValue
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleChange = (e) => {
    if (isControlled) {
      controlledOnChange?.(e)
    } else {
      setInternalValue(e.target.value)
    }
    if (error) setError('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  const handleSubmit = () => {
    const trimmed = (value ?? '').trim()
    if (!trimmed) {
      setError('Please type your answer first.')
      inputRef.current?.focus()
      return
    }
    if (!isValidAnswer(trimmed)) {
      setError('Numbers only — try something like 7, 3.5, or 3/4.')
      if (!isControlled) setInternalValue('')
      inputRef.current?.focus()
      return
    }
    setError('')
    if (!isControlled) setInternalValue('')
    onSubmit(trimmed)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        className="input-bar"
        style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Math answer"
          style={{
            flex: 1,
            minWidth: '120px',
            padding: '14px 18px',
            fontSize: '18px',
            fontWeight: 600,
            background: 'rgba(255,255,255,0.06)',
            border: `1.5px solid ${error ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '12px',
            color: '#e8e8f0',
            outline: 'none',
            fontFamily: "'Rajdhani', sans-serif",
            transition: 'border-color 0.2s',
            minHeight: '56px',
            boxSizing: 'border-box',
          }}
          onFocus={e => { e.target.style.borderColor = error ? 'rgba(248,113,113,0.8)' : 'rgba(124,58,237,0.6)' }}
          onBlur={e => { e.target.style.borderColor = error ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.12)' }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled}
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            color: '#fff',
            background: disabled ? '#333' : 'linear-gradient(135deg, #ef4444, #dc2626)',
            border: 'none',
            borderRadius: '12px',
            padding: '14px 28px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            boxShadow: disabled ? 'none' : '0 4px 15px rgba(220,38,38,0.3)',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
            letterSpacing: '1px',
            minHeight: '56px',
            minWidth: '56px',
          }}
        >
          ⚔️ ATTACK!
        </button>
      </div>
      {error && (
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#f87171',
          paddingLeft: '4px',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
