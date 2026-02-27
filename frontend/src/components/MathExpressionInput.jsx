import { useEffect, useMemo, useRef, useState } from 'react'
import 'mathlive'
import 'mathlive/static.css'
import AccessibleMath from './AccessibleMath'
import { getMathInputHint, latexToPlainMath, normalizeMathInput, plainMathToLatex } from '../utils/mathExpression'

const modeButtonStyle = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: '12px',
  fontWeight: 700,
  borderRadius: '999px',
  padding: '5px 12px',
  cursor: 'pointer',
  border: '1px solid rgba(148, 163, 184, 0.35)',
  transition: 'all 0.2s ease',
  letterSpacing: '0.6px',
}

export default function MathExpressionInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  ariaLabel = 'Math problem input',
}) {
  const mathfieldRef = useRef(null)
  const [mode, setMode] = useState('math')
  const [liveLatex, setLiveLatex] = useState('')

  const normalizedValue = normalizeMathInput(value)
  const inputHint = useMemo(() => getMathInputHint(normalizedValue), [normalizedValue])
  const liveLatexMatchesValue = useMemo(
    () => normalizeMathInput(latexToPlainMath(liveLatex)) === normalizedValue,
    [liveLatex, normalizedValue],
  )
  const previewLatex = liveLatex && liveLatexMatchesValue ? liveLatex : plainMathToLatex(normalizedValue)

  useEffect(() => {
    const field = mathfieldRef.current
    if (!field || mode !== 'math') return

    const nextLatex = plainMathToLatex(normalizedValue)
    try {
      const currentLatex = typeof field.getValue === 'function' ? field.getValue('latex') : String(field.value || '')
      if (currentLatex !== nextLatex) {
        if (typeof field.setValue === 'function') {
          field.setValue(nextLatex, { silenceNotifications: true })
        } else {
          field.value = nextLatex
        }
      }
      if (typeof field.setOptions === 'function') {
        field.setOptions({
          virtualKeyboardMode: 'onfocus',
          smartFence: true,
          smartMode: true,
          readOnly: Boolean(disabled),
        })
      }
      field.setAttribute('aria-label', ariaLabel)
      field.setAttribute('placeholder', placeholder || '')
    } catch {
      // Keep text input fallback path resilient.
    }
  }, [ariaLabel, disabled, mode, normalizedValue, placeholder])

  useEffect(() => {
    const field = mathfieldRef.current
    if (!field || mode !== 'math') return

    const handleInput = () => {
      let latexValue = ''
      let plainValue = ''
      try {
        latexValue = typeof field.getValue === 'function' ? field.getValue('latex') : String(field.value || '')
        plainValue = typeof field.getValue === 'function' ? field.getValue('ascii-math') : ''
      } catch {
        latexValue = String(field.value || '')
      }
      const nextPlain = normalizeMathInput(plainValue || latexToPlainMath(latexValue))
      setLiveLatex(latexValue)
      onChange(nextPlain)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        onSubmit?.()
      }
    }

    field.addEventListener('input', handleInput)
    field.addEventListener('keydown', handleKeyDown)

    return () => {
      field.removeEventListener('input', handleInput)
      field.removeEventListener('keydown', handleKeyDown)
    }
  }, [mode, onChange, onSubmit])

  return (
    <div style={{ flex: 1, minWidth: '220px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'center' }}>
        <span style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
          letterSpacing: '0.9px',
        }}>
          INPUT MODE
        </span>
        <button
          type="button"
          onClick={() => setMode('math')}
          aria-pressed={mode === 'math'}
          style={{
            ...modeButtonStyle,
            background: mode === 'math' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(15, 23, 42, 0.8)',
            color: mode === 'math' ? '#bae6fd' : '#cbd5e1',
            borderColor: mode === 'math' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.35)',
          }}
        >
          Math Keyboard
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          aria-pressed={mode === 'text'}
          style={{
            ...modeButtonStyle,
            background: mode === 'text' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(15, 23, 42, 0.8)',
            color: mode === 'text' ? '#bae6fd' : '#cbd5e1',
            borderColor: mode === 'text' ? 'rgba(56, 189, 248, 0.45)' : 'rgba(148, 163, 184, 0.35)',
          }}
        >
          Text
        </button>
      </div>

      {mode === 'math' ? (
        <math-field
          ref={mathfieldRef}
          style={{
            width: '100%',
            minHeight: '54px',
            fontSize: '1.05rem',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(255, 255, 255, 0.96)',
            color: '#0f172a',
            padding: '10px 12px',
          }}
        />
      ) : (
        <input
          type="text"
          value={normalizedValue}
          onChange={(event) => onChange(normalizeMathInput(event.target.value))}
          onKeyDown={(event) => event.key === 'Enter' && onSubmit?.()}
          aria-label={ariaLabel}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '16px',
            fontWeight: 600,
            background: 'rgba(15, 23, 42, 0.82)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: '12px',
            color: '#f8fafc',
            outline: 'none',
            fontFamily: "'Rajdhani', sans-serif",
          }}
        />
      )}

      <div style={{
        marginTop: '8px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        background: 'rgba(15, 23, 42, 0.72)',
      }}>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '11px',
          color: '#94a3b8',
          letterSpacing: '0.8px',
          marginBottom: '6px',
          fontWeight: 700,
        }}>
          LIVE PREVIEW
        </div>
        <AccessibleMath
          expression={normalizedValue}
          latex={previewLatex}
          ariaLabel="Live rendered math preview"
          style={{ color: '#f8fafc', fontSize: '1.05rem' }}
        />
      </div>

      {inputHint && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: '8px',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            color: '#fde68a',
            fontWeight: 700,
          }}
        >
          Hint: {inputHint}
        </div>
      )}
    </div>
  )
}
