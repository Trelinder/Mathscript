import { useState } from 'react'

export default function ContactPopup({ open, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Something went wrong.')
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Could not send message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName(''); setEmail(''); setMessage('')
    setSuccess(false); setError('')
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#12172a',
        border: '1px solid #1e2a4a',
        borderRadius: '20px',
        padding: '32px 28px',
        maxWidth: '460px',
        width: '100%',
        position: 'relative',
        boxShadow: '0 0 60px rgba(124,58,237,0.25)',
      }}>
        <button onClick={handleClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', color: '#4a5568',
          fontSize: '22px', cursor: 'pointer', lineHeight: 1,
        }}>✕</button>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '18px',
              color: '#00d4ff', margin: '0 0 12px', fontWeight: 700,
            }}>Message Sent!</h2>
            <p style={{ color: '#a0aec0', fontSize: '15px', lineHeight: 1.6, margin: '0 0 24px' }}>
              We'll get back to you soon at your email address.
            </p>
            <button onClick={handleClose} style={{
              background: 'linear-gradient(135deg,#7c3aed,#00d4ff)',
              color: '#fff', border: 'none', borderRadius: '10px',
              padding: '12px 28px', fontWeight: 700, fontSize: '15px', cursor: 'pointer',
            }}>Close</button>
          </div>
        ) : (
          <>
            <h2 style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: '18px',
              color: '#e8e8f0', margin: '0 0 6px', fontWeight: 800,
              letterSpacing: '1px',
            }}>Contact Us</h2>
            <p style={{ color: '#a0aec0', fontSize: '14px', margin: '0 0 24px', lineHeight: 1.5 }}>
              Have a question or feedback? Send us a message and we'll reply to your email.
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#7c3aed', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Your Name
                </label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Hero name or real name"
                  required maxLength={100}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0a0e1a', border: '1px solid #1e2a4a',
                    borderRadius: '8px', padding: '10px 14px',
                    color: '#e8e8f0', fontSize: '15px', outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#7c3aed', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Your Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required maxLength={200}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0a0e1a', border: '1px solid #1e2a4a',
                    borderRadius: '8px', padding: '10px 14px',
                    color: '#e8e8f0', fontSize: '15px', outline: 'none',
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: '#7c3aed', fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Message
                </label>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Ask a question, report a bug, or share your feedback..."
                  required maxLength={2000} rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: '#0a0e1a', border: '1px solid #1e2a4a',
                    borderRadius: '8px', padding: '10px 14px',
                    color: '#e8e8f0', fontSize: '15px', outline: 'none',
                    resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </div>

              {error && (
                <p style={{ color: '#f87171', fontSize: '13px', margin: '0 0 14px', textAlign: 'center' }}>
                  {error}
                </p>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  width: '100%',
                  background: loading ? '#1e2a4a' : 'linear-gradient(135deg,#7c3aed,#00d4ff)',
                  color: '#fff', border: 'none', borderRadius: '10px',
                  padding: '13px', fontWeight: 700, fontSize: '15px',
                  cursor: loading ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Sending...' : 'Send Message ✉️'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
