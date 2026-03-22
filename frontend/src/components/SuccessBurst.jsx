import { useMemo } from 'react'
import { EDU_THEME } from '../styles/designSystem'

const BURST_DOTS = [
  { top: '8%', left: '10%' },
  { top: '10%', left: '35%' },
  { top: '12%', left: '62%' },
  { top: '15%', left: '84%' },
  { top: '32%', left: '6%' },
  { top: '36%', left: '22%' },
  { top: '40%', left: '80%' },
  { top: '44%', left: '92%' },
  { top: '65%', left: '8%' },
  { top: '70%', left: '20%' },
  { top: '74%', left: '82%' },
  { top: '77%', left: '90%' },
]

export default function SuccessBurst({ active, message = 'Great work! Your solution is ready.' }) {
  const dots = useMemo(() => BURST_DOTS, [])
  if (!active) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="success-burst"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '12px',
        border: `1px solid rgba(34, 197, 94, 0.35)`,
        background: 'rgba(34, 197, 94, 0.12)',
        padding: '10px 14px',
        marginBottom: '12px',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
        zIndex: 2,
      }}>
        <div className="success-burst-check" style={{
          width: '24px',
          height: '24px',
          borderRadius: '999px',
          background: EDU_THEME.colors.success,
          color: '#052e16',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 900,
          fontSize: '15px',
        }}>
          ✓
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          color: '#dcfce7',
          fontWeight: 800,
          fontSize: '14px',
          letterSpacing: '0.4px',
        }}>
          {message}
        </div>
      </div>
      {dots.map((dot, index) => (
        <span
          key={`${dot.top}-${dot.left}`}
          className="success-burst-dot"
          style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            borderRadius: '999px',
            top: dot.top,
            left: dot.left,
            background: index % 3 === 0 ? '#22c55e' : index % 3 === 1 ? '#67e8f9' : '#86efac',
            animationDelay: `${index * 38}ms`,
          }}
        />
      ))}
    </div>
  )
}
