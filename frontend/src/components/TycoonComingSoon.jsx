import { useEffect } from 'react'

export default function TycoonComingSoon() {
  useEffect(() => {
    window.location.replace('/data-center/index.html')
  }, [])

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
      padding: '24px', textAlign: 'center', background: '#0a0e1a', color: '#fff',
      fontFamily: "'Rajdhani', sans-serif",
    }}>
      <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '24px' }}>Mathscript Underground Data Center</h1>
      <a href="/data-center/index.html" style={{ color: '#7dd3fc', fontSize: '16px', fontWeight: 700 }}>Open the game</a>
      <a href="/" style={{ color: '#7dd3fc', fontSize: '16px', fontWeight: 700 }}>Back to Math Script</a>
    </main>
  )
}