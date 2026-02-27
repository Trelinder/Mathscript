import { useMemo, useRef, useEffect, useState } from 'react'
import { gsap } from 'gsap'
import { getPdfUrl, fetchPrivacySettings, updatePrivacySettings, setParentPin } from '../api/client'
import { formatLocalizedNumber } from '../utils/locale'

function classifyConcept(concept = '') {
  const text = String(concept).toLowerCase()
  if (/[×x*]|multiply|times/.test(text)) return 'Multiplication'
  if (/[÷/]|divide|quotient/.test(text)) return 'Division'
  if (/\+|add|sum/.test(text)) return 'Addition'
  if (/-|minus|subtract/.test(text)) return 'Subtraction'
  if (/fraction|\/\d/.test(text)) return 'Fractions'
  if (/=|equation|variable/.test(text)) return 'Algebra'
  return 'Mixed Practice'
}

export default function ParentDashboard({ sessionId, session, onClose }) {
  const ref = useRef(null)
  const history = useMemo(() => session?.history || [], [session?.history])
  const learningPlan = session?.learning_plan || session?.progression?.learning_plan || null
  const language = session?.preferred_language || 'en'
  const [privacySettings, setPrivacySettings] = useState({
    parental_consent: false,
    allow_telemetry: true,
    allow_personalization: true,
    data_retention_days: 30,
  })
  const [hasParentPin, setHasParentPin] = useState(false)
  const [privacyLoading, setPrivacyLoading] = useState(true)
  const [privacyMessage, setPrivacyMessage] = useState('')

  const conceptBreakdown = useMemo(() => {
    const map = {}
    history.forEach((entry) => {
      const key = classifyConcept(entry?.concept)
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [history])

  useEffect(() => {
    gsap.from(ref.current, { y: 50, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' })
    fetchPrivacySettings(sessionId)
      .then((data) => {
        if (data?.privacy_settings) {
          setPrivacySettings(data.privacy_settings)
        }
        setHasParentPin(Boolean(data?.has_parent_pin))
      })
      .catch(() => {})
      .finally(() => setPrivacyLoading(false))
  }, [sessionId])

  const handleSetParentPin = async () => {
    const pin = window.prompt('Set a parent PIN (4-8 digits)')
    if (!pin) return
    try {
      await setParentPin(sessionId, pin.trim())
      setHasParentPin(true)
      setPrivacyMessage('Parent PIN updated.')
    } catch (err) {
      setPrivacyMessage(err.message || 'Could not update parent PIN')
    }
  }

  const handleSavePrivacy = async () => {
    const pin = window.prompt('Enter parent PIN to save privacy settings')
    if (!pin) return
    try {
      const res = await updatePrivacySettings(sessionId, pin.trim(), privacySettings)
      if (res?.privacy_settings) {
        setPrivacySettings(res.privacy_settings)
      }
      setHasParentPin(Boolean(res?.has_parent_pin))
      setPrivacyMessage('Privacy settings saved.')
    } catch (err) {
      setPrivacyMessage(err.message || 'Could not save privacy settings')
    }
  }

  return (
    <div ref={ref} style={{
      background: 'rgba(17,24,39,0.95)',
      border: '1px solid rgba(0,212,255,0.3)',
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '14px',
        fontWeight: 700,
        color: '#00d4ff',
        marginBottom: '16px',
        letterSpacing: '2px',
      }}>
        PARENT COMMAND CENTER
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '10px',
        marginBottom: '16px',
      }}>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>QUESTS</div>
          <div style={{ color: '#fbbf24', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(session?.quests_completed || history.length, language)}</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>STREAK</div>
          <div style={{ color: '#22c55e', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(session?.streak_count || 1, language)} 🔥</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>BADGES</div>
          <div style={{ color: '#a855f7', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(session?.badges?.length || 0, language)}</div>
        </div>
      </div>

      {conceptBreakdown.length > 0 && (
        <div style={{
          marginBottom: '14px',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid rgba(34,197,94,0.2)',
          background: 'rgba(34,197,94,0.06)',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            color: '#86efac',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            SKILL PRACTICE SUMMARY
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {conceptBreakdown.slice(0, 5).map(([name, count]) => (
              <div key={name} style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#bbf7d0',
                border: '1px solid rgba(134,239,172,0.3)',
                borderRadius: '999px',
                padding: '4px 10px',
                background: 'rgba(134,239,172,0.08)',
              }}>
                {name}: {count}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginBottom: '14px',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid rgba(251,191,36,0.25)',
        background: 'rgba(251,191,36,0.06)',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '11px',
          color: '#fcd34d',
          letterSpacing: '1px',
          marginBottom: '8px',
        }}>
          PARENT SAFETY & PRIVACY
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '13px',
          color: '#fde68a',
          fontWeight: 700,
          marginBottom: '8px',
        }}>
          Parent PIN: {hasParentPin ? 'Enabled' : 'Not set'}
        </div>
        <button
          type="button"
          onClick={handleSetParentPin}
          className="mobile-secondary-btn"
          style={{
            marginBottom: '10px',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            color: '#fef3c7',
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.28)',
            borderRadius: '8px',
            padding: '8px 12px',
            cursor: 'pointer',
          }}
        >
          {hasParentPin ? 'Update Parent PIN' : 'Set Parent PIN'}
        </button>

        {privacyLoading ? (
          <div style={{ color: '#9ca3af', fontFamily: "'Rajdhani', sans-serif", fontSize: '13px' }}>
            Loading privacy settings...
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#e5e7eb', fontFamily: "'Rajdhani', sans-serif", fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={Boolean(privacySettings.parental_consent)}
                onChange={(e) => setPrivacySettings((prev) => ({ ...prev, parental_consent: e.target.checked }))}
              />
              Parent consent confirmed
            </label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#e5e7eb', fontFamily: "'Rajdhani', sans-serif", fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={Boolean(privacySettings.allow_telemetry)}
                onChange={(e) => setPrivacySettings((prev) => ({ ...prev, allow_telemetry: e.target.checked }))}
              />
              Allow anonymous quality telemetry
            </label>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#e5e7eb', fontFamily: "'Rajdhani', sans-serif", fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={Boolean(privacySettings.allow_personalization)}
                onChange={(e) => setPrivacySettings((prev) => ({ ...prev, allow_personalization: e.target.checked }))}
              />
              Allow personalized learning history
            </label>
            <label style={{ color: '#e5e7eb', fontFamily: "'Rajdhani', sans-serif", fontSize: '14px' }}>
              Data retention:
              <select
                value={privacySettings.data_retention_days}
                onChange={(e) => setPrivacySettings((prev) => ({ ...prev, data_retention_days: Number(e.target.value) }))}
                style={{
                  marginLeft: '8px',
                  background: 'rgba(17,24,39,0.8)',
                  color: '#e5e7eb',
                  border: '1px solid rgba(148,163,184,0.35)',
                  borderRadius: '6px',
                  padding: '4px 6px',
                }}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleSavePrivacy}
              className="mobile-secondary-btn"
              style={{
                justifySelf: 'start',
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                color: '#0f172a',
                background: 'linear-gradient(135deg, #22d3ee, #60a5fa)',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              Save Privacy Settings
            </button>
            {privacyMessage && (
              <div role="status" aria-live="polite" style={{
                fontFamily: "'Rajdhani', sans-serif",
                color: '#cbd5e1',
                fontSize: '13px',
                fontWeight: 700,
              }}>
                {privacyMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {learningPlan && Array.isArray(learningPlan.skill_records) && learningPlan.skill_records.length > 0 && (
        <div style={{
          marginBottom: '14px',
          padding: '12px',
          borderRadius: '10px',
          border: '1px solid rgba(59,130,246,0.25)',
          background: 'rgba(59,130,246,0.06)',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '11px',
            color: '#93c5fd',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            MASTERY TRACKER
          </div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            color: '#dbeafe',
            fontWeight: 700,
            marginBottom: '8px',
          }}>
            Average mastery: {learningPlan.average_mastery || 0}%
          </div>
          <div style={{
            display: 'grid',
            gap: '6px',
          }}>
            {learningPlan.skill_records.slice(0, 8).map((record) => (
              <div key={record.skill} style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr 45px',
                gap: '8px',
                alignItems: 'center',
              }}>
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: '#bfdbfe',
                  fontSize: '13px',
                  fontWeight: 700,
                }}>
                  {record.label}
                </div>
                <div style={{
                  height: '8px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${record.mastery_percent || 0}%`,
                    borderRadius: '999px',
                    background: 'linear-gradient(90deg, #3b82f6, #22d3ee)',
                  }} />
                </div>
                <div style={{
                  fontFamily: "'Orbitron', sans-serif",
                  color: '#e2e8f0',
                  fontSize: '11px',
                  textAlign: 'right',
                }}>
                  {record.mastery_percent || 0}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <>
          <table
            className="parent-table"
            aria-label="Recent quest history table"
            style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}
          >
            <thead>
              <tr>
                {['Date', 'Concept', 'Hero'].map(h => (
                  <th key={h} scope="col" style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#00d4ff',
                    padding: '10px 8px',
                    borderBottom: '1px solid rgba(0,212,255,0.3)',
                    textAlign: 'left',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={i}>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#c0c0d0', fontSize: '14px', fontWeight: 500 }}>{entry.time}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#c0c0d0', fontSize: '14px', fontWeight: 500 }}>{entry.concept}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#c0c0d0', fontSize: '14px', fontWeight: 500 }}>{entry.hero}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a href={getPdfUrl(sessionId)} download style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#0a0e1a',
            background: 'linear-gradient(135deg, #00d4ff, #2563eb)',
            padding: '10px 22px',
            borderRadius: '10px',
            textDecoration: 'none',
            display: 'inline-block',
            letterSpacing: '0.5px',
            boxShadow: '0 4px 15px rgba(0,212,255,0.3)',
          }}>Download PDF Report</a>
        </>
      ) : (
        <div style={{ color: '#6b7280', fontSize: '15px', fontWeight: 500 }}>No quests completed yet. Start a quest to see progress!</div>
      )}

      <div style={{ marginTop: '16px' }}>
        <button onClick={onClose} style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#9ca3af',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '8px 18px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}>Close</button>
      </div>
    </div>
  )
}
