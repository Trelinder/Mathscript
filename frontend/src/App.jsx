import { Suspense, lazy, useState, useEffect, useCallback } from 'react'
import { fetchSession, updateSessionProfile } from './api/client'

const Onboarding = lazy(() => import('./pages/Onboarding'))
const Quest = lazy(() => import('./pages/Quest'))
const WorldMap = lazy(() => import('./components/WorldMap'))
const ParentDashboard = lazy(() => import('./components/ParentDashboard'))

const SESSION_STORAGE_KEY = 'mathscript_session_id'
const SESSION_ID_PATTERN = /^sess_[a-z0-9]{6,40}(?:\.[a-f0-9]{12})?$/

function createSessionId() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `sess_${hex}`
  }
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return createSessionId()
  try {
    const saved = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (saved && SESSION_ID_PATTERN.test(saved)) return saved
    const fresh = createSessionId()
    window.localStorage.setItem(SESSION_STORAGE_KEY, fresh)
    return fresh
  } catch {
    return createSessionId()
  }
}

function isAdminRoutePath() {
  if (typeof window === 'undefined') return false
  const normalized = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  return normalized === '/admin'
}

function ScreenFallback({ label }) {
  return (
    <div style={{
      minHeight: '40vh',
      display: 'grid',
      placeItems: 'center',
      fontFamily: "'Orbitron', sans-serif",
      fontSize: '12px',
      letterSpacing: '1px',
      color: '#94a3b8',
    }}>
      {label || 'Loading...'}
    </div>
  )
}

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: 'Rajdhani', 'Inter', sans-serif;
    background: #0f172a;
    color: #e2e8f0;
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
  math-field {
    --smart-fence-opacity: 0.8;
    --caret-color: #0f172a;
    --selection-background-color: rgba(14, 165, 233, 0.22);
  }
  math-field::part(virtual-keyboard-toggle) {
    color: #0369a1;
  }
  math-field::part(content) {
    min-height: 28px;
  }
  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
  }
  .data-table-wrap {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .data-table-wrap table {
    min-width: 520px;
  }
  .success-burst-check {
    animation: success-pop 420ms ease-out both;
  }
  .success-burst-dot {
    animation: success-dot 700ms ease-out both;
  }
  @keyframes success-pop {
    0% { transform: scale(0.5); opacity: 0; }
    65% { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes success-dot {
    0% { transform: translateY(0) scale(0.8); opacity: 0; }
    20% { opacity: 1; }
    100% { transform: translateY(-14px) scale(0.2); opacity: 0; }
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  a:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 2px;
  }

  .story-seg-even { flex-direction: row; }
  .story-seg-odd { flex-direction: row-reverse; }
  .story-image-container { flex: 0 0 auto; width: clamp(160px, 30vw, 240px); aspect-ratio: 1; flex-shrink: 0; }
  .story-text-block { min-width: 0; }

  @media (max-width: 600px) {
    .hero-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 10px !important; }
    .hero-card { min-width: unset !important; padding: 12px 8px 10px !important; }
    .hero-card img { width: 56px !important; height: 56px !important; }
    .hero-card .hero-avatar { width: 68px !important; height: 68px !important; }
    .hero-card .hero-name { font-size: 11px !important; }
    .hero-card .hero-desc { display: none !important; }
    .quest-header { flex-direction: column !important; align-items: stretch !important; }
    .quest-header-buttons {
      justify-content: flex-start !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      padding-bottom: 4px !important;
      -webkit-overflow-scrolling: touch !important;
      scrollbar-width: none !important;
    }
    .quest-header-buttons::-webkit-scrollbar { display: none !important; }
    .quest-header-buttons > * { flex: 0 0 auto !important; }
    .quest-action-panel {
      position: sticky !important;
      bottom: calc(env(safe-area-inset-bottom) + 8px) !important;
      z-index: 20 !important;
      background: rgba(10,14,26,0.92) !important;
      border: 1px solid rgba(124,58,237,0.25) !important;
      border-radius: 12px !important;
      backdrop-filter: blur(8px) !important;
      padding: 10px !important;
    }
    .mobile-primary-btn, .mobile-secondary-btn {
      min-height: 46px !important;
      font-size: 13px !important;
      padding: 12px 16px !important;
    }
    .input-bar { flex-direction: column !important; }
    .input-bar input[type="text"] { min-width: unset !important; width: 100% !important; }
    .input-bar > div:first-child { min-width: 0 !important; width: 100% !important; }
    .input-bar math-field { width: 100% !important; }
    .input-bar-buttons { display: flex !important; gap: 8px !important; width: 100% !important; }
    .input-bar-buttons button { flex: 1 !important; }
    .worldmap-primary-btn, .worldmap-chest-btn { width: 100% !important; }
    .subscription-header { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
    .subscription-plans-grid { flex-direction: column !important; align-items: stretch !important; }
    .subscription-plan-card { max-width: 100% !important; }
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
    .hero-grid { grid-template-columns: repeat(2, 1fr) !important; }
    .shop-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
      scroll-behavior: auto !important;
    }
  }
`

function App() {
  const [screen, setScreen] = useState('loading')
  const [sessionId] = useState(() => getOrCreateSessionId())
  const [session, setSession] = useState({ coins: 0, inventory: [], history: [] })
  const [selectedHero, setSelectedHero] = useState(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [profile, setProfile] = useState({
    player_name: 'Hero',
    age_group: '8-10',
    selected_realm: 'Sky Citadel',
    preferred_language: 'en',
  })

  const syncSessionData = useCallback((data) => {
    if (!data) return
    setSession(data)
    setProfile({
      player_name: data.player_name || 'Hero',
      age_group: data.age_group || '8-10',
      selected_realm: data.selected_realm || 'Sky Citadel',
      preferred_language: data.preferred_language || 'en',
    })
  }, [])

  useEffect(() => {
    fetchSession(sessionId)
      .then((data) => {
        syncSessionData(data)
        if (isAdminRoutePath()) {
          setScreen('admin')
          return
        }
        const hasProgress = Boolean(
          (data?.quests_completed || 0) > 0 ||
          (data?.history?.length || 0) > 0 ||
          (data?.player_name && data.player_name !== 'Hero')
        )
        setScreen(hasProgress ? 'map' : 'onboarding')
      })
      .catch((err) => {
        console.warn('Initial session load failed:', err)
        setScreen(isAdminRoutePath() ? 'admin' : 'onboarding')
      })
      .finally(() => {
        setSessionLoaded(true)
      })
  }, [sessionId, syncSessionData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
    } catch {
      // Ignore localStorage write failures (private mode/quota).
    }
  }, [sessionId])

  const refreshSession = async () => {
    try {
      const data = await fetchSession(sessionId)
      syncSessionData(data)
      return data
    } catch (err) {
      console.warn('Session refresh failed:', err)
      return null
    }
  }

  const handleOnboardingStart = async (nextProfile) => {
    const merged = {
      player_name: nextProfile.playerName || 'Hero',
      age_group: nextProfile.ageGroup || '8-10',
      selected_realm: nextProfile.selectedRealm || 'Sky Citadel',
      preferred_language: nextProfile.preferredLanguage || 'en',
    }
    setProfile(merged)
    try {
      await updateSessionProfile(sessionId, nextProfile)
    } catch (err) {
      console.warn('Profile update failed:', err)
    }
    await refreshSession()
    setScreen('map')
  }

  const handleStartQuest = () => setScreen('quest')
  const handleBackToMap = () => {
    refreshSession()
    setScreen('map')
  }

  const handleAdminExit = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/')
    }
    setScreen('map')
  }

  return (
    <>
      <style>{globalStyles}</style>
      {!sessionLoaded && (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '14px',
          letterSpacing: '1.5px',
          color: '#9ca3af',
        }}>
          LOADING QUEST DATA...
        </div>
      )}
      {screen === 'onboarding' && (
        <Suspense fallback={<ScreenFallback label="LOADING ONBOARDING..." />}>
          <Onboarding
            key={`${profile.player_name}-${profile.age_group}-${profile.selected_realm}-${profile.preferred_language}`}
            onStart={handleOnboardingStart}
            defaultProfile={profile}
          />
        </Suspense>
      )}
      {screen === 'map' && (
        <Suspense fallback={<ScreenFallback label="LOADING WORLD MAP..." />}>
          <WorldMap
            sessionId={sessionId}
            session={session}
            profile={profile}
            refreshSession={refreshSession}
            onStartQuest={handleStartQuest}
            onEditProfile={() => setScreen('onboarding')}
          />
        </Suspense>
      )}
      {screen === 'quest' && (
        <Suspense fallback={<ScreenFallback label="LOADING QUEST..." />}>
          <Quest
            sessionId={sessionId}
            session={session}
            selectedHero={selectedHero}
            setSelectedHero={setSelectedHero}
            refreshSession={refreshSession}
            profile={profile}
            onBackToMap={handleBackToMap}
          />
        </Suspense>
      )}
      {screen === 'admin' && (
        <div style={{
          minHeight: '100vh',
          padding: '20px',
          maxWidth: '900px',
          margin: '0 auto',
          background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '10px',
            flexWrap: 'wrap',
          }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 'clamp(14px, 2.2vw, 20px)',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '1.5px',
            }}>
              ADMIN DASHBOARD
            </div>
            <button
              onClick={handleAdminExit}
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#c4b5fd',
                background: 'rgba(196,181,253,0.08)',
                border: '1px solid rgba(196,181,253,0.25)',
                borderRadius: '10px',
                padding: '8px 14px',
                cursor: 'pointer',
                letterSpacing: '0.5px',
              }}
            >
              🗺️ Open Game
            </button>
          </div>
          <Suspense fallback={<ScreenFallback label="LOADING ADMIN..." />}>
            <ParentDashboard sessionId={sessionId} session={session} onClose={handleAdminExit} />
          </Suspense>
        </div>
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
        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <a href="/terms" style={{ color: 'rgba(125,211,252,0.75)' }}>Terms</a>
          <a href="/privacy" style={{ color: 'rgba(125,211,252,0.75)' }}>Privacy</a>
          <a href="/security" style={{ color: 'rgba(125,211,252,0.75)' }}>Security</a>
        </div>
      </footer>
    </>
  )
}

export default App
