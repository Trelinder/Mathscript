import { useState, useEffect } from 'react'
import { getStreak } from '../utils/streak'

/**
 * StreakBadge — top-right fixed badge showing the current answer streak.
 * Only visible when streak > 0.
 * Listens for the custom 'streak:update' window event to refresh.
 */
export default function StreakBadge() {
  const [streak, setStreak] = useState(() => getStreak())

  useEffect(() => {
    const onUpdate = () => setStreak(getStreak())
    window.addEventListener('streak:update', onUpdate)
    return () => window.removeEventListener('streak:update', onUpdate)
  }, [])

  if (streak <= 0) return null

  return (
    <div
      aria-label={`Current streak: ${streak}`}
      style={{
        position: 'fixed',
        top: '14px',
        right: '14px',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(15,20,35,0.88)',
        border: '1.5px solid rgba(251,191,36,0.45)',
        borderRadius: '999px',
        padding: '7px 14px',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 4px 20px rgba(251,191,36,0.2)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '18px', lineHeight: 1 }}>🔥</span>
      <span style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '13px',
        fontWeight: 800,
        color: '#fbbf24',
        letterSpacing: '1px',
      }}>
        {streak}
      </span>
    </div>
  )
}
