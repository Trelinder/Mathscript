import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GamePlayerPage from './pages/GamePlayerPage'

// Read the session ID from the query-string: /play.html?s=SESSION_ID
const params = new URLSearchParams(window.location.search)
const sessionId = params.get('s') || 'anonymous'

function TycoonApp() {
  return (
    <>
      {/* Full-screen Phaser game + analogy overlay */}
      <GamePlayerPage sessionId={sessionId} onAnalogyMilestone={() => {}} />

      {/* Small "back to map" button floating above the Phaser canvas */}
      <button
        onClick={() => { window.location.href = '/' }}
        style={{
          position: 'fixed',
          top: '12px',
          left: '12px',
          zIndex: 9999,
          background: 'rgba(17,24,39,0.85)',
          border: '1px solid rgba(124,58,237,0.4)',
          borderRadius: '10px',
          color: '#a78bfa',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '11px',
          fontWeight: 700,
          padding: '8px 14px',
          cursor: 'pointer',
          letterSpacing: '0.5px',
          backdropFilter: 'blur(4px)',
        }}
      >
        ← MAP
      </button>
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TycoonApp />
  </StrictMode>,
)
