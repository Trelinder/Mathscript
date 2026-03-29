/**
 * PerseveranceBar — shows the player's growth mindset / perseverance score.
 * Score increases when hints are used and problems are eventually solved.
 */
export default function PerseveranceBar({ score = 0, compact = false }) {
  // Score milestones: 10 = Never Give Up, 25 = Iron Will
  const maxDisplay = 30
  const pct = Math.min((score / maxDisplay) * 100, 100)
  const color = score >= 25 ? '#f59e0b' : score >= 10 ? '#22c55e' : '#00d4ff'

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: '80px' }}>
        <span style={{ fontSize: '12px' }}>💪</span>
        <div style={{
          flex: 1,
          height: '5px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, #00d4ff, ${color})`,
            borderRadius: '3px',
            transition: 'width 0.6s ease',
          }} />
        </div>
        <span style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '10px',
          fontWeight: 700,
          color,
          minWidth: '22px',
          textAlign: 'right',
        }}>
          {score}
        </span>
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(15,23,42,0.85)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '12px',
      padding: '12px 14px',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '1px',
          color: '#94a3b8',
          textTransform: 'uppercase',
        }}>
          💪 Perseverance
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          fontWeight: 800,
          color,
        }}>
          {score}
        </div>
      </div>

      <div style={{
        height: '8px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '5px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, #00d4ff, ${color})`,
          borderRadius: '5px',
          transition: 'width 0.8s ease',
          boxShadow: `0 0 6px ${color}88`,
        }} />
      </div>

      <div style={{
        marginTop: '4px',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '10px',
        color: 'rgba(255,255,255,0.35)',
      }}>
        {score < 10 ? `${10 - score} more to earn 💪 Never Give Up badge` :
         score < 25 ? `${25 - score} more to earn 🛡️ Iron Will badge` :
         '🛡️ Iron Will achieved!'}
      </div>
    </div>
  )
}
