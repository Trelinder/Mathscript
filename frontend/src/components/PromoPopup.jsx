import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

const STORAGE_KEY = 'mq_promo_popup_done'

export default function PromoPopup({ open, onClose }) {
  const { signup } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (!open) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setStatus('idle')
    setEmail('')
    setErrorMsg('')
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      // Step 1: Create (or sign in) a Firebase user with the provided email.
      // We generate a random password using a cryptographically secure source.
      // The user only needs the promo code, not a full account login flow here.
      const randomBytes = new Uint8Array(32)
      crypto.getRandomValues(randomBytes)
      const tempPassword = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('')
      const user = await signup(email.trim(), tempPassword)

      // Step 2: Exchange the Firebase credential for a short-lived ID token.
      const idToken = await user.getIdToken()

      // Step 3: Send the verified token to our backend.  The backend uses the
      // Firebase Admin SDK to verify the token and extracts the email from it,
      // so no untrusted email field is sent in the body.
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setStatus('success')
        localStorage.setItem(STORAGE_KEY, '1')
      } else if (res.status === 409) {
        setStatus('error')
        setErrorMsg('This email has already claimed a code — check your inbox!')
      } else {
        setStatus('error')
        setErrorMsg('Something went wrong. Please try again.')
      }
    } catch (err) {
      setStatus('error')
      // auth/email-already-in-use means the Firebase account exists but they
      // haven't claimed a promo code yet — surface a helpful message.
      if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg('This email already has an account — check your inbox for a promo code!')
      } else if (err?.code === 'auth/invalid-email') {
        setErrorMsg('Please enter a valid email address.')
      } else if (err?.code === 'auth/network-request-failed') {
        setErrorMsg('Could not connect. Please try again.')
      } else {
        setErrorMsg('Something went wrong. Please try again.')
      }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#12172a',
        border: '1px solid #1e2a4a',
        borderRadius: '20px',
        padding: '36px 32px',
        maxWidth: '420px',
        width: '100%',
        position: 'relative',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        animation: 'popupIn 0.3s ease',
      }}>
        <button onClick={dismiss} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#4a5568', fontSize: '22px', lineHeight: 1,
        }}>✕</button>

        {status !== 'success' ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>🎁</div>
              <h2 style={{
                margin: '0 0 10px',
                color: '#e8e8f0',
                fontSize: '22px',
                fontWeight: 800,
              }}>Want 30 days free premium?</h2>
              <p style={{ margin: 0, color: '#a0aec0', fontSize: '14px', lineHeight: 1.6 }}>
                Enter your email and we'll send you a free promo code — unlocks all heroes, unlimited quests, and more.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '13px 16px',
                  borderRadius: '10px',
                  border: '1.5px solid #1e2a4a',
                  background: '#0a0e1a',
                  color: '#e8e8f0',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '12px',
                }}
              />
              {status === 'error' && (
                <p style={{ margin: '0 0 12px', color: '#fc8181', fontSize: '13px', textAlign: 'center' }}>
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
                  color: '#fff',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: status === 'loading' ? 0.7 : 1,
                }}
              >
                {status === 'loading' ? 'Sending…' : 'Send My Free Code →'}
              </button>
            </form>

            <p style={{ margin: '16px 0 0', textAlign: 'center', color: '#4a5568', fontSize: '12px' }}>
              No spam, ever.
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: '52px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ margin: '0 0 12px', color: '#e8e8f0', fontSize: '22px', fontWeight: 800 }}>
              Check your inbox!
            </h2>
            <p style={{ margin: '0 0 24px', color: '#a0aec0', fontSize: '15px', lineHeight: 1.6 }}>
              Your promo code is on its way. Once you have it, enter it in the app to unlock 30 days of free premium.
            </p>
            <button
              onClick={dismiss}
              style={{
                padding: '12px 28px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
                color: '#fff',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Start Playing →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes popupIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
