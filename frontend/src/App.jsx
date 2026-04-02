import { useState, useEffect, useCallback } from 'react'
import { fetchSession, updateSessionProfile, setPlayerGuild } from './api/client'
import Onboarding from './pages/Onboarding'
import Quest from './pages/Quest'
import WorldMap from './components/WorldMap'
import ParentDashboard from './components/ParentDashboard'
import PromoPopup from './components/PromoPopup'
import { FeatureGate, initFeatureFlags } from './utils/featureFlags'
import ConcretePackers from './components/ConcretePackers'
import PotionAlchemists from './components/PotionAlchemists'
import OrbitalEngineers from './components/OrbitalEngineers'
import FeatureFlagAdmin from './components/FeatureFlagAdmin'
import PromoAdmin from './components/PromoAdmin'
import AdminDashboard from './components/AdminDashboard'
import GamePlayerPage from './pages/GamePlayerPage'
import AuthScreen from './components/AuthScreen'

const SESSION_STORAGE_KEY = 'mathscript_session_id'
const SESSION_ID_PATTERN = /^sess_[a-z0-9]{6,20}$/
const SCREEN_STORAGE_KEY = 'mathscript_screen'
const JWT_STORAGE_KEY = 'ms_jwt'

function createSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10)
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

function getStoredJwt() {
  try { return window.localStorage.getItem(JWT_STORAGE_KEY) || '' } catch { return '' }
}

function isAdminRoutePath() {
  if (typeof window === 'undefined') return false
  const normalized = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  return normalized === '/admin'
}

function isGameRoutePath() {
  if (typeof window === 'undefined') return false
  return (window.location.pathname || '/').startsWith('/play/')
}

