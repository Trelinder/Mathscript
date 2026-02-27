import { useMemo, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { getPdfUrl } from '../api/client'

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

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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

      {history.length > 0 ? (
        <>
          <table className="parent-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr>
                {['Date', 'Concept', 'Hero'].map(h => (
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
