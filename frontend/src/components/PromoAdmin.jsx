/**
 * PromoAdmin — Admin panel section for generating and viewing promo codes.
 *
 * Accepts the same `adminKey` prop pattern as FeatureFlagAdmin. When no key
 * is stored, it renders an inline key-entry form. Once authenticated it shows:
 *   - Stats: total / available / redeemed breakdown
 *   - Code generator: choose duration (30-day / 90-day / lifetime) + quantity
 *   - Full codes table with filter tabs (All / Available / Redeemed)
 */

import { useState, useEffect, useCallback } from 'react'
import { adminListPromoCodes, adminGeneratePromoCodes } from '../api/client'

const BADGE = {
  available: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e', text: 'Available' },
  redeemed:  { bg: 'rgba(249,115,22,0.15)', color: '#f97316', text: 'Redeemed'  },
  d30:       { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', text: '30 Day'    },
  d90:       { bg: 'rgba(139,92,246,0.15)',  color: '#8b5cf6', text: '90 Day'    },
  lifetime:  { bg: 'rgba(245,158,11,0.15)',  color: '#f59e0b', text: 'Lifetime'  },
}

function Chip({ type }) {
  const s = BADGE[type] || BADGE.available
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
      fontSize: '11px', fontWeight: 700,
      background: s.bg, color: s.color,
    }}>
      {s.text}
    </span>
  )
}

