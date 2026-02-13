import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { getPdfUrl } from '../api/client'

export default function ParentDashboard({ sessionId, session, onClose }) {
  const ref = useRef(null)

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
        marginBottom: '20px',
        letterSpacing: '2px',
      }}>
        PARENT COMMAND CENTER
      </div>

      {session.history && session.history.length > 0 ? (
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
              {session.history.map((entry, i) => (
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
