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
      background: 'rgba(26,26,46,0.95)',
      border: '3px solid #4ecca3',
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '14px',
        color: '#4ecca3',
        marginBottom: '20px',
      }}>
        Parent Command Center
      </div>

      {session.history && session.history.length > 0 ? (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr>
                {['Date', 'Concept', 'Hero'].map(h => (
                  <th key={h} style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '9px',
                    color: '#4ecca3',
                    padding: '10px 8px',
                    borderBottom: '2px solid #4ecca3',
                    textAlign: 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {session.history.map((entry, i) => (
                <tr key={i}>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: '13px' }}>{entry.time}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: '13px' }}>{entry.concept}</td>
                  <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#ccc', fontSize: '13px' }}>{entry.hero}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a href={getPdfUrl(sessionId)} download style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            color: '#1a1a2e',
            background: 'linear-gradient(180deg, #4ecca3, #2a9d6a)',
            padding: '10px 20px',
            borderRadius: '6px',
            textDecoration: 'none',
            display: 'inline-block',
          }}>Download PDF Report</a>
        </>
      ) : (
        <div style={{ color: '#888', fontSize: '14px' }}>No quests completed yet. Start a quest to see progress!</div>
      )}

      <div style={{ marginTop: '16px' }}>
        <button onClick={onClose} style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '10px',
          color: '#888',
          background: 'none',
          border: '1px solid #555',
          borderRadius: '6px',
          padding: '8px 16px',
          cursor: 'pointer',
        }}>Close</button>
      </div>
    </div>
  )
}
