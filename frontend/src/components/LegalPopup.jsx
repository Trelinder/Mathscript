import { useState } from 'react'

const SECTIONS = {
  tos: {
    label: 'Terms of Service',
    content: [
      {
        heading: 'Overview',
        body: 'Welcome to The Math Script: Ultimate Quest ("the App"), operated by The Math Script (themathscript.com). By accessing or using the App, you agree to these Terms of Service. If you do not agree, please do not use the App.',
      },
      {
        heading: 'License & Permitted Use',
        body: 'We grant you a limited, personal, non-transferable, non-exclusive license to use the App for personal, non-commercial educational purposes only. You may not copy, reproduce, distribute, modify, create derivative works from, publicly display, sell, or otherwise exploit any part of the App or its content without our express written permission.',
      },
      {
        heading: 'Intellectual Property',
        body: 'All content in the App — including but not limited to the name "The Math Script," hero characters (Arcanos, Blaze, Shadow, Luna, Tempest, Zenith, Volt, Titan, Webweaver), story content, artwork, game mechanics, UI design, code, and branding — is the exclusive intellectual property of The Math Script and is protected by copyright law.\n\n© 2025–2026 The Math Script. All rights reserved.\n\nUnauthorized copying, reverse engineering, scraping, or reproduction of any part of the App is strictly prohibited and may result in legal action.',
      },
      {
        heading: 'Subscriptions & Payments',
        body: 'Premium subscriptions are billed monthly or annually via Stripe. You may cancel at any time from your account. Refunds are handled at our discretion. We reserve the right to change pricing with advance notice.',
      },
      {
        heading: 'Age & Parental Consent',
        body: 'The App is designed for children ages 5–13. By allowing a child to use the App, a parent or guardian confirms they have reviewed these terms and consent to use on behalf of the child. We do not knowingly collect personal information from children without parental consent.',
      },
      {
        heading: 'Disclaimer of Warranties',
        body: 'The App is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted access, error-free operation, or fitness for a particular purpose. Use the App at your own risk.',
      },
      {
        heading: 'Limitation of Liability',
        body: 'To the maximum extent permitted by law, The Math Script shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the App.',
      },
      {
        heading: 'Changes to Terms',
        body: 'We may update these Terms at any time. Continued use of the App after changes constitutes acceptance of the updated Terms.',
      },
      {
        heading: 'Contact',
        body: 'Questions about these Terms? Email us at hello@themathscript.com',
      },
    ],
  },
  privacy: {
    label: 'Privacy Policy',
    content: [
      {
        heading: 'Our Commitment',
        body: 'The Math Script is committed to protecting your privacy. This Policy explains what information we collect, how we use it, and your rights. We do not sell your data.',
      },
      {
        heading: 'What We Collect',
        body: 'We collect only what is necessary to run the App:\n\n• Anonymous session ID (stored in your browser\'s localStorage)\n• Chosen hero name and age group you select in the App\n• Math problem history within your session\n• Email address (only if you voluntarily sign up for early access or a promo code)\n• Payment information (processed entirely by Stripe — we never see or store your card details)',
      },
      {
        heading: 'What We Do NOT Collect',
        body: 'We do not collect:\n\n• Your real name\n• Precise location\n• Device identifiers or fingerprints\n• Browsing history outside the App\n• Third-party tracking data',
      },
      {
        heading: 'COPPA Compliance',
        body: 'The App is designed for children ages 5–13. We do not knowingly collect personal information from children under 13 beyond what is described above (session ID, hero name, age group selection). No real names or contact details are required to play. Parents may contact us at hello@themathscript.com to request deletion of any data associated with their child\'s session.',
      },
      {
        heading: 'How We Use Your Information',
        body: 'We use collected information to:\n\n• Provide and improve the App experience\n• Track daily usage limits for free-tier users\n• Send promo codes or updates if you opted in by email\n• Process subscription payments via Stripe',
      },
      {
        heading: 'Cookies & Local Storage',
        body: 'We store your anonymous session ID in your browser\'s localStorage so your progress is remembered between visits. We do not use third-party tracking cookies or advertising cookies.',
      },
      {
        heading: 'Data Sharing',
        body: 'We do not sell or rent your data. We share information only with:\n\n• Stripe (payment processing)\n• Resend (transactional email delivery, if you provided an email)\n\nBoth are bound by their own privacy policies and industry-standard data protection practices.',
      },
      {
        heading: 'Data Retention',
        body: 'Session data is retained for as long as needed to provide the service. Email addresses are retained until you request removal. You may email hello@themathscript.com at any time to request deletion of your data.',
      },
      {
        heading: 'Changes to This Policy',
        body: 'We may update this Privacy Policy periodically. We will note the effective date at the top of the policy.',
      },
      {
        heading: 'Contact',
        body: 'Questions about your privacy? Email us at hello@themathscript.com',
      },
    ],
  },
}

const EFFECTIVE_DATE = 'March 2026'

export default function LegalPopup({ open, onClose, initialTab = 'tos' }) {
  const [tab, setTab] = useState(initialTab)

  if (!open) return null

  const { label, content } = SECTIONS[tab]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#12172a',
        border: '1px solid #1e2a4a',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 60px rgba(124,58,237,0.2)',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '14px', right: '16px',
          background: 'none', border: 'none', color: '#4a5568',
          fontSize: '22px', cursor: 'pointer', lineHeight: 1, zIndex: 1,
        }}>✕</button>

        <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '13px', fontWeight: 800,
            color: '#7c3aed', letterSpacing: '2px',
            textTransform: 'uppercase', marginBottom: '16px',
          }}>The Math Script</div>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px' }}>
            {['tos', 'privacy'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1,
                background: tab === t ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : 'rgba(255,255,255,0.04)',
                border: tab === t ? 'none' : '1px solid #1e2a4a',
                borderRadius: '8px',
                padding: '9px 12px',
                color: tab === t ? '#fff' : '#6b7280',
                fontSize: '12px', fontWeight: 700,
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: '1px', textTransform: 'uppercase',
                cursor: 'pointer',
              }}>
                {SECTIONS[t].label}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          overflowY: 'auto', padding: '0 24px 24px',
          flex: 1,
        }}>
          <p style={{
            color: '#4a5568', fontSize: '11px',
            marginBottom: '20px', fontStyle: 'italic',
          }}>
            Effective date: {EFFECTIVE_DATE}
          </p>

          {content.map(({ heading, body }) => (
            <div key={heading} style={{ marginBottom: '20px' }}>
              <h3 style={{
                color: '#00d4ff', fontSize: '13px', fontWeight: 700,
                fontFamily: "'Rajdhani', sans-serif",
                letterSpacing: '1px', textTransform: 'uppercase',
                marginBottom: '6px',
              }}>{heading}</h3>
              <p style={{
                color: '#a0aec0', fontSize: '13px', lineHeight: 1.7,
                whiteSpace: 'pre-line',
              }}>{body}</p>
            </div>
          ))}

          <div style={{
            borderTop: '1px solid #1e2a4a',
            paddingTop: '16px', marginTop: '8px',
            textAlign: 'center',
          }}>
            <p style={{ color: '#4a5568', fontSize: '11px' }}>
              © 2025–2026 The Math Script. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
