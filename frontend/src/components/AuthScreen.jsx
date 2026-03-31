/**
 * AuthScreen — Math Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Modes:
 *   login    — username + password → ENTER QUEST
 *   register — username + email (opt) + password + confirm → CREATE ACCOUNT
 *   forgot   — username → SEND RESET LINK
 *   reset    — new password + confirm → SET NEW PASSWORD  (triggered by ?reset_token URL)
 *   guest    — one-click → PLAY AS GUEST
 */

import { useState, useEffect } from 'react'
import { registerUser, loginUser, forgotPassword, resetPassword, guestLogin } from '../api/client'

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 50% 0%, #0f1729 0%, #0a0e1a 70%)',
    padding: '20px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(100,200,255,0.15)',
    borderRadius: '18px',
    padding: '36px 32px',
    boxShadow: '0 0 60px rgba(0,180,255,0.08)',
  },
  logo: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '22px',
    fontWeight: 800,
    color: '#00c8ff',
    textAlign: 'center',
    letterSpacing: '2px',
    marginBottom: '6px',
    textShadow: '0 0 20px rgba(0,200,255,0.5)',
  },
  tagline: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '28px',
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: '1px',
  },
  toggle: {
    display: 'flex',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '10px',
    padding: '4px',
    marginBottom: '24px',
  },
  toggleBtn: (active) => ({
    flex: 1,
    padding: '9px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 700,
    fontSize: '14px',
    letterSpacing: '1px',
    transition: 'all 0.2s',
    background: active ? 'rgba(0,200,255,0.15)' : 'transparent',
    color:      active ? '#00c8ff' : '#6b7280',
    boxShadow:  active ? '0 0 12px rgba(0,200,255,0.2)' : 'none',
  }),
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    color: '#4b8fa8',
    fontFamily: "'Rajdhani', sans-serif",
    marginBottom: '7px',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(100,200,255,0.15)',
    borderRadius: '10px',
    color: '#e8e8f0',
    fontSize: '15px',
    fontFamily: "'Rajdhani', sans-serif",
    outline: 'none',
    marginBottom: '16px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  primaryBtn: (disabled) => ({
    width: '100%',
    padding: '14px',
    background: disabled
      ? 'rgba(0,200,255,0.08)'
      : 'linear-gradient(135deg, #0099cc 0%, #00c8ff 100%)',
    border: 'none',
    borderRadius: '12px',
    color: disabled ? '#4b7a8a' : '#fff',
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '1.5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: '4px',
    boxShadow: disabled ? 'none' : '0 0 20px rgba(0,200,255,0.3)',
    transition: 'all 0.2s',
  }),
  guestBtn: {
    width: '100%',
    padding: '11px',
    background: 'transparent',
    border: '1px solid rgba(100,200,255,0.2)',
    borderRadius: '10px',
    color: '#4b8fa8',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: '1px',
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'all 0.2s',
  },
  error: {
    background: 'rgba(255,80,80,0.1)',
    border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: '10px',
    color: '#ff6b6b',
    fontSize: '13px',
    padding: '12px 16px',
    marginBottom: '18px',
    fontFamily: "'Rajdhani', sans-serif",
  },
  success: {
    background: 'rgba(0,200,100,0.08)',
    border: '1px solid rgba(0,200,100,0.3)',
    borderRadius: '10px',
    color: '#34d399',
    fontSize: '13px',
    padding: '12px 16px',
    marginBottom: '18px',
    fontFamily: "'Rajdhani', sans-serif",
    lineHeight: 1.5,
  },
  hint: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#4b5563',
    marginTop: '18px',
    fontFamily: "'Rajdhani', sans-serif",
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#4b8fa8',
    fontFamily: "'Rajdhani', sans-serif",
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '18px 0 14px',
    color: '#1e293b',
    fontSize: '11px',
    letterSpacing: '1px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'rgba(100,200,255,0.08)',
  },
}

