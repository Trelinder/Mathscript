import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { getPdfUrl } from '../api/client'

export default function ParentDashboard({ sessionId, session, onClose, subscription, onUpgrade }) {
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

      {!subscription?.is_premium && (
        <div style={{
          marginTop: '24px',
          padding: '20px',
          background: 'rgba(124,58,237,0.06)',
          border: '1px solid rgba(124,58,237,0.2)',
          borderRadius: '14px',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}>
            <div style={{
              flex: 1,
              minWidth: '120px',
              background: 'rgba(0,212,255,0.06)',
              border: '1px solid rgba(0,212,255,0.15)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '24px',
                fontWeight: 800,
                color: '#00d4ff',
                marginBottom: '4px',
              }}>{session.history?.length || 0}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: '#9ca3af',
                letterSpacing: '0.5px',
              }}>Quests Completed</div>
            </div>
            <div style={{
              flex: 1,
              minWidth: '120px',
              background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.15)',
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '24px',
                fontWeight: 800,
                color: '#a855f7',
                marginBottom: '4px',
              }}>{new Set((session.history || []).map(e => e.concept)).size}</div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                color: '#9ca3af',
                letterSpacing: '0.5px',
              }}>Skills Practiced</div>
            </div>
          </div>

          <div style={{
            background: 'rgba(17,24,39,0.8)',
            border: '1px solid rgba(0,212,255,0.15)',
            borderRadius: '14px',
            padding: '24px',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '11px',
              fontWeight: 700,
              color: '#7c3aed',
              letterSpacing: '2px',
              marginBottom: '12px',
              textTransform: 'uppercase',
            }}>Why Premium?</div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              color: '#e8e8f0',
              marginBottom: '20px',
              lineHeight: '1.4',
            }}>Unlock Your Child's Full Potential</div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '24px',
            }}>
              {[
                '📚 Unlimited daily quests (free tier: 3/day)',
                '🦸 All 8 hero characters unlocked',
                '🎙️ AI voice narration reads stories aloud',
                '⚔️ Exclusive legendary gear in the shop',
                '📊 More practice = stronger math skills',
              ].map((item, i) => (
                <div key={i} style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#d1d5db',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}>{item}</div>
              ))}
            </div>
            <button onClick={onUpgrade} style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '14px',
              fontWeight: 700,
              color: '#fff',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none',
              borderRadius: '12px',
              padding: '14px 32px',
              cursor: 'pointer',
              width: '100%',
              boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
              transition: 'all 0.2s',
              letterSpacing: '1px',
              marginBottom: '10px',
            }}>Start 3-Day Free Trial</button>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
              color: '#6b7280',
              textAlign: 'center',
            }}>Only $9.99/month or $79.99/year</div>
          </div>
        </div>
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
