/**
 * FeatureFlagAdmin — Admin Portal component for managing dynamic feature flags.
 *
 * Shows a list of all registered flags as toggle switches.  Each toggle
 * immediately calls PATCH /api/admin/feature-flags/{name} and reflects the
 * new state returned by the server.  Changes propagate to end-users within
 * 30 seconds (the server-side TTL cache).
 *
 * Authentication: the component accepts an `adminKey` prop that is sent as
 * the `x-admin-key` header on every request.  If no key is stored yet the
 * component renders a small inline key-entry form.
 */

import { useState, useEffect, useCallback } from 'react'
import { adminGetFeatureFlags, adminPatchFeatureFlag } from '../api/client'

// ── Descriptions shown when the server returns an empty description ───────────
const FALLBACK_DESCRIPTIONS = {
  CONCRETE_PACKERS:  'Drag-and-drop addition/place-value game (age 5–7)',
  POTION_ALCHEMISTS: 'Fraction equivalence pouring game (age 8–13)',
  ORBITAL_ENGINEERS: 'Orbital geometry angles game (coming soon)',
}

// ── Toggle switch styles ──────────────────────────────────────────────────────
const TOGGLE_STYLE = `
  .ff-toggle { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; }
  .ff-toggle input { opacity: 0; width: 0; height: 0; }
  .ff-slider {
    position: absolute; inset: 0; border-radius: 34px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    transition: background 0.25s;
  }
  .ff-slider:before {
    content: ''; position: absolute;
    width: 18px; height: 18px; border-radius: 50%;
    background: #9ca3af; left: 2px; top: 2px;
    transition: transform 0.25s, background 0.25s;
  }
  .ff-toggle input:checked + .ff-slider { background: rgba(34,197,94,0.25); border-color: rgba(34,197,94,0.5); }
  .ff-toggle input:checked + .ff-slider:before { background: #22c55e; transform: translateX(20px); }
  .ff-toggle input:disabled + .ff-slider { opacity: 0.45; cursor: not-allowed; }
`

export default function FeatureFlagAdmin({ adminKey: propAdminKey }) {
  const [adminKey, setAdminKey] = useState(() => {
    try { return sessionStorage.getItem('ms_admin_key') || propAdminKey || '' } catch { return propAdminKey || '' }
  })
  const [keyInput, setKeyInput] = useState('')
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState(null)   // flag_name currently being saved
  const [error, setError] = useState('')
  const [lastSaved, setLastSaved] = useState(null)

  const loadFlags = useCallback(async (key) => {
    if (!key) return
    setLoading(true)
    setError('')
    try {
      const data = await adminGetFeatureFlags(key)
      setFlags(data.flags || [])
    } catch (err) {
      setError(err.message === 'HTTP 403' ? 'Invalid admin key.' : `Load failed: ${err.message}`)
      setFlags([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (adminKey) loadFlags(adminKey)
  }, [adminKey, loadFlags])

  const handleKeySubmit = (e) => {
    e.preventDefault()
    const k = keyInput.trim()
    if (!k) return
    try { sessionStorage.setItem('ms_admin_key', k) } catch { /* ignore */ }
    setAdminKey(k)
    setKeyInput('')
  }

  const handleToggle = async (flagName, newValue) => {
    setToggling(flagName)
    setError('')
    // Optimistic update
    setFlags(prev => prev.map(f => f.flag_name === flagName ? { ...f, is_active: newValue } : f))
    try {
      const updated = await adminPatchFeatureFlag(adminKey, flagName, newValue)
      setFlags(prev => prev.map(f => f.flag_name === flagName ? updated : f))
      setLastSaved({ name: flagName, value: newValue, ts: Date.now() })
    } catch (err) {
      // Revert on failure
      setFlags(prev => prev.map(f => f.flag_name === flagName ? { ...f, is_active: !newValue } : f))
      setError(err.message === 'HTTP 403' ? 'Permission denied.' : `Save failed: ${err.message}`)
    }
    setToggling(null)
  }

  // ── Render: key entry form ────────────────────────────────────────────────
  if (!adminKey) {
    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '11px',
          letterSpacing: '2px', color: '#a78bfa', marginBottom: '14px',
        }}>
          🚩 FEATURE FLAGS
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
          <button
            type="submit"
            style={{
              fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '13px',
              color: '#fff', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '8px', padding: '9px 18px', cursor: 'pointer',
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  // ── Render: flag list ─────────────────────────────────────────────────────
  return (
    <div style={{ padding: '16px 0' }}>
      <style>{TOGGLE_STYLE}</style>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: '11px',
          letterSpacing: '2px', color: '#a78bfa',
        }}>
          🚩 FEATURE FLAGS
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {lastSaved && (
            <div style={{ fontSize: '11px', color: '#22c55e' }}>
              ✓ {lastSaved.name} → {lastSaved.value ? 'ON' : 'OFF'}
            </div>
          )}
          <button
            onClick={() => loadFlags(adminKey)}
            disabled={loading}
            style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
              color: '#9ca3af', background: 'transparent',
              border: '1px solid rgba(156,163,175,0.2)',
              borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
            }}
          >
            {loading ? '…' : '↺ Refresh'}
          </button>
          <button
            onClick={() => {
              try { sessionStorage.removeItem('ms_admin_key') } catch { /* ignore */ }
              setAdminKey('')
              setFlags([])
            }}
            style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
              color: '#f87171', background: 'transparent',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
            }}
          >
            Lock
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '12px', padding: '10px 14px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px', color: '#fca5a5', fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {loading && flags.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: '13px', padding: '8px 0' }}>
          Loading flags…
        </div>
      ) : flags.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: '13px', padding: '8px 0' }}>
          No flags found.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {flags.map((flag) => {
            const isBusy = toggling === flag.flag_name
            const desc = flag.description || FALLBACK_DESCRIPTIONS[flag.flag_name] || ''
            return (
              <div
                key={flag.flag_name}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', gap: '12px',
                  background: flag.is_active ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${flag.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '10px',
                  transition: 'background 0.25s, border-color 0.25s',
                  opacity: isBusy ? 0.7 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Orbitron', sans-serif", fontSize: '11px',
                    fontWeight: 700, color: flag.is_active ? '#22c55e' : '#9ca3af',
                    letterSpacing: '0.5px',
                  }}>
                    {flag.flag_name}
                  </div>
                  {desc && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                      {desc}
                    </div>
                  )}
                  {flag.updated_at && (
                    <div style={{ fontSize: '10px', color: '#4b5563', marginTop: '2px' }}>
                      Last changed: {new Date(flag.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <label className="ff-toggle" title={flag.is_active ? 'Enabled — click to disable' : 'Disabled — click to enable'}>
                  <input
                    type="checkbox"
                    checked={flag.is_active}
                    disabled={isBusy}
                    onChange={e => handleToggle(flag.flag_name, e.target.checked)}
                  />
                  <span className="ff-slider" />
                </label>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '11px', color: '#4b5563' }}>
        Changes propagate to end-users within ~30 seconds (server cache TTL).
      </div>
    </div>
  )
}
