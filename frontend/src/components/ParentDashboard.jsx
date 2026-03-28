import { useMemo, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { getPdfUrl } from '../api/client'
import GuildBadge from './GuildBadge'
import IdeologyMeter from './IdeologyMeter'
import PerseveranceBar from './PerseveranceBar'

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

const GUILD_NAMES = {
  architects: 'The Architects',
  chronos_order: 'The Chronos Order',
  strategists: 'The Strategists',
}

function ParentDashboard({ sessionId, session, onClose }) {
  const ref = useRef(null)
  const history = session?.history || []
  const guild = session?.guild || null
  const ideologyMeter = Number(session?.ideology_meter ?? 0)
  const ideologyLabel = session?.ideology_label ?? 'Balanced Explorer'
  const perseveranceScore = Number(session?.perseverance_score ?? 0)
  const difficultyLabel = session?.difficulty_label ?? 'Journeyman'
  const difficultyLevel = Number(session?.difficulty_level ?? 3)
  const hintCount = Number(session?.hint_count ?? 0)

  const conceptBreakdown = useMemo(() => {
    const map = {}
    history.forEach((entry) => {
      const key = classifyConcept(entry?.concept)
      map[key] = (map[key] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [history])

  // Per-guild quest counts from history
  const guildBreakdown = useMemo(() => {
    const map = {}
    history.forEach((entry) => {
      if (entry?.guild) {
        const name = GUILD_NAMES[entry.guild] || entry.guild
        map[name] = (map[name] || 0) + 1
      }
    })
    return Object.entries(map)
  }, [history])

  useEffect(() => {
    gsap.from(ref.current, { y: 50, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' })
  }, [])

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

      {/* ── Core stats row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '10px',
        marginBottom: '16px',
      }}>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>QUESTS</div>
          <div style={{ color: '#fbbf24', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{session?.quests_completed || history.length}</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>STREAK</div>
          <div style={{ color: '#22c55e', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{session?.streak_count || 1} 🔥</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>BADGES</div>
          <div style={{ color: '#a855f7', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{session?.badges?.length || 0}</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>DIFFICULTY</div>
          <div style={{ color: '#00d4ff', fontSize: '16px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif", marginTop: '3px' }}>{difficultyLabel}</div>
          <div style={{ fontSize: '10px', color: '#4b5563', fontFamily: "'Rajdhani', sans-serif" }}>Lvl {difficultyLevel}/10 (auto)</div>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>HINTS USED</div>
          <div style={{ color: '#fbbf24', fontSize: '21px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{hintCount} 💡</div>
          <div style={{ fontSize: '10px', color: '#4b5563', fontFamily: "'Rajdhani', sans-serif" }}>Shows curiosity!</div>
        </div>
      </div>

      {/* ── Guild & Growth Mindset ── */}
      {(guild || perseveranceScore > 0 || ideologyMeter !== 0) && (
        <div style={{
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#a855f7', letterSpacing: '1.5px' }}>
            GUILD &amp; GROWTH
          </div>
          {guild && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <GuildBadge guild={guild} compact />
              {guildBreakdown.length > 0 && (
                <span style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', color: '#9ca3af' }}>
                  {guildBreakdown.map(([name, count]) => `${name}: ${count} quest${count !== 1 ? 's' : ''}`).join(' · ')}
                </span>
              )}
            </div>
          )}
          {perseveranceScore > 0 && (
            <PerseveranceBar score={perseveranceScore} />
          )}
          {ideologyMeter !== 0 && (
            <IdeologyMeter meter={ideologyMeter} label={ideologyLabel} />
          )}
        </div>
      )}

      {/* ── Badge showcase ── */}
      {session?.badge_details?.length > 0 && (
        <div style={{
          background: 'rgba(251,191,36,0.04)',
          border: '1px solid rgba(251,191,36,0.15)',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '14px',
        }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '10px', fontWeight: 700, color: '#fbbf24', letterSpacing: '1.5px', marginBottom: '8px' }}>
            BADGES EARNED
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {session.badge_details.map((b) => (
              <div key={b.id} title={b.name} style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '12px',
                fontWeight: 700,
                color: '#fde68a',
                border: '1px solid rgba(251,191,36,0.25)',
                borderRadius: '8px',
                padding: '4px 8px',
                background: 'rgba(251,191,36,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span>{b.emoji}</span> {b.name}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {history.length > 0 ? (
        <>
          <table className="parent-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr>
                {['Date', 'Concept', 'Hero', 'Guild'].map(h => (
                  <th key={h} style={{
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
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#c0c0d0', fontSize: '14px', fontWeight: 500 }}>
                    {entry.guild ? (GUILD_NAMES[entry.guild] || entry.guild) : '—'}
                  </td>
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

export { ParentDashboard }
export default ParentDashboard

