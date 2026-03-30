import { useState } from 'react'
import { registerUser, loginUser } from '../api/client'

const styles = {
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
    padding: '40px 36px',
    boxShadow: '0 0 60px rgba(0,180,255,0.08)',
  },
  logo: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '22px',
    fontWeight: 800,
    color: '#00c8ff',
    textAlign: 'center',
    letterSpacing: '2px',
    marginBottom: '8px',
    textShadow: '0 0 20px rgba(0,200,255,0.5)',
  },
  tagline: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '32px',
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: '1px',
  },
  toggle: {
    display: 'flex',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '10px',
    padding: '4px',
    marginBottom: '28px',
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
    color: active ? '#00c8ff' : '#6b7280',
    boxShadow: active ? '0 0 12px rgba(0,200,255,0.2)' : 'none',
  }),
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1.5px',
    color: '#4b8fa8',
    fontFamily: "'Rajdhani', sans-serif",
    marginBottom: '8px',
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
    marginBottom: '20px',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  btn: (disabled) => ({
    width: '100%',
    padding: '14px',
    background: disabled
      ? 'rgba(0,200,255,0.08)'
      : 'linear-gradient(135deg, #0099cc 0%, #00c8ff 100%)',
    border: 'none',
    borderRadius: '12px',
    color: disabled ? '#4b7a8a' : '#fff',
    fontSize: '16px',
    fontWeight: 700,
    fontFamily: "'Orbitron', sans-serif",
    letterSpacing: '1.5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: '4px',
    boxShadow: disabled ? 'none' : '0 0 20px rgba(0,200,255,0.3)',
    transition: 'all 0.2s',
  }),
  error: {
    background: 'rgba(255,80,80,0.1)',
    border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: '10px',
    color: '#ff6b6b',
    fontSize: '13px',
    padding: '12px 16px',
    marginBottom: '20px',
    fontFamily: "'Rajdhani', sans-serif",
  },
  hint: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#4b5563',
    marginTop: '20px',
    fontFamily: "'Rajdhani', sans-serif",
  },
}

export default function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState('login')   // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isLogin = mode === 'login'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) return
    setLoading(true)
    try {
      const data = isLogin
        ? await loginUser(username.trim(), password)
        : await registerUser(username.trim(), password)
      onSuccess(data)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.logo}>THE MATH SCRIPT</div>
        <div style={styles.tagline}>
          {isLogin ? 'WELCOME BACK, HERO' : 'BEGIN YOUR QUEST'}
        </div>

        <div style={styles.toggle}>
          <button style={styles.toggleBtn(!isLogin)} onClick={() => { setMode('login'); setError('') }}>
            LOG IN
          </button>
          <button style={styles.toggleBtn(isLogin)} onClick={() => { setMode('register'); setError('') }}>
            REGISTER
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on">
          <label style={styles.label} htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            style={styles.input}
            type="text"
            autoComplete="username"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            disabled={loading}
          />

          <label style={styles.label} htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            style={styles.input}
            type="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            placeholder={isLogin ? 'Enter your password' : 'Create a password (8+ chars)'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            disabled={loading}
          />

          <button
            type="submit"
            style={styles.btn(loading || !username.trim() || !password)}
            disabled={loading || !username.trim() || !password}
          >
            {loading ? 'LOADING...' : isLogin ? 'ENTER QUEST' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <div style={styles.hint}>
          {isLogin
            ? "Don't have an account? Click REGISTER above."
            : 'Already registered? Click LOG IN above.'}
        </div>
      </div>
    </div>
  )
}
