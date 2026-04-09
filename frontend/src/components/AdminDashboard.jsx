import { useState, useEffect, useRef, useCallback } from 'react'

const BASE_URL = import.meta.env.VITE_API_BASE ?? ''

// ── Shared style tokens ──────────────────────────────────────────────────────

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

// ── MetricCard ───────────────────────────────────────────────────────────────

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

// ── ECharts loader (CDN, no npm install needed) ───────────────────────────────

function useECharts(ref, option, deps) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const win = window
    if (!win.echarts) return
    let chart = win.echarts.getInstanceByDom(el) || win.echarts.init(el, 'dark')
    chart.setOption(option, true)
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'

function useLoadECharts(onLoaded) {
  useEffect(() => {
    if (window.echarts) { onLoaded(); return }
    const existing = document.getElementById('echarts-cdn')
    if (existing) {
      existing.addEventListener('load', onLoaded, { once: true })
      return
    }
    const s = document.createElement('script')
    s.id = 'echarts-cdn'
    s.src = ECHARTS_CDN
    s.onload = onLoaded
    document.head.appendChild(s)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function buildDauOption(labels, dauData) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#6b7280', fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1f2937' } },
    },
    series: [{
      name: 'DAU',
      type: 'line',
      smooth: true,
      data: dauData,
      itemStyle: { color: '#60a5fa' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#60a5fa44' }, { offset: 1, color: '#60a5fa00' }] } },
    }],
  }
}

function buildRevOption(labels, revData) {
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', valueFormatter: v => `$${v.toFixed(2)}` },
    grid: { left: 56, right: 16, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#6b7280', fontSize: 10, rotate: 30 },
      axisLine: { lineStyle: { color: '#374151' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280', fontSize: 10, formatter: v => `$${v}` },
      splitLine: { lineStyle: { color: '#1f2937' } },
    },
    series: [{
      name: 'Revenue',
      type: 'bar',
      data: revData,
      itemStyle: { color: '#a78bfa', borderRadius: [4, 4, 0, 0] },
    }],
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard({ adminKey }) {
  const [stats, setStats]         = useState(null)
  const [kpi, setKpi]             = useState(null)
  const [history, setHistory]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [echartsReady, setEchartsReady] = useState(!!window.echarts)

  const dauRef = useRef(null)
  const revRef = useRef(null)
  const sseRef = useRef(null)

  // Derive the admin key from prop or sessionStorage (set by FeatureFlagAdmin / PromoAdmin login flow)
  const getStoredAdminKey = () => { try { return sessionStorage.getItem('ms_admin_key') || '' } catch { return '' } }
  const key = adminKey || getStoredAdminKey()

  useLoadECharts(() => setEchartsReady(true))

  // ── Load legacy telemetry stats (existing endpoint) ──────────────────────
  const loadStats = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${BASE_URL}/api/admin/telemetry-stats`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(data => { setStats(data); setLastRefresh(new Date()) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // ── Load KPI history for charts ──────────────────────────────────────────
  const loadHistory = useCallback(() => {
    if (!key) return
    fetch(`${BASE_URL}/api/admin/kpi-history?days=14`, { headers: { 'x-admin-key': key } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setHistory(data) })
      .catch(() => {})
  }, [key])

  useEffect(() => {
    loadStats()
    loadHistory()
  }, [loadStats, loadHistory])

  // ── SSE subscription for live KPI cards ─────────────────────────────────
  useEffect(() => {
    if (!key) return
    const url = `${BASE_URL}/api/admin/kpi-stream?key=${encodeURIComponent(key)}`
    const es = new EventSource(url)
    sseRef.current = es
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setKpi(data)
        setLastRefresh(new Date())
      } catch (parseErr) {
        console.warn('[AdminDashboard] SSE parse error:', parseErr)
      }
    }
    es.onerror = (err) => {
      console.warn('[AdminDashboard] SSE connection error — will retry automatically:', err)
    }
    return () => { es.close(); sseRef.current = null }
  }, [key])

  // ── Render DAU chart ─────────────────────────────────────────────────────
  useECharts(
    dauRef,
    history ? buildDauOption(history.labels, history.dau) : null,
    [echartsReady, history],
  )

  // ── Render Revenue chart ──────────────────────────────────────────────────
  useECharts(
    revRef,
    history ? buildRevOption(history.labels, history.revenue) : null,
    [echartsReady, history],
  )

  const fmtTime = (s) => {
    if (!s) return '—'
    if (s < 60) return `${Math.round(s)}s`
    return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
  }

  const rows = stats ? [
    { event: 'spell_cast',      label: 'Spell Cast',       count: stats.spells_cast      ?? 0 },
    { event: 'tycoon_purchase', label: 'Tycoon Purchase',  count: stats.tycoon_purchases ?? 0 },
  ] : []

  return (
    <div style={{ padding: '0 0 32px', fontFamily: "'Rajdhani', sans-serif" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
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
          onClick={() => { loadStats(); loadHistory() }}
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

      {/* ── Game KPI cards (live via SSE) ──────────────────────────────── */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#34d399', letterSpacing: '1px', marginBottom: '12px' }}>
          🎮 GAME KPIs {kpi ? <span style={{ color: '#4b5563', fontWeight: 400 }}>— live</span> : <span style={{ color: '#4b5563', fontWeight: 400 }}>— awaiting stream</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <MetricCard emoji="👥" label="Daily Active Players"    value={kpi ? kpi.dau.toLocaleString()                     : '—'} accent="#34d399" />
          <MetricCard emoji="💰" label="ARPU (30d)"              value={kpi ? `$${kpi.arpu.toFixed(2)}`                    : '—'} accent="#fbbf24" />
          <MetricCard emoji="📉" label="Churn Rate"              value={kpi ? `${kpi.churn_rate_pct.toFixed(1)}%`          : '—'} accent="#f87171" />
          <MetricCard emoji="⏱️" label="Avg Session Length"      value={kpi ? fmtTime(kpi.avg_session_s)                   : '—'} accent="#a78bfa" />
        </div>
      </div>

      {/* ── Legacy event metric cards ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <MetricCard emoji="⚡" label="Spells Cast"       value={stats?.spells_cast    ?? (loading ? '…' : '0')} accent="#60a5fa" />
        <MetricCard emoji="🎯" label="Math Accuracy"     value={stats ? `${stats.math_accuracy_pct ?? 0}%` : (loading ? '…' : '0%')} accent="#4ade80" />
        <MetricCard emoji="📊" label="Total Answers"     value={stats?.total_answers  ?? (loading ? '…' : '0')} accent="#fbbf24" />
        <MetricCard emoji="🛒" label="Tycoon Purchases"  value={stats?.tycoon_purchases ?? (loading ? '…' : '0')} accent="#f472b6" />
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────── */}
      {!echartsReady && (
        <div style={{ color: '#4b5563', fontSize: '12px', marginBottom: '16px' }}>⏳ Loading charts…</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ ...card, padding: '16px 20px' }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#60a5fa', letterSpacing: '1px', marginBottom: '8px' }}>📈 DAU — Last 14 Days</div>
          <div ref={dauRef} style={{ width: '100%', height: '200px' }} />
        </div>
        <div style={{ ...card, padding: '16px 20px' }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#a78bfa', letterSpacing: '1px', marginBottom: '8px' }}>💵 Revenue — Last 14 Days</div>
          <div ref={revRef} style={{ width: '100%', height: '200px' }} />
        </div>
      </div>

      {/* ── Event breakdown table ──────────────────────────────────────── */}
      <div style={{ ...card, padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: 'rgba(99,102,241,0.08)' }}>
              <th style={{ padding: '12px 20px', textAlign: 'left',  color: '#6b7280', fontSize: '11px', letterSpacing: '1.5px', fontWeight: 700, textTransform: 'uppercase' }}>Event Type</th>
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
