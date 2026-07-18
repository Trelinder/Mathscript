import { useState, useEffect } from 'react'
import { trackPlausible } from '../utils/plausible'

/**
 * Landing page following the Hook → Story → Offer framework.
 * Shown to first-time / unauthenticated visitors.
 *
 * Props:
 *   onStart()   --  called when the primary CTA is clicked
 */
export default function Landing({ onStart }) {
  const [email, setEmail] = useState('')
  const [subStatus, setSubStatus] = useState('idle') // idle | loading | success | error
  const [subMsg, setSubMsg] = useState('')
  const [guardianChecked, setGuardianChecked] = useState(false)
  const [showVideo, setShowVideo] = useState(false)

  const scrollToHowItWorks = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    trackPlausible('landing_view')
  }, [])

  async function handleEmailSubmit(e) {
    e.preventDefault()
    if (!email.trim() || !guardianChecked) return
    setSubStatus('loading')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (res.ok) {
        setSubStatus('success')
        setSubMsg("You're on the list! Check your inbox soon.")
        trackPlausible('email_captured')
      } else if (res.status === 409) {
        setSubStatus('success')
        setSubMsg("You're already on the list -- we'll be in touch!")
      } else {
        setSubStatus('error')
        setSubMsg('Something went wrong. Please try again.')
      }
    } catch {
      setSubStatus('error')
      setSubMsg('Could not connect. Please try again.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0e1a 0%, #0f172a 60%, #0a0e1a 100%)',
      color: '#e8e8f0',
      fontFamily: "'Rajdhani', 'Inter', sans-serif",
      overflowX: 'hidden',
    }}>

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
        maxWidth: '920px', margin: '0 auto', padding: '18px 24px',
      }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, color: '#fff', letterSpacing: '1px' }}>
          ✦ MATHSCRIPT
        </div>
        <button
          type="button"
          onClick={scrollToHowItWorks}
          style={{
            border: 'none', background: 'transparent', color: '#cbd5e1',
            fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700,
            padding: '10px 4px', cursor: 'pointer',
          }}
        >
          How it works ↓
        </button>
      </header>

      {/* ── HOOK  --  above the fold ─────────────────────────────────────────── */}
      <section style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: 'clamp(48px,10vw,96px) 24px clamp(40px,8vw,80px)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 'clamp(40px,8vw,64px)', marginBottom: '16px' }}>🎮</div>
        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(24px,5vw,42px)',
          fontWeight: 900,
          lineHeight: 1.2,
          color: '#fff',
          margin: '0 0 16px',
          letterSpacing: '-0.5px',
        }}>
          Your kid will <em style={{ color: '#00d4ff', fontStyle: 'normal' }}>ask</em> to do math.
        </h1>
        <p style={{
          fontSize: 'clamp(15px,2.2vw,18px)',
          color: '#94a3b8',
          marginBottom: '32px',
          lineHeight: 1.6,
        }}>
          (Yes, really. 85 parents already proved it.)
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            aria-label="Start MathScript for free"
            onClick={() => {
              trackPlausible('start_clicked')
              onStart()
            }}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 'clamp(14px,2.2vw,17px)',
              fontWeight: 800,
              color: '#fff',
              background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
              border: 'none',
              borderRadius: '14px',
              padding: '18px 40px',
              cursor: 'pointer',
              letterSpacing: '1px',
              boxShadow: '0 8px 30px rgba(124,58,237,0.45)',
              minHeight: '56px',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(124,58,237,0.55)' }}
            onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 30px rgba(124,58,237,0.45)' }}
          >
            ▶ Start Free  --  No Signup
          </button>

          <button
            type="button"
            aria-expanded={showVideo}
            onClick={() => setShowVideo(v => !v)}
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '15px',
              fontWeight: 700,
              color: '#94a3b8',
              background: 'transparent',
              border: '1px solid rgba(148,163,184,0.25)',
              borderRadius: '10px',
              padding: '12px 24px',
              cursor: 'pointer',
              minHeight: '56px',
            }}
          >
            🎬 See it in action
          </button>
        </div>

        {showVideo && (
          <div style={{
            marginTop: '24px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '20px',
            color: '#64748b',
            fontSize: '14px',
          }}>
            Video demo coming soon  --  meanwhile, just hit Start Free above! 🚀
          </div>
        )}

        <p style={{
          marginTop: '28px',
          fontSize: '13px',
          color: '#475569',
          lineHeight: 1.5,
        }}>
          Built by a dad in Chester, PA  --  for kids who hate worksheets.
        </p>
      </section>

      {/* ── STORY  --  below the fold ──────────────────────────────────────── */}
      <section id="how-it-works" aria-labelledby="how-it-works-title" style={{
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: 'clamp(40px,8vw,80px) 24px',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <h2 id="how-it-works-title" style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: 'clamp(18px,3.5vw,28px)',
            fontWeight: 800,
            color: '#e2e8f0',
            marginBottom: '20px',
            letterSpacing: '0.5px',
          }}>
            Math homework shouldn't be a fight.
          </h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', lineHeight: 1.75, marginBottom: '16px' }}>
            Most math apps are just worksheets dressed up with cartoon characters. Your kid sees through that in five minutes, and so do you.
          </p>
          <p style={{ fontSize: '16px', color: '#94a3b8', lineHeight: 1.75 }}>
            MathScript is different  --  every problem is woven into a hero quest your child actually wants to complete. Solve the math → attack the boss → unlock the story. Dopamine does the rest.
          </p>
        </div>
      </section>

      {/* ── OFFER ─────────────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: 'clamp(40px,8vw,80px) 24px',
      }}>
        <h2 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(16px,3vw,24px)',
          fontWeight: 800,
          color: '#00d4ff',
          marginBottom: '20px',
          letterSpacing: '0.5px',
        }}>
          Free forever for the first 1,000 families.
        </h2>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            '✓ Unlimited math problems',
            '✓ Progress tracking',
            '✓ Any device  --  phone, tablet, desktop',
            '✓ Privacy-first  --  no kid PII collected',
          ].map(item => (
            <li key={item} style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              color: '#e2e8f0',
              paddingLeft: '4px',
            }}>
              {item}
            </li>
          ))}
        </ul>

        {/* Email capture  --  parents only */}
        {subStatus === 'success' ? (
          <div style={{
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.35)',
            borderRadius: '14px',
            padding: '20px 24px',
            color: '#86efac',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '15px',
            fontWeight: 600,
          }}>
            ✓ {subMsg}
          </div>
        ) : (
          <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              aria-label="Parent or guardian email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com (parents only)"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1.5px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e8e8f0',
                fontSize: '15px',
                outline: 'none',
                fontFamily: "'Rajdhani', sans-serif",
                minHeight: '56px',
              }}
            />

            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: 'pointer',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '13px',
              color: '#94a3b8',
              lineHeight: 1.5,
            }}>
              <input
                aria-label="I am the parent or guardian"
                type="checkbox"
                required
                checked={guardianChecked}
                onChange={e => setGuardianChecked(e.target.checked)}
                style={{ marginTop: '3px', accentColor: '#7c3aed', flexShrink: 0 }}
              />
              I am the parent or guardian of any child using this account
            </label>

            {subStatus === 'error' && (
              <p style={{ margin: 0, color: '#f87171', fontSize: '13px', fontFamily: "'Rajdhani', sans-serif" }}>
                {subMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={subStatus === 'loading'}
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#fff',
                background: subStatus === 'loading' ? '#333' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
                border: 'none',
                borderRadius: '12px',
                padding: '16px',
                cursor: subStatus === 'loading' ? 'wait' : 'pointer',
                letterSpacing: '1px',
                minHeight: '56px',
              }}
            >
              {subStatus === 'loading' ? 'Saving your spot…' : 'Keep My Spot →'}
            </button>

            <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontFamily: "'Rajdhani', sans-serif", textAlign: 'center' }}>
              No spam, ever. Unsubscribe any time.
            </p>
          </form>
        )}
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '20px 24px',
        textAlign: 'center',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '13px',
        color: '#475569',
      }}>
        © 2025-2026 The Math Script · Byron C Linder LLC, Chester, PA ·{' '}
        <a
          href="/privacy"
          style={{ color: '#64748b', textDecoration: 'underline' }}
          onClick={e => { e.preventDefault(); window.location.href = '/privacy' }}
        >
          Privacy
        </a>
      </footer>
    </div>
  )
}