const globalStyles = `
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: 'Fredoka One', 'Rajdhani', 'Inter', sans-serif;
    background: linear-gradient(to bottom, #87CEFA 0%, #E0F6FF 100%);
    color: #e8e8f0;
    min-height: 100vh;
    min-height: -webkit-fill-available;
    overflow-x: hidden;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  /* ── Tycoon ground scene: hills + clouds at the page bottom ── */
  body::after {
    content: '';
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 120px;
    pointer-events: none;
    z-index: 0;
    background:
      /* rolling hills */
      radial-gradient(ellipse 60% 80px at 20% 100%, #4caf50 0%, transparent 100%),
      radial-gradient(ellipse 70% 90px at 55% 110%, #66bb6a 0%, transparent 100%),
      radial-gradient(ellipse 55% 70px at 85% 100%, #388e3c 0%, transparent 100%);
  }

  .game-font { font-family: 'Orbitron', sans-serif; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0d1117; }
  ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #00d4ff, #7c3aed); border-radius: 3px; }
  input, button, textarea, select { font-size: 16px; }
  button { -webkit-appearance: none; touch-action: manipulation; }

  /* ── Sticker-style numeric readouts ── */
  .tycoon-num, .cash-readout {
    font-family: 'Fredoka One', 'Rajdhani', sans-serif !important;
    text-shadow:
       2px  2px 0 #000,
      -1px -1px 0 #000,
       1px -1px 0 #000,
      -1px  1px 0 #000,
       1px  1px 0 #000;
  }

  /* ══════════════════════════════════════════════════════════
     3D CHUNKY BUTTON SYSTEM
     Base class: .btn-3d
     Variants:   .btn-3d-primary  (purple/blue)
                 .btn-3d-upgrade  (green)
                 .btn-3d-manager  (cyan/teal)
                 .btn-3d-refactor (orange)
                 .btn-3d-quest    (gold/amber)
  ══════════════════════════════════════════════════════════ */
  .btn-3d {
    position: relative !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: 'Fredoka One', 'Rajdhani', sans-serif !important;
    font-weight: 700 !important;
    font-size: 15px !important;
    color: #fff !important;
    border: none !important;
    border-radius: 14px !important;
    padding: 14px 28px !important;
    min-height: 52px !important;
    cursor: pointer !important;
    letter-spacing: 0.5px !important;
    transition: transform 0.07s ease, box-shadow 0.07s ease !important;
    outline: none !important;
    text-shadow:  1px 1px 0 rgba(0,0,0,0.25) !important;
    user-select: none;
    -webkit-user-select: none;
  }
  .btn-3d::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(to bottom, rgba(255,255,255,0.28) 0%, transparent 55%);
    pointer-events: none;
  }
  .btn-3d:active {
    transform: translateY(4px) !important;
  }

  /* Primary – purple/blue */
  .btn-3d-primary {
    background: linear-gradient(135deg, #7c3aed, #2563eb) !important;
    box-shadow: 0 6px 0 #3b1a8a, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-primary:active {
    box-shadow: 0 2px 0 #3b1a8a, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-primary:hover:not(:active) {
    box-shadow: 0 8px 0 #3b1a8a, inset 0 1px 0 rgba(255,255,255,0.25), 0 0 20px rgba(124,58,237,0.4) !important;
  }

  /* Upgrade – green */
  .btn-3d-upgrade {
    background: linear-gradient(135deg, #22c55e, #16a34a) !important;
    box-shadow: 0 6px 0 #14532d, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-upgrade:active {
    box-shadow: 0 2px 0 #14532d, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-upgrade:hover:not(:active) {
    box-shadow: 0 8px 0 #14532d, inset 0 1px 0 rgba(255,255,255,0.25), 0 0 18px rgba(34,197,94,0.4) !important;
  }

  /* Manager – cyan/teal */
  .btn-3d-manager {
    background: linear-gradient(135deg, #06b6d4, #0891b2) !important;
    box-shadow: 0 6px 0 #164e63, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-manager:active {
    box-shadow: 0 2px 0 #164e63, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-manager:hover:not(:active) {
    box-shadow: 0 8px 0 #164e63, inset 0 1px 0 rgba(255,255,255,0.25), 0 0 18px rgba(6,182,212,0.4) !important;
  }

  /* Refactor – orange */
  .btn-3d-refactor {
    background: linear-gradient(135deg, #f97316, #ea580c) !important;
    box-shadow: 0 6px 0 #7c2d12, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-refactor:active {
    box-shadow: 0 2px 0 #7c2d12, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-refactor:hover:not(:active) {
    box-shadow: 0 8px 0 #7c2d12, inset 0 1px 0 rgba(255,255,255,0.25), 0 0 18px rgba(249,115,22,0.4) !important;
  }

  /* Quest / Gold – amber */
  .btn-3d-quest {
    background: linear-gradient(135deg, #f59e0b, #d97706) !important;
    box-shadow: 0 6px 0 #78350f, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-quest:active {
    box-shadow: 0 2px 0 #78350f, inset 0 1px 0 rgba(255,255,255,0.25) !important;
  }
  .btn-3d-quest:hover:not(:active) {
    box-shadow: 0 8px 0 #78350f, inset 0 1px 0 rgba(255,255,255,0.25), 0 0 18px rgba(245,158,11,0.4) !important;
  }

  /* Disabled – grey */
  .btn-3d-disabled {
    background: linear-gradient(135deg, #6b7280, #4b5563) !important;
    box-shadow: 0 4px 0 #1f2937, inset 0 1px 0 rgba(255,255,255,0.10) !important;
    cursor: default !important;
    opacity: 0.85 !important;
  }
  .btn-3d-disabled:active {
    transform: none !important;
    box-shadow: 0 4px 0 #1f2937, inset 0 1px 0 rgba(255,255,255,0.10) !important;
  }

  /* ── Floor structural beam (Task 4) ── */
  .floor-beam {
    height: 14px !important;
    background: linear-gradient(to bottom, #d1d5db, #9ca3af) !important;
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.35), inset 0 -2px 3px rgba(255,255,255,0.15) !important;
    border-radius: 0 !important;
    margin: 0 !important;
  }

  /* ── Active floor panel: blue glass grid ── */
  .floor-panel-active {
    background-image:
      linear-gradient(rgba(14,165,233,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(14,165,233,0.07) 1px, transparent 1px) !important;
    background-size: 24px 24px !important;
    background-color: rgba(14,165,233,0.05) !important;
  }
  .onboarding-name-input::placeholder { color: rgba(200,210,225,0.55); }
  .onboarding-name-input { color: #fff; }
  .onboarding-name-input:focus { border-color: rgba(0,212,255,0.65) !important; box-shadow: 0 0 12px rgba(0,212,255,0.25) !important; }

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
    .onboarding-hero-row { gap: 8px !important; padding-left: 12px !important; padding-right: 12px !important; }
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
  const [sessionId, setSessionId] = useState(() => getOrCreateSessionId())
  const [jwt, setJwt] = useState(() => getStoredJwt())
  const [session, setSession] = useState({ coins: 0, inventory: [], history: [] })
  const [selectedHero, setSelectedHero] = useState(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  // Incremented by initFeatureFlags() when remote flag values differ from
  // the env-var defaults, so FeatureGate components re-evaluate.
  const [, setFlagsVersion] = useState(0)
  const [profile, setProfile] = useState({
    player_name: 'Hero',
    age_group: '8-10',
    selected_realm: 'Sky Citadel',
    preferred_language: 'en',
    guild: null,
  })
  // Admin dashboard password gate — stored in sessionStorage for the tab lifetime
  const [adminAuth, setAdminAuth] = useState(() => {
    try { return sessionStorage.getItem('ms_admin_auth') === '1' } catch { return false }
  })
  const [adminPwInput, setAdminPwInput] = useState('')
  const [adminPwError, setAdminPwError] = useState(false)

  const syncSessionData = useCallback((data) => {
    if (!data) return
    setSession(data)
    setProfile({
      player_name: data.player_name || 'Hero',
      age_group: data.age_group || '8-10',
      selected_realm: data.selected_realm || 'Sky Citadel',
      preferred_language: data.preferred_language || 'en',
      guild: data.guild || null,
    })
  }, [])

  // Called by AuthScreen on successful login or registration
  const handleAuthSuccess = useCallback((data) => {
    const { token, session_id: newSessionId } = data
    try {
      window.localStorage.setItem(JWT_STORAGE_KEY, token)
      window.localStorage.setItem(SESSION_STORAGE_KEY, newSessionId)
    } catch { /* private mode */ }
    setJwt(token)
    setSessionId(newSessionId)
    setScreen('loading')   // trigger the session-load useEffect
  }, [])

  useEffect(() => {
    // Fetch live feature flags in parallel with the session — neither blocks
    // the other, and the UI renders with env-var defaults until flags arrive.
    initFeatureFlags(() => setFlagsVersion(v => v + 1))

    // Poll for flag changes every 60 s so mini-game visibility updates after
    // an admin toggles a flag without requiring a full page reload.
    const flagPollInterval = setInterval(
      () => initFeatureFlags(() => setFlagsVersion(v => v + 1)),
      60_000
    )

    // Also refresh immediately when the user returns to this tab.
    const onFocus = () => initFeatureFlags(() => setFlagsVersion(v => v + 1))
    window.addEventListener('focus', onFocus)

    // Admin and game routes bypass the auth gate entirely
    if (isAdminRoutePath() || isGameRoutePath()) {
      fetchSession(sessionId)
        .then((data) => {
          syncSessionData(data)
          setScreen(isAdminRoutePath() ? 'admin' : 'game')
        })
        .catch(() => setScreen(isAdminRoutePath() ? 'admin' : 'game'))
        .finally(() => setSessionLoaded(true))
      return () => {
        clearInterval(flagPollInterval)
        window.removeEventListener('focus', onFocus)
      }
    }

    // Require JWT — show auth screen if none is stored
    if (!jwt) {
      setScreen('auth')
      setSessionLoaded(true)
      return () => {
        clearInterval(flagPollInterval)
        window.removeEventListener('focus', onFocus)
      }
    }

    fetchSession(sessionId)
      .then((data) => {
        syncSessionData(data)
        const hasProgress = Boolean(
          (data?.quests_completed || 0) > 0 ||
          (data?.history?.length || 0) > 0 ||
          (data?.player_name && data.player_name !== 'Hero')
        )
        if (hasProgress) {
          setScreen('map')
        } else {
          setScreen('onboarding')
        }
      })
      .catch((err) => {
        console.warn('Initial session load failed:', err)
        setScreen('onboarding')
      })
      .finally(() => {
        setSessionLoaded(true)
      })

    return () => {
      clearInterval(flagPollInterval)
      window.removeEventListener('focus', onFocus)
    }
  }, [sessionId, jwt, syncSessionData])

  useEffect(() => {
    if (screen === 'loading') return
    try {
      // Save 'quest' as 'map' so refreshing from quest returns to map
      window.localStorage.setItem(SCREEN_STORAGE_KEY, screen === 'quest' ? 'map' : screen)
    } catch {
      // Ignore write failures in restricted browsing contexts
    }
  }, [screen])

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
      guild: nextProfile.guild || null,
    }
    setProfile(merged)
    try {
      await updateSessionProfile(sessionId, nextProfile)
      if (nextProfile.guild) {
        await setPlayerGuild(sessionId, nextProfile.guild)
      }
    } catch (err) {
      console.warn('Profile update failed:', err)
    }
    await refreshSession()
    setScreen('map')
  }

  const [showPromoPopup, setShowPromoPopup] = useState(false)
  const handleOpenPromo = () => setShowPromoPopup(true)
  const handleClosePromo = () => setShowPromoPopup(false)

  const handleStartQuest = () => setScreen('quest')
  const handleBackToMap = () => {
    refreshSession()
    setScreen('map')
  }
  const handleStartConcretePackers = () => setScreen('concrete-packers')
  const handleStartPotionAlchemists = () => setScreen('potion-alchemists')
  const handleStartOrbitalEngineers = () => setScreen('orbital-engineers')
  const handleStartTycoon = () => {
    if (typeof window !== 'undefined') {
      window.location.href = `/play.html?s=${sessionId}`
    }
  }

  const handleAdminExit = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/')
    }
    setScreen('map')
  }

  const handleAdminPwSubmit = (e) => {
    e.preventDefault()
    if (adminPwInput === 'b161163') {
      try { sessionStorage.setItem('ms_admin_auth', '1') } catch { /* ignore */ }
      setAdminAuth(true)
      setAdminPwError(false)
      setAdminPwInput('')
    } else {
      setAdminPwError(true)
      setAdminPwInput('')
    }
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
          background: '#0a0e1a',
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '14px',
          letterSpacing: '1.5px',
          color: '#9ca3af',
        }}>
          LOADING QUEST DATA...
        </div>
      )}
      {screen === 'auth' && (
        <AuthScreen onSuccess={handleAuthSuccess} />
      )}
      {screen === 'onboarding' && (
        <Onboarding onStart={handleOnboardingStart} defaultProfile={profile} />
      )}
      {screen === 'map' && (
        <WorldMap
          sessionId={sessionId}
          session={session}
          profile={profile}
          refreshSession={refreshSession}
          onStartQuest={handleStartQuest}
          onEditProfile={() => setScreen('onboarding')}
          onStartConcretePackers={handleStartConcretePackers}
          onStartPotionAlchemists={handleStartPotionAlchemists}
          onStartOrbitalEngineers={handleStartOrbitalEngineers}
          onStartTycoon={handleStartTycoon}
        />
      )}
      {screen === 'quest' && (
        <Quest
          sessionId={sessionId}
          session={session}
          selectedHero={selectedHero}
          setSelectedHero={setSelectedHero}
          refreshSession={refreshSession}
          profile={profile}
          onBackToMap={handleBackToMap}
          onOpenPromo={handleOpenPromo}
        />
      )}
      {/* ── Feature-flagged mini-game screens ── */}
      <FeatureGate flag="CONCRETE_PACKERS">
        {screen === 'concrete-packers' && (
          <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={handleBackToMap}
                style={{
                  fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
                  color: '#9ca3af', background: 'transparent',
                  border: '1px solid rgba(156,163,175,0.25)', borderRadius: '8px',
                  padding: '7px 14px', cursor: 'pointer',
                }}
              >
                ← Back to Map
              </button>
              <div style={{
                fontFamily: "'Orbitron', sans-serif", fontSize: '12px',
                fontWeight: 700, color: '#f97316', letterSpacing: '1px',
              }}>
                TRAINING GROUNDS
              </div>
            </div>
            <ConcretePackers
              equation={`${Math.floor(Math.random() * 5) + 5} + ${Math.floor(Math.random() * 5) + 2}`}
              sessionId={sessionId}
              onComplete={handleBackToMap}
            />
          </div>
        )}
      </FeatureGate>
      <FeatureGate flag="POTION_ALCHEMISTS">
        {screen === 'potion-alchemists' && (
          <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={handleBackToMap}
                style={{
                  fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
                  color: '#9ca3af', background: 'transparent',
                  border: '1px solid rgba(156,163,175,0.25)', borderRadius: '8px',
                  padding: '7px 14px', cursor: 'pointer',
                }}
              >
                ← Back to Map
              </button>
              <div style={{
                fontFamily: "'Orbitron', sans-serif", fontSize: '12px',
                fontWeight: 700, color: '#a855f7', letterSpacing: '1px',
              }}>
                TRAINING GROUNDS
              </div>
            </div>
            <PotionAlchemists sessionId={sessionId} onComplete={handleBackToMap} />
          </div>
        )}
      </FeatureGate>
      <FeatureGate flag="ORBITAL_ENGINEERS">
        {screen === 'orbital-engineers' && (
          <div style={{ minHeight: '100vh', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={handleBackToMap}
                style={{
                  fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
                  color: '#9ca3af', background: 'transparent',
                  border: '1px solid rgba(156,163,175,0.25)', borderRadius: '8px',
                  padding: '7px 14px', cursor: 'pointer',
                }}
              >
                ← Back to Map
              </button>
              <div style={{
                fontFamily: "'Orbitron', sans-serif", fontSize: '12px',
                fontWeight: 700, color: '#38bdf8', letterSpacing: '1px',
              }}>
                ORBITAL TRAINING
              </div>
            </div>
            <OrbitalEngineers sessionId={sessionId} onComplete={handleBackToMap} />
          </div>
        )}
      </FeatureGate>
      {screen === 'game' && (
        <GamePlayerPage
          sessionId={sessionId}
          onAnalogyMilestone={(data) => {
            // External hook — add analytics / telemetry here if needed.
            // The overlay and Phaser resume are handled inside GamePlayerPage.
            console.info('[App] Analogy Milestone reached:', data)
          }}
        />
      )}
      {screen === 'admin' && (
        !adminAuth ? (
          /* ── Password gate ────────────────────────────────────────────── */
          <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
          }}>
            <div style={{
              background: '#141927', border: '1px solid #2a3050',
              borderRadius: '16px', padding: '40px 32px',
              width: '100%', maxWidth: '360px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔐</div>
              <div style={{
                fontFamily: "'Orbitron', sans-serif", fontSize: '16px',
                fontWeight: 800, color: '#7dd3fc',
                marginBottom: '6px', letterSpacing: '1px',
              }}>
                ADMIN ACCESS
              </div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>
                Enter the admin password to continue
              </div>
              <form onSubmit={handleAdminPwSubmit}>
                <input
                  type="password"
                  value={adminPwInput}
                  onChange={e => { setAdminPwInput(e.target.value); setAdminPwError(false) }}
                  placeholder="Password"
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 16px', marginBottom: '12px',
                    background: '#1a2035', border: `1px solid ${adminPwError ? '#f87171' : '#2a3050'}`,
                    borderRadius: '8px', color: '#e0e0e0', fontSize: '15px',
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {adminPwError && (
                  <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '10px', fontFamily: "'Rajdhani', sans-serif" }}>
                    Incorrect password
                  </div>
                )}
                <button type="submit" style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: '8px', color: '#fff',
                  fontFamily: "'Orbitron', sans-serif", fontSize: '12px',
                  fontWeight: 700, letterSpacing: '1px', cursor: 'pointer',
                }}>
                  SIGN IN
                </button>
              </form>
              <button onClick={handleAdminExit} style={{
                marginTop: '14px', background: 'none', border: 'none',
                color: '#6b7280', fontSize: '13px',
                fontFamily: "'Rajdhani', sans-serif", cursor: 'pointer',
              }}>
                ← Back to game
              </button>
            </div>
          </div>
        ) : (
          /* ── Authenticated dashboard ──────────────────────────────────── */
          <div style={{
            minHeight: '100vh',
            padding: '20px',
            maxWidth: '900px',
            margin: '0 auto',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              gap: '10px', marginBottom: '10px', flexWrap: 'wrap',
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: 'clamp(14px, 2.2vw, 20px)',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text', letterSpacing: '1.5px',
              }}>
                ADMIN DASHBOARD
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    try { sessionStorage.removeItem('ms_admin_auth') } catch { /* ignore */ }
                    setAdminAuth(false)
                  }}
                  style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
                    color: '#f87171', background: 'rgba(248,113,113,0.08)',
                    border: '1px solid rgba(248,113,113,0.25)', borderRadius: '10px',
                    padding: '8px 14px', cursor: 'pointer',
                  }}
                >
                  🔒 Lock
                </button>
                <button
                  onClick={handleAdminExit}
                  style={{
                    fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
                    color: '#c4b5fd', background: 'rgba(196,181,253,0.08)',
                    border: '1px solid rgba(196,181,253,0.25)', borderRadius: '10px',
                    padding: '8px 14px', cursor: 'pointer',
                  }}
                >
                  🗺️ Open Game
                </button>
              </div>
            </div>

            <ParentDashboard sessionId={sessionId} session={session} onClose={handleAdminExit} />

            {/* Telemetry analytics dashboard */}
            <div style={{
              marginTop: '24px', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(96,165,250,0.15)',
              borderRadius: '14px', padding: '16px 20px',
            }}>
              <AdminDashboard />
            </div>

            {/* Promo code management */}
            <div style={{
              marginTop: '24px', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(245,158,11,0.15)',
              borderRadius: '14px', padding: '16px 20px',
            }}>
              <PromoAdmin />
            </div>

            {/* Feature flag toggles */}
            <div style={{
              marginTop: '24px', background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(167,139,250,0.15)',
              borderRadius: '14px', padding: '16px 20px',
            }}>
              <FeatureFlagAdmin />
            </div>
          </div>
        )
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
      {!isAdminRoutePath() && !isGameRoutePath() && <PromoPopup open={showPromoPopup} onClose={handleClosePromo} />}
    </>
  )
}

export default App
