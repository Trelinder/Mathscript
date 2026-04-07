import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GamePlayerPage from './pages/GamePlayerPage'

// Prefer sessionStorage (set by App.jsx handleStartTycoon) so the session ID
// is never exposed in the URL, browser history, or server access logs.
// Fall back to the legacy ?s= query-string for any bookmarked or shared URLs
// that were created before this security update.
const TYCOON_SESSION_KEY = 'ms_tycoon_session'
const params = new URLSearchParams(window.location.search)
const urlSessionId = params.get('s')
const sessionId = sessionStorage.getItem(TYCOON_SESSION_KEY) || urlSessionId || 'anonymous'

// If the session was read from the URL, remove it from the address bar so it
// does not linger in browser history or get captured by server-side logs.
if (urlSessionId && window.location.search) {
  window.history.replaceState({}, '', window.location.pathname)
}

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
