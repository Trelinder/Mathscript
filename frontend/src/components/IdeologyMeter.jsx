/**
 * IdeologyMeter — visual bar showing the player's narrative alignment.
 * Left side (negative) = Constructive Thinker
 * Right side (positive) = Free-Spirit Explorer
 */
export default function IdeologyMeter({ meter = 0, label = 'Balanced Explorer', compact = false }) {
  // meter: -100 to +100
  const pct = ((meter + 100) / 200) * 100  // 0–100%

  const leftColor = '#3b82f6'   // Constructive — blue
  const rightColor = '#a855f7'  // Explorative — purple
  const midColor = '#00d4ff'

  // Interpolate colour based on position
  const barColor = meter < -20
    ? leftColor
    : meter > 20
      ? rightColor
      : midColor

  if (compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '120px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.4px',
          color: 'rgba(255,255,255,0.5)',
        }}>
          <span>🏗️</span>
          <span style={{ color: barColor, fontSize: '9px' }}>{label}</span>
          <span>🔭</span>
        </div>
        <div style={{
          height: '5px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${leftColor}, ${barColor})`,
            borderRadius: '3px',
            transition: 'width 0.6s ease',
          }} />
          {/* Center marker */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: '1px',
            height: '100%',
            background: 'rgba(255,255,255,0.4)',
          }} />
        </div>
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
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '1px',
        color: '#94a3b8',
        marginBottom: '6px',
        textTransform: 'uppercase',
      }}>
        Narrative Alignment
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '11px',
        fontWeight: 700,
        color: 'rgba(255,255,255,0.6)',
      }}>
        <span style={{ color: leftColor }}>🏗️ Constructive</span>
        <span style={{ color: barColor, fontSize: '12px' }}>{label}</span>
        <span style={{ color: rightColor }}>Explorative 🔭</span>
      </div>

      <div style={{
        height: '10px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '6px',
        overflow: 'hidden',
        position: 'relative',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Gradient track */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, ${leftColor}22, transparent 50%, ${rightColor}22)`,
        }} />
        {/* Fill indicator */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${leftColor}, ${barColor})`,
          borderRadius: '6px',
          transition: 'width 0.8s ease',
          boxShadow: `0 0 8px ${barColor}88`,
        }} />
        {/* Center marker */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: '2px',
          height: '100%',
          background: 'rgba(255,255,255,0.3)',
        }} />
      </div>

      <div style={{
        marginTop: '4px',
        textAlign: 'center',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '10px',
        color: 'rgba(255,255,255,0.35)',
      }}>
        {meter > 0 ? '+' : ''}{meter} / 100
      </div>
    </div>
  )
}