export default function AuthScreen({ onSuccess }) {
  const [mode,     setMode]     = useState('login') // login | register | forgot | reset
  const [username, setUsername] = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Reset token from URL (for password-reset emails)
  const [resetToken, setResetToken] = useState('')
  const [resetUser,  setResetUser]  = useState('')

  // Check URL for ?reset_token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('reset_token')
    const user   = params.get('user')
    if (token && user) {
      setResetToken(token)
      setResetUser(user)
      setUsername(user)
      setMode('reset')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const clear = () => { setError(''); setSuccess('') }

  const switchMode = (m) => { clear(); setMode(m); setPassword(''); setConfirm('') }

  // ── Submit handlers ──────────────────────────────────────────────────────────

  const handleLoginRegister = async (e) => {
    e.preventDefault()
    clear()
    if (!username.trim() || !password) return
    if (mode === 'register') {
      if (password.length < 8)       { setError('Password must be at least 8 characters.'); return }
      if (password !== confirm)      { setError('Passwords do not match.'); return }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setError('Please enter a valid email address.'); return }
    }
    setLoading(true)
    try {
      const data = mode === 'login'
        ? await loginUser(username.trim(), password)
        : await registerUser(username.trim(), password, email.trim())
      onSuccess(data)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    clear()
    if (!username.trim()) return
    setLoading(true)
    try {
      await forgotPassword(username.trim())
      setSuccess('If an email is associated with your account, a reset link has been sent. Check your inbox (and spam folder).')
    } catch (err) {
      setError(err.message || 'Request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    clear()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await resetPassword(resetUser || username.trim(), resetToken, password)
      setSuccess('Password updated! You can now log in with your new password.')
      setTimeout(() => switchMode('login'), 2000)
    } catch (err) {
      setError(err.message || 'Reset failed. The link may have expired — please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    clear()
    setLoading(true)
    try {
      const data = await guestLogin()
      onSuccess(data)
    } catch (err) {
      setError(err.message || 'Could not start guest session.')
    } finally {
      setLoading(false)
    }
  }

  const isLogin    = mode === 'login'
  const isRegister = mode === 'register'
  const isForgot   = mode === 'forgot'
  const isReset    = mode === 'reset'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <div style={S.card}>
        <div style={S.logo}>THE MATH SCRIPT</div>
        <div style={S.tagline}>
          {isLogin    ? 'WELCOME BACK, HERO'     :
           isRegister ? 'BEGIN YOUR QUEST'        :
           isForgot   ? 'RECOVER YOUR ACCOUNT'   :
                        'SET YOUR NEW PASSWORD'  }
        </div>

        {/* ── Toggle (login / register only) ── */}
        {(isLogin || isRegister) && (
          <div style={S.toggle}>
            <button style={S.toggleBtn(isLogin)}    onClick={() => switchMode('login')}>LOG IN</button>
            <button style={S.toggleBtn(isRegister)} onClick={() => switchMode('register')}>REGISTER</button>
          </div>
        )}

        {error   && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        {/* ══════════════════════════════════════════════════════
            LOGIN / REGISTER FORM
        ══════════════════════════════════════════════════════ */}
        {(isLogin || isRegister) && !success && (
          <form onSubmit={handleLoginRegister} autoComplete="on">
            <label style={S.label} htmlFor="auth-user">Username</label>
            <input id="auth-user" style={S.input} type="text" autoComplete="username"
              placeholder="Enter your username" value={username}
              onChange={e => setUsername(e.target.value)} maxLength={30} disabled={loading} />

            {isRegister && (
              <>
                <label style={S.label} htmlFor="auth-email">Email <span style={{ color:'#4b5563', fontWeight:400 }}>(optional — for password recovery)</span></label>
                <input id="auth-email" style={S.input} type="email" autoComplete="email"
                  placeholder="your@email.com" value={email}
                  onChange={e => setEmail(e.target.value)} maxLength={200} disabled={loading} />
              </>
            )}

            <label style={S.label} htmlFor="auth-pw">Password</label>
            <input id="auth-pw" style={S.input} type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder={isLogin ? 'Enter your password' : 'Create a password (8+ chars)'}
              value={password} onChange={e => setPassword(e.target.value)}
              maxLength={128} disabled={loading} />

            {isRegister && (
              <>
                <label style={S.label} htmlFor="auth-confirm">Confirm Password</label>
                <input id="auth-confirm" style={S.input} type="password" autoComplete="new-password"
                  placeholder="Repeat your password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} maxLength={128} disabled={loading} />
              </>
            )}

            <button type="submit"
              style={S.primaryBtn(loading || !username.trim() || !password || (isRegister && !confirm))}
              disabled={loading || !username.trim() || !password || (isRegister && !confirm)}>
              {loading ? 'LOADING...' : isLogin ? 'ENTER QUEST' : 'CREATE ACCOUNT'}
            </button>

            {/* Forgot password link (login mode only) */}
            {isLogin && (
              <div style={{ textAlign:'center', marginTop:'12px' }}>
                <button type="button" style={S.linkBtn} onClick={() => switchMode('forgot')}>
                  Forgot your password?
                </button>
              </div>
            )}
          </form>
        )}

        {/* ══════════════════════════════════════════════════════
            FORGOT PASSWORD FORM
        ══════════════════════════════════════════════════════ */}
        {isForgot && !success && (
          <form onSubmit={handleForgot}>
            <label style={S.label} htmlFor="forgot-user">Username</label>
            <input id="forgot-user" style={S.input} type="text" autoComplete="username"
              placeholder="Enter your username" value={username}
              onChange={e => setUsername(e.target.value)} maxLength={30} disabled={loading} />

            <button type="submit"
              style={S.primaryBtn(loading || !username.trim())}
              disabled={loading || !username.trim()}>
              {loading ? 'SENDING...' : 'SEND RESET LINK'}
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════
            RESET PASSWORD FORM
        ══════════════════════════════════════════════════════ */}
        {isReset && !success && (
          <form onSubmit={handleReset}>
            {resetUser && (
              <>
                <label style={S.label}>Resetting password for</label>
                  placeholder="Resetting password for" value={resetUser} maxLength={30}
                  style={{ ...S.input, marginBottom: '20px', color:'#00c8ff', fontWeight:700, cursor:'default' }}
                  readOnly />
              </>
            )}
            <label style={S.label} htmlFor="reset-pw">New Password</label>
            <input id="reset-pw" style={S.input} type="password" autoComplete="new-password"
              placeholder="New password (8+ chars)" value={password}
              onChange={e => setPassword(e.target.value)} maxLength={128} disabled={loading} />

            <label style={S.label} htmlFor="reset-confirm">Confirm New Password</label>
            <input id="reset-confirm" style={S.input} type="password" autoComplete="new-password"
              placeholder="Repeat new password" value={confirm}
              onChange={e => setConfirm(e.target.value)} maxLength={128} disabled={loading} />

            <button type="submit"
              style={S.primaryBtn(loading || !password || !confirm)}
              disabled={loading || !password || !confirm}>
              {loading ? 'SAVING...' : 'SET NEW PASSWORD'}
            </button>
          </form>
        )}

        {/* ── Divider + Guest button (login/register only) ── */}
        {(isLogin || isRegister) && (
          <>
            <div style={S.divider}>
              <div style={S.dividerLine} />
              <span style={{ color:'#374151', fontSize:11, letterSpacing:'2px' }}>OR</span>
              <div style={S.dividerLine} />
            </div>
            <button
              onClick={handleGuest}
              disabled={loading}
              style={S.guestBtn}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.45)'; e.currentTarget.style.color = '#00c8ff' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(100,200,255,0.2)'; e.currentTarget.style.color = '#4b8fa8' }}>
              👤 PLAY AS GUEST  <span style={{ color:'#374151', fontSize:11 }}>(no save)</span>
            </button>
          </>
        )}

        {/* ── Bottom hint / nav links ── */}
        <div style={S.hint}>
          {isLogin && <>Don't have an account? <button style={S.linkBtn} onClick={() => switchMode('register')}>Register</button></>}
          {isRegister && <>Already registered? <button style={S.linkBtn} onClick={() => switchMode('login')}>Log In</button></>}
          {(isForgot || isReset) && <><button style={S.linkBtn} onClick={() => switchMode('login')}>← Back to Log In</button></>}
        </div>
      </div>
    </div>
  )
}
