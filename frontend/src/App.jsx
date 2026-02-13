import { useState, useEffect } from 'react'
import { fetchSession } from './api/client'
import Onboarding from './pages/Onboarding'
import Quest from './pages/Quest'

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: 'Rajdhani', 'Inter', sans-serif;
    background: #0a0e1a;
    color: #e8e8f0;
    min-height: 100vh;
    min-height: -webkit-fill-available;
    overflow-x: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .game-font { font-family: 'Orbitron', sans-serif; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d1117; }
  ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #00d4ff, #7c3aed); border-radius: 3px; }
  input, button, textarea, select { font-size: 16px; }
  button { -webkit-appearance: none; touch-action: manipulation; }

  .story-seg-even { flex-direction: row; }
  .story-seg-odd { flex-direction: row-reverse; }
  .story-image-container { flex: 0 0 auto; width: clamp(160px, 30vw, 240px); aspect-ratio: 1; flex-shrink: 0; }
  .story-text-block { min-width: 0; }

  @media (max-width: 600px) {
    .hero-grid { grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; }
    .hero-card { min-width: unset !important; padding: 10px 6px 8px !important; }
    .hero-card img { width: 56px !important; height: 56px !important; }
    .hero-card .hero-avatar { width: 64px !important; height: 64px !important; }
    .hero-card .hero-name { font-size: 10px !important; }
    .hero-card .hero-desc { display: none !important; }
    .quest-header { flex-direction: column !important; align-items: stretch !important; }
    .quest-header-buttons { justify-content: space-between !important; }
    .input-bar { flex-direction: column !important; }
    .input-bar input[type="text"] { min-width: unset !important; width: 100% !important; }
    .input-bar-buttons { display: flex !important; gap: 8px !important; width: 100% !important; }
    .input-bar-buttons button { flex: 1 !important; }
    .shop-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
    .shop-item { padding: 10px !important; }
    .shop-item .item-emoji { font-size: 24px !important; }
    .parent-table { font-size: 11px !important; }
    .parent-table th, .parent-table td { padding: 6px 4px !important; font-size: 10px !important; }
    .story-segment-layout { flex-direction: column !important; }
    .story-seg-even, .story-seg-odd { flex-direction: column !important; }
    .story-image-container { width: 100% !important; max-width: 100% !important; aspect-ratio: 16/9 !important; flex: 0 0 auto !important; }
    .story-text-block { font-size: 15px !important; padding: 14px 14px !important; }
    .scene-container { padding: 14px !important; max-height: none !important; }
    .scene-hero-img { width: 70px !important; height: 70px !important; }
    .scene-next-btn { font-size: 13px !important; padding: 12px 24px !important; }
    .onboarding-hero-row { gap: 8px !important; }
    .onboarding-hero-circle { width: 50px !important; height: 50px !important; }
    .onboarding-hero-name { font-size: 8px !important; }
    .onboarding-btn { font-size: 14px !important; padding: 14px 24px !important; }
    .victory-parent-activity { padding: 14px 16px !important; max-width: 100% !important; }
    .math-paper { padding: 14px 12px !important; }
    .math-paper .math-step-row { padding-left: 32px !important; }
    .math-paper .math-header { padding-left: 32px !important; }
    .math-paper .math-red-line { left: 28px !important; }
  }

  @media (max-width: 400px) {
    .hero-grid { grid-template-columns: repeat(4, 1fr) !important; }
    .shop-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
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
        color: 'rgba(255,255,255,0.2)',
        fontSize: '12px',
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 500,
        letterSpacing: '1px',
      }}>
        © {new Date().getFullYear()} The Math Script™: Ultimate Quest. All rights reserved.
      </footer>
    </>
  )
}

export default App