export default function PromoAdmin({ adminKey: propAdminKey }) {
  const [adminKey, setAdminKey] = useState(() => {
    try { return sessionStorage.getItem('ms_promo_admin_key') || propAdminKey || '' } catch { return propAdminKey || '' }
  })
  const [keyInput, setKeyInput]   = useState('')
  const [codes, setCodes]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [generating, setGenerating] = useState(false)
  const [filter, setFilter]       = useState('all')
  const [durationType, setDurationType] = useState('30_day')
  const [count, setCount]         = useState(1)
  const [freshCodes, setFreshCodes] = useState([])
  const [error, setError]         = useState('')
  const [toast, setToast]         = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const loadCodes = useCallback(async (key) => {
    if (!key) return
    setLoading(true)
    setError('')
    try {
      const data = await adminListPromoCodes(key)
      setCodes(data.codes || [])
    } catch (err) {
      if (err.message === 'HTTP 403') {
        setError('Invalid admin key.')
        setAdminKey('')
        try { sessionStorage.removeItem('ms_promo_admin_key') } catch { /* ignore */ }
      } else {
        setError(`Failed to load: ${err.message}`)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (adminKey) loadCodes(adminKey)
  }, [adminKey, loadCodes])

  const handleKeySubmit = (e) => {
    e.preventDefault()
    const k = keyInput.trim()
    if (!k) return
    try { sessionStorage.setItem('ms_promo_admin_key', k) } catch { /* ignore */ }
    setAdminKey(k)
    setKeyInput('')
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setFreshCodes([])
    setError('')
    try {
      const data = await adminGeneratePromoCodes(adminKey, durationType, count)
      setFreshCodes(data.codes || [])
      showToast(`${data.codes.length} code(s) generated`)
      await loadCodes(adminKey)
    } catch (err) {
      setError(`Generate failed: ${err.message}`)
    }
    setGenerating(false)
  }

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(() => showToast(`Copied: ${code}`))
  }

  if (!adminKey) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '11px', letterSpacing: '2px', color: '#fbbf24', marginBottom: '14px' }}>
          🎟️ PROMO CODES
        </div>
        <form onSubmit={handleKeySubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder="Admin API key"
            style={{
              flex: '1 1 200px', padding: '9px 14px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', outline: 'none',
            }}
          />
          <button type="submit" style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '13px',
            color: '#fff', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer',
          }}>
            Unlock
          </button>
        </form>
      </div>
    )
  }

  const available = codes.filter(c => !c.redeemed).length
  const redeemed  = codes.filter(c => c.redeemed).length
  const d30       = codes.filter(c => c.duration_type === '30_day').length
  const d90       = codes.filter(c => c.duration_type === '90_day').length
  const life      = codes.filter(c => c.duration_type === 'lifetime').length

  const filtered = filter === 'available'
    ? codes.filter(c => !c.redeemed)
    : filter === 'redeemed'
    ? codes.filter(c => c.redeemed)
    : codes

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '11px', letterSpacing: '2px', color: '#fbbf24' }}>
          🎟️ PROMO CODES
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => loadCodes(adminKey)} disabled={loading} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
            color: '#9ca3af', background: 'transparent', border: '1px solid rgba(156,163,175,0.2)',
            borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
          }}>{loading ? '…' : '↺ Refresh'}</button>
          <button onClick={() => {
            try { sessionStorage.removeItem('ms_promo_admin_key') } catch { /* ignore */ }
            setAdminKey(''); setCodes([])
          }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
            color: '#f87171', background: 'transparent', border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
          }}>Lock</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginBottom: '20px' }}>
        {[
          ['Total', codes.length, '#7dd3fc'],
          ['Available', available, '#22c55e'],
          ['Redeemed', redeemed, '#f97316'],
          ['30-Day', d30, '#3b82f6'],
          ['90-Day', d90, '#8b5cf6'],
          ['Lifetime', life, '#f59e0b'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '12px 8px', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '20px', fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Generator */}
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '10px', letterSpacing: '1.5px', color: '#fbbf24', marginBottom: '12px' }}>
          GENERATE NEW CODES
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: '#6b7280' }}>Duration</label>
            <select value={durationType} onChange={e => setDurationType(e.target.value)} style={{
              padding: '8px 12px', background: '#111827', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#e0e0e0', fontSize: '13px', outline: 'none',
            }}>
              <option value="30_day">30 Day</option>
              <option value="90_day">90 Day</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: '#6b7280' }}>Quantity</label>
            <input
              type="number" min="1" max="50" value={count}
              onChange={e => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              style={{
                width: '72px', padding: '8px 10px', background: '#111827',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', color: '#e0e0e0', fontSize: '13px', outline: 'none',
              }}
            />
          </div>
          <button onClick={handleGenerate} disabled={generating} style={{
            fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '14px',
            color: '#fff', background: generating ? 'rgba(245,158,11,0.4)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            border: 'none', borderRadius: '8px', padding: '9px 22px', cursor: generating ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}>
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>

        {freshCodes.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', color: '#22c55e', marginBottom: '6px', fontWeight: 700 }}>
              ✓ {freshCodes.length} code(s) created — click to copy
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {freshCodes.map(c => (
                <button key={c} onClick={() => copyCode(c)} style={{
                  fontFamily: 'monospace', fontSize: '13px', padding: '6px 12px',
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: '6px', color: '#86efac', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}>{c}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
        {[['all', 'All'], ['available', 'Available'], ['redeemed', 'Redeemed']].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{
            padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
            border: 'none', cursor: 'pointer',
            background: filter === val ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.04)',
            color: filter === val ? '#fff' : '#9ca3af',
          }}>{label}</button>
        ))}
      </div>

      {/* Codes table */}
      {loading && codes.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: '13px', padding: '16px 0' }}>Loading codes…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>No codes to display</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Code', 'Duration', 'Status', 'Redeemed By', 'Created'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '10px', color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.code} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '9px 8px' }}>
                    <button onClick={() => copyCode(c.code)} style={{ fontFamily: 'monospace', fontSize: '13px', color: '#7dd3fc', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} title="Click to copy">
                      {c.code}
                    </button>
                  </td>
                  <td style={{ padding: '9px 8px' }}><Chip type={c.duration_type === 'lifetime' ? 'lifetime' : c.duration_type === '90_day' ? 'd90' : 'd30'} /></td>
                  <td style={{ padding: '9px 8px' }}><Chip type={c.redeemed ? 'redeemed' : 'available'} /></td>
                  <td style={{ padding: '9px 8px', fontSize: '12px', color: '#6b7280', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.redeemed_by || ''}>{c.redeemed_by || '—'}</td>
                  <td style={{ padding: '9px 8px', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px',
          background: '#22c55e', color: '#fff', padding: '10px 20px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 700,
          zIndex: 9999, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
