import { useState, useEffect, useCallback } from 'react'

const BASE_URL = import.meta.env.VITE_API_BASE ?? ''

const card = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(99,102,241,0.25)',
  borderRadius: '16px',
  padding: '24px 28px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const metricLabel = {
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '1.5px',
  color: '#6b7280',
  textTransform: 'uppercase',
}

const metricValue = {
  fontFamily: "'Orbitron', sans-serif",
  fontSize: 'clamp(28px, 4vw, 44px)',
  fontWeight: 800,
  background: 'linear-gradient(135deg, #60a5fa, #a78bfa)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  lineHeight: 1,
}

function MetricCard({ label, value, accent, emoji }) {
  return (
    <div style={{
      ...card,
      borderColor: `${accent}40`,
      background: `radial-gradient(ellipse at top left, ${accent}0a, transparent 70%), rgba(255,255,255,0.02)`,
    }}>
      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{emoji}</div>
      <div style={{ ...metricValue, background: `linear-gradient(135deg, ${accent}, #c4b5fd)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {value ?? '—'}
      </div>
      <div style={metricLabel}>{label}</div>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const loadStats = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${BASE_URL}/api/admin/telemetry-stats`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setStats(data)
        setLastRefresh(new Date())
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const rows = stats ? [
    { event: 'spell_cast', label: 'Spell Cast', count: stats.spells_cast ?? 0 },
    { event: 'tycoon_purchase', label: 'Tycoon Purchase', count: stats.tycoon_purchases ?? 0 },
  ] : []

  return (
    <div style={{ padding: '0 0 32px', fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 800, color: '#7dd3fc', letterSpacing: '1px' }}>
            📡 TELEMETRY STATS
          </div>
          {lastRefresh && (
            <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <button
          onClick={loadStats}
          disabled={loading}
          style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#a78bfa', background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.3)', borderRadius: '10px',
            padding: '8px 16px', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
          }}
        >
          {loading ? '⏳ Loading…' : '🔄 Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '12px', padding: '12px 16px', color: '#f87171', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ Could not load telemetry stats: {error}
        </div>
      )}

      {/* Big metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <MetricCard emoji="⚡" label="Spells Cast" value={stats?.spells_cast ?? (loading ? '…' : '0')} accent="#60a5fa" />
        <MetricCard emoji="🎯" label="Math Accuracy" value={stats ? `${stats.math_accuracy_pct ?? 0}%` : (loading ? '…' : '0%')} accent="#4ade80" />
        <MetricCard emoji="📊" label="Total Answers" value={stats?.total_answers ?? (loading ? '…' : '0')} accent="#fbbf24" />
        <MetricCard emoji="🛒" label="Tycoon Purchases" value={stats?.tycoon_purchases ?? (loading ? '…' : '0')} accent="#f472b6" />
      </div>

      {/* Event breakdown table */}
      <div style={{ ...card, padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'rgba(99,102,241,0.08)' }}>
              <th style={{ padding: '12px 20px', textAlign: 'left', color: '#6b7280', fontSize: '11px', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>Event Type</th>
              <th style={{ padding: '12px 20px', textAlign: 'right', color: '#6b7280', fontSize: '11px', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={2} style={{ padding: '20px', textAlign: 'center', color: '#4b5563', fontSize: '13px' }}>
                  No telemetry events recorded yet.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.event} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '12px 20px', color: '#c4b5fd', fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>{row.label}</td>
                <td style={{ padding: '12px 20px', textAlign: 'right', color: '#e5e7eb', fontFamily: "'Orbitron', sans-serif", fontSize: '13px' }}>{row.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
