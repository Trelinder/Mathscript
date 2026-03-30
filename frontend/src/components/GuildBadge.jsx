/**
 * GuildBadge — displays the player's current guild/faction membership.
 * Supports compact (pill) and full card modes.
 */

const GUILD_DISPLAY = {
  architects: {
    name: 'Architects',
    emoji: '📐',
    color: '#3b82f6',
    glow: 'rgba(59,130,246,0.4)',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.35)',
  },
  chronos_order: {
    name: 'Chronos Order',
    emoji: '⏱️',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.4)',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.35)',
  },
  strategists: {
    name: 'Strategists',
    emoji: '♟️',
    color: '#8b5cf6',
    glow: 'rgba(139,92,246,0.4)',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.35)',
  },
}

export default function GuildBadge({ guild, tagline, compact = false, onClick }) {
  if (!guild) return null
  const d = GUILD_DISPLAY[guild]
  if (!d) return null

  if (compact) {
    return (
      <button
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: d.bg,
          border: `1px solid ${d.border}`,
          borderRadius: '20px',
          padding: '3px 10px',
          cursor: onClick ? 'pointer' : 'default',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '12px',
          fontWeight: 700,
          color: d.color,
          letterSpacing: '0.4px',
          boxShadow: onClick ? `0 0 10px ${d.glow}` : 'none',
          transition: 'all 0.2s ease',
        }}
        title={tagline || d.name}
      >
        <span style={{ fontSize: '13px' }}>{d.emoji}</span>
        {d.name}
      </button>
    )
  }

  return (
    <div style={{
      background: d.bg,
      border: `1px solid ${d.border}`,
      borderRadius: '14px',
      padding: '14px 16px',
      boxShadow: `0 0 20px ${d.glow}`,
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <span style={{ fontSize: '28px' }}>{d.emoji}</span>
        <div>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            color: d.color,
            letterSpacing: '1px',
          }}>
            {d.name.toUpperCase()}
          </div>
          {tagline && (
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '12px',
              color: 'rgba(255,255,255,0.6)',
              marginTop: '2px',
            }}>
              {tagline}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
