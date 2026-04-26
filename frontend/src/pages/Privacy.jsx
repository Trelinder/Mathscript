/**
 * Privacy.jsx — COPPA-aligned privacy policy page.
 *
 * Accessible at the /privacy SPA route.
 */
const BUILD_DATE = '2026-04-26'

export default function Privacy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0e1a 0%, #0f172a 100%)',
      color: '#e8e8f0',
      fontFamily: "'Rajdhani', 'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: 'clamp(32px,6vw,64px) 24px' }}>

        {/* Back link */}
        <a
          href="/"
          onClick={e => { e.preventDefault(); window.history.back() }}
          style={{
            display: 'inline-block',
            marginBottom: '28px',
            color: '#64748b',
            fontSize: '14px',
            textDecoration: 'none',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
          }}
        >
          ← Back
        </a>

        <h1 style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(20px,4vw,32px)',
          fontWeight: 900,
          color: '#fff',
          marginBottom: '8px',
          letterSpacing: '0.5px',
        }}>
          MathScript Privacy Policy
        </h1>
        <p style={{ fontSize: '13px', color: '#475569', marginBottom: '36px' }}>
          <strong>Last updated:</strong> {BUILD_DATE} &nbsp;|&nbsp;{' '}
          <strong>Operator:</strong> Byron C Linder LLC, Chester, PA
        </p>

        <Section heading="What we collect">
          <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
            <li><strong>From kids: Nothing personal.</strong> No name, email, photo, or location.</li>
            <li><strong>From parents (optional):</strong> Email only, if you choose to save progress.</li>
            <li><strong>Automatic:</strong> Anonymous gameplay stats tied to a random device ID.</li>
          </ul>
        </Section>

        <Section heading="What we DON'T do">
          <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
            <li>We do not sell or share data with third parties for advertising.</li>
            <li>We do not use behavioral ad networks.</li>
            <li>We do not track kids across other websites.</li>
            <li>We do not use third-party trackers (no Google Analytics, no Facebook Pixel). Analytics are handled by Plausible — a privacy-first, cookie-free tool.</li>
          </ul>
        </Section>

        <Section heading="Parental rights (COPPA)">
          <p>
            Request deletion at any time:{' '}
            <a href="mailto:privacy@themathscript.com" style={{ color: '#00d4ff' }}>
              privacy@themathscript.com
            </a>{' '}
            — 7-day response guarantee.
          </p>
        </Section>

        <Section heading="Data retention">
          <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.8 }}>
            <li>Anonymous gameplay data: 12 months from last activity, then deleted.</li>
            <li>Parent emails: until you ask us to remove them.</li>
          </ul>
        </Section>

        <Section heading="Hosting &amp; security">
          <p>
            Microsoft Azure (US region). Encrypted in transit (TLS 1.3) and at rest.
          </p>
        </Section>

        <Section heading="Contact">
          <p>
            Byron C Linder LLC · Chester, PA ·{' '}
            <a href="mailto:privacy@themathscript.com" style={{ color: '#00d4ff' }}>
              privacy@themathscript.com
            </a>
          </p>
        </Section>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: '20px',
          marginTop: '8px',
          fontSize: '12px',
          color: '#334155',
          fontFamily: "'Rajdhani', sans-serif",
        }}>
          © 2025–2026 The Math Script. All rights reserved.
        </div>
      </div>
    </div>
  )
}

function Section({ heading, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h2 style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 'clamp(13px,2vw,16px)',
        fontWeight: 800,
        color: '#00d4ff',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        marginBottom: '10px',
      }}>
        {heading}
      </h2>
      <div style={{ fontSize: '15px', color: '#94a3b8', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}
