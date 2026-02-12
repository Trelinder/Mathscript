import { useState, useEffect } from 'react'
import { fetchSession } from './api/client'
import Onboarding from './pages/Onboarding'
import Quest from './pages/Quest'

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', sans-serif;
    background: #1a1a2e;
    color: #eee;
    min-height: 100vh;
    overflow-x: hidden;
  }
  .pixel-font { font-family: 'Press Start 2P', monospace; }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #16213e; }
  ::-webkit-scrollbar-thumb { background: #4ecca3; border-radius: 4px; }
`

function App() {
  const [screen, setScreen] = useState('onboarding')
  const [sessionId] = useState(() => 'sess_' + Math.random().toString(36).slice(2, 10))
  const [session, setSession] = useState({ coins: 0, inventory: [], history: [] })
  const [selectedHero, setSelectedHero] = useState(null)

  useEffect(() => {
    fetchSession(sessionId).then(setSession).catch(() => {})
  }, [sessionId])

  const refreshSession = async () => {
    try {
      const data = await fetchSession(sessionId)
      setSession(data)
    } catch {}
  }

  return (
    <>
      <style>{globalStyles}</style>
      {screen === 'onboarding' && (
        <Onboarding onStart={() => setScreen('quest')} />
      )}
      {screen === 'quest' && (
        <Quest
          sessionId={sessionId}
          session={session}
          selectedHero={selectedHero}
          setSelectedHero={setSelectedHero}
          refreshSession={refreshSession}
        />
      )}
      <footer style={{
        textAlign: 'center',
        padding: '20px',
        color: 'rgba(255,255,255,0.3)',
        fontSize: '11px',
        fontFamily: "'Inter', sans-serif",
      }}>
        © {new Date().getFullYear()} The Math Script: Ultimate Quest. All rights reserved.
      </footer>
    </>
  )
}

export default App
