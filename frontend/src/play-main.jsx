import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GamePlayerPage from './pages/GamePlayerPage'
import { resolveGameSessionId } from './utils/sessionId'

// Read the session ID from the query-string: /play.html?s=SESSION_ID
const sessionId = resolveGameSessionId(window.location.search)

function TycoonApp() {
  return (
    <GamePlayerPage
      sessionId={sessionId}
      initialScreen="play"
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
