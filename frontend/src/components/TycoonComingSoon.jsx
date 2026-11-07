export default function TycoonComingSoon() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px',
      padding: '24px', textAlign: 'center', background: '#0a0e1a', color: '#fff',
      fontFamily: "'Rajdhani', sans-serif",
    }}>
      <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '24px' }}>Math Script Tycoon</h1>
      <p style={{ fontSize: '18px', color: '#cbd5e1' }}>Math Script Tycoon is being built. Coming soon!</p>
      <a href="/" style={{ color: '#7dd3fc', fontSize: '16px', fontWeight: 700 }}>Back to Math Script</a>
    </main>
  )
}