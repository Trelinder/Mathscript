import { useMemo } from 'react'
import { deriveSimpleMathModel } from '../utils/mathExpression'
import { EDU_THEME } from '../styles/designSystem'

function widthFor(value, maxValue) {
  const safeMax = Math.max(1, maxValue)
  return `${Math.max(10, Math.round((Math.abs(value) / safeMax) * 100))}%`
}

export default function MathVisualAid({ expression }) {
  const model = useMemo(() => deriveSimpleMathModel(expression), [expression])
  if (!model) return null

  const maxMagnitude = Math.max(Math.abs(model.left), Math.abs(model.right), Math.abs(model.result), 1)
  const operatorLabel = model.operator === '*'
    ? 'multiplied by'
    : model.operator === '/'
      ? 'divided by'
      : model.operator === '-'
        ? 'minus'
        : 'plus'

  return (
    <div
      className="visual-output-card"
      style={{
        marginBottom: '12px',
        borderRadius: '12px',
        border: `1px solid ${EDU_THEME.colors.border}`,
        background: 'rgba(30, 41, 59, 0.6)',
        padding: '12px',
      }}
    >
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '11px',
        color: '#bae6fd',
        letterSpacing: '1px',
        marginBottom: '8px',
      }}>
        VISUAL MODEL
      </div>

      <div style={{
        fontFamily: "'Rajdhani', sans-serif",
        color: '#e2e8f0',
        fontWeight: 700,
        fontSize: '14px',
        marginBottom: '10px',
      }}>
        {model.left} {operatorLabel} {model.right} equals {model.result}
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        {[
          { label: 'First value', value: model.left, color: '#38bdf8' },
          { label: 'Second value', value: model.right, color: '#a78bfa' },
          { label: 'Result', value: model.result, color: '#22c55e' },
        ].map((row) => (
          <div key={row.label} style={{ display: 'grid', gap: '4px' }}>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '12px',
              color: '#cbd5e1',
              fontWeight: 700,
            }}>
              {row.label}: {row.value}
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              borderRadius: '999px',
              background: 'rgba(148, 163, 184, 0.22)',
            }}>
              <div style={{
                width: widthFor(row.value, maxMagnitude),
                height: '100%',
                borderRadius: '999px',
                background: `linear-gradient(90deg, ${row.color}, rgba(255,255,255,0.65))`,
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
