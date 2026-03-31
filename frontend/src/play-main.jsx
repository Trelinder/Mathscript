import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GamePlayerPage from './pages/GamePlayerPage'

// Read the session ID from the query-string: /play.html?s=SESSION_ID
const params = new URLSearchParams(window.location.search)
const sessionId = params.get('s') || 'anonymous'

function TycoonApp() {
  return (
    <GamePlayerPage
      sessionId={sessionId}
      onAnalogyMilestone={() => {}}
      onExit={() => { window.location.href = '/' }}
    />
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TycoonApp />
  </StrictMode>,
)
