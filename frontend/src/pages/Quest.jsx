import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene, { unlockAudioForIOS } from '../components/AnimatedScene'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import SubscriptionPanel from '../components/SubscriptionPanel'
import TeachingAnalogyCard from '../components/TeachingAnalogyCard'
import IdeologyMeter from '../components/IdeologyMeter'
import GuildBadge from '../components/GuildBadge'
import PerseveranceBar from '../components/PerseveranceBar'
import { generateStory, generateSegmentImagesBatch, analyzeMathPhoto, fetchSubscription, recordHintUse, updateIdeology, getMentorHint, updateSessionProfile } from '../api/client'
import { generateProblem, checkAnswer, xpThreshold, xpEarned } from '../utils/MathEngine'
import { playClick, playCast, playHit } from '../utils/SoundEngine'
import { trackEvent } from '../utils/Telemetry'
import ContactPopup from '../components/ContactPopup'
import LegalPopup from '../components/LegalPopup'

const HEROES = ['Arcanos', 'Blaze', 'Shadow', 'Luna', 'Titan', 'Webweaver', 'Volt', 'Tempest', 'Zenith']
const FREE_HERO_UNLOCKS = ['Arcanos', 'Blaze', 'Shadow', 'Zenith']
const AGE_MODE_LABELS = {
  '5-7': 'Rookie Explorer',
  '8-10': 'Quest Adventurer',
  '11-13': 'Elite Strategist',
}

const QUICK_MODE_REASON_LABELS = {
  basic_arithmetic_fast_path: 'fast local solve for instant response',
  ai_math_timeout: 'AI math solver timed out, using quick fallback',
  ai_story_timeout: 'AI storyteller timed out, using quick fallback',
  ai_math_unavailable: 'AI math solver unavailable, using quick fallback',
  ai_story_unavailable: 'AI storyteller unavailable, using quick fallback',
}

// Ideology narrative choices — shown after quest completion
const NARRATIVE_CHOICES = [
  { label: '🏗️ Methodical Approach', shift: -5, desc: 'Build step by step, leave no stone unturned' },
  { label: '🔭 Experimental Path', shift: 5, desc: 'Explore freely, discover something new' },
]

export default function Quest({ sessionId, session, selectedHero, setSelectedHero, refreshSession, profile, onBackToMap, onOpenPromo }) {
  const [mathInput, setMathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState([])
  const [mathSteps, setMathSteps] = useState([])
  const [miniGames, setMiniGames] = useState([])
  const [prefetchedImages, setPrefetchedImages] = useState(null)
  const [showShop, setShowShop] = useState(false)
  const [showParent, setShowParent] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [showLegal, setShowLegal] = useState(false)
  const [legalTab, setLegalTab] = useState('tos')
  const [showResult, setShowResult] = useState(false)
  const [coinAnim, setCoinAnim] = useState(false)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [heroLockMessage, setHeroLockMessage] = useState('')
  const [solveMode, setSolveMode] = useState('full_ai')
  const [quickModeReason, setQuickModeReason] = useState('')
  const [fullAiRetrying, setFullAiRetrying] = useState(false)
  const [apiConnectionError, setApiConnectionError] = useState(null)
  const [teachingAnalogy, setTeachingAnalogy] = useState(null)
  const [victoryStory, setVictoryStory] = useState(null)
  // Ideology / Guild / Perseverance state — derived from session prop (kept in sync)
  const ideologyMeter = session?.ideology_meter ?? 0
  const ideologyLabel = session?.ideology_label ?? 'Balanced Explorer'
  const perseveranceScore = session?.perseverance_score ?? 0
  const difficultyLabel = session?.difficulty_label ?? 'Journeyman'
  const [hintUsedThisRound, setHintUsedThisRound] = useState(false)
  const [mentorExplanation, setMentorExplanation] = useState(null)
  const [mentorLoading, setMentorLoading] = useState(false)
  // Local override so the HUD updates optimistically after narrative choice / hint
  const [ideologyOverride, setIdeologyOverride] = useState(null)
  const [perseveranceOverride, setPerseveranceOverride] = useState(null)
  const displayIdeology = ideologyOverride ?? ideologyMeter
  const displayPerseverance = perseveranceOverride ?? perseveranceScore
  // Math Progression Engine state
  const [currentProblem, setCurrentProblem] = useState(null)
  const [lastSolvedEquation, setLastSolvedEquation] = useState('')
  const [missMessage, setMissMessage] = useState('')
  const [levelOverride, setLevelOverride] = useState(null)
  const [xpOverride, setXpOverride] = useState(null)
  const displayLevel = levelOverride ?? (session?.player_level ?? 1)
  const displayXp = xpOverride ?? (session?.player_xp ?? 0)
  // Juice — visual feedback states
  const [monsterShaking, setMonsterShaking] = useState(false)
  const [castFlash, setCastFlash] = useState(false)
  const fileInputRef = useRef(null)
  const headerRef = useRef(null)
  const activeAgeMode = AGE_MODE_LABELS[profile?.age_group] || AGE_MODE_LABELS['8-10']
  const currentGuild = profile?.guild || session?.guild || null
  const inputPlaceholder = profile?.age_group === '5-7'
    ? 'Try: 7 + 5 or 12 - 4 (or upload a photo)'
    : profile?.age_group === '11-13'
      ? 'Type a challenge: fractions, exponents, equations...'
      : 'Type a math problem or upload a photo...'
  const hasPremiumHeroes = subscription?.is_premium === true
  const isHeroLocked = (heroName) => !hasPremiumHeroes && !FREE_HERO_UNLOCKS.includes(heroName)
  const lockMessage = 'This hero is Premium-only. Upgrade to unlock all heroes.'

  const [showNarrativeChoice, setShowNarrativeChoice] = useState(false)

  const refreshSubscription = () => {
    fetchSubscription(sessionId).then(s => setSubscription(s)).catch(() => {})
  }

  useEffect(() => {
    gsap.from(headerRef.current, { y: -30, opacity: 0, duration: 0.5 })
    refreshSubscription()
    // Generate the first math problem on mount
    setCurrentProblem(generateProblem(session?.player_level ?? 1))

    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setTimeout(refreshSubscription, 2000)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (subscription && !subscription.is_premium && selectedHero && isHeroLocked(selectedHero)) {
      setSelectedHero(FREE_HERO_UNLOCKS[0])
    }
  }, [subscription, selectedHero, setSelectedHero])

  useEffect(() => {
    if (!heroLockMessage) return
    const t = setTimeout(() => setHeroLockMessage(''), 2400)
    return () => clearTimeout(t)
  }, [heroLockMessage])

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoAnalyzing(true)
    try {
      const result = await analyzeMathPhoto(file)
      if (result.problem) {
        setMathInput(result.problem)
      }
    } catch (err) {
      alert(err.message || 'Could not read the photo. Try a clearer picture!')
    }
    setPhotoAnalyzing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAttack = async (opts = {}) => {
    const forceFullAi = Boolean(opts.forceFullAi)
    unlockAudioForIOS()
    if (!mathInput.trim() || !selectedHero || !currentProblem) return
    if (isHeroLocked(selectedHero)) {
      setHeroLockMessage(lockMessage)
      setShowSubscription(true)
      return
    }

    if (subscription && !subscription.can_solve) {
      setShowSubscription(true)
      return
    }

    // Valid attempt — confirm with click sound
    playClick()

    // Check the player's answer against the generated problem
    if (!checkAnswer(mathInput, currentProblem)) {
      trackEvent('spell_cast', { correct: false, level: session?.player_level ?? 1 })
      setMissMessage('💨 Miss! Wrong answer — try again!')
      setMathInput('')
      setTimeout(() => setMissMessage(''), 2500)
      return
    }

    // Correct answer — fire visual/audio cast effect
    trackEvent('spell_cast', { correct: true, level: session?.player_level ?? 1 })
    playCast()
    setCastFlash(true)
    setTimeout(() => setCastFlash(false), 350)

    setLoading(true)
    setSegments([])
    setMathSteps([])
    setMiniGames([])
    setPrefetchedImages(null)
    setShowResult(false)
    setShowShop(false)
    setShowParent(false)
    setShowSubscription(false)
    setSolveMode('full_ai')
    setQuickModeReason('')
    setApiConnectionError(null)
    setTeachingAnalogy(null)
    setVictoryStory(null)
    setShowNarrativeChoice(false)
    setHintUsedThisRound(false)
    setMentorExplanation(null)
    setMentorLoading(false)
    if (forceFullAi) setFullAiRetrying(true)

    try {
      const solvedEquation = currentProblem.problem
      const result = await generateStory(selectedHero, solvedEquation, sessionId, {
        ageGroup: profile?.age_group,
        playerName: profile?.player_name,
        selectedRealm: profile?.selected_realm,
        forceFullAi,
        timeoutMs: forceFullAi ? 45000 : 28000,
        guild: currentGuild,
      })
      const segs = result.segments || [result.story]
      setSegments(segs)
      setMathSteps(result.math_steps || [])
      setMiniGames(result.mini_games || [])
      setSolveMode(result.solve_mode || 'full_ai')
      setQuickModeReason(result.quick_mode_reason || '')
      setTeachingAnalogy(result.teaching_analogy || null)
      setVictoryStory(result.victory_story || null)
      // Update ideology/perseverance/DDA from response
      if (result.ideology_meter !== undefined) setIdeologyOverride(result.ideology_meter)
      if (result.perseverance_score !== undefined) setPerseveranceOverride(result.perseverance_score)
      setLastSolvedEquation(solvedEquation)
      setShowResult(true)
      setShowNarrativeChoice(true)

      // Monster takes damage — shake effect + hit sound
      playHit()
      setMonsterShaking(true)
      setTimeout(() => setMonsterShaking(false), 500)

      generateSegmentImagesBatch(selectedHero, segs, sessionId)
        .then(res => {
          const imgMap = {}
          segs.forEach((_, idx) => { imgMap[idx] = 'failed' })
          if (res && res.images) {
            res.images.forEach((img, idx) => {
              imgMap[idx] = (img && img.image) ? img : 'failed'
            })
          }
          setPrefetchedImages(imgMap)
        })
        .catch(() => {
          const imgMap = {}
          segs.forEach((_, idx) => { imgMap[idx] = 'failed' })
          setPrefetchedImages(imgMap)
        })

      await refreshSession()
      refreshSubscription()

      setCoinAnim(true)
      setTimeout(() => setCoinAnim(false), 2000)

      // ── Math Progression Engine: award XP, check level-up ──────────────
      const earned = xpEarned(displayLevel)
      const rawNewXp = displayXp + earned
      const threshold = xpThreshold(displayLevel)
      const leveledUp = rawNewXp >= threshold
      const newLevel = leveledUp ? displayLevel + 1 : displayLevel
      const newXp = leveledUp ? rawNewXp - threshold : rawNewXp
      setLevelOverride(newLevel)
      setXpOverride(newXp)
      // Best-effort save to backend (non-blocking)
      updateSessionProfile(sessionId, { player_level: newLevel, player_xp: newXp }).catch(() => {})
      // Generate the next problem at the (possibly new) level
      setCurrentProblem(generateProblem(newLevel))
      setMathInput('')
    } catch (e) {
      setSegments([])
      setShowResult(false)
      setSolveMode('full_ai')
      setQuickModeReason('')
      setTeachingAnalogy(null)
      setVictoryStory(null)
      if (e.message && e.message.includes('Daily limit')) {
        refreshSubscription()
        setShowSubscription(true)
      } else if (
        e.name === 'TypeError' ||
        e.name === 'AbortError' ||
        (e.message && (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('timed out') || e.message.includes('Failed to fetch')))
      ) {
        setApiConnectionError(e.message || 'Could not reach the AI math server. Check your connection and retry.')
      } else {
        alert(e.message || 'Something went wrong. Try again!')
      }
    }
    setLoading(false)
    setFullAiRetrying(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
      padding: '20px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      {/* ── Juice: shared animation keyframes ── */}
      <style>{`
        @keyframes ms-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          15%       { transform: translateX(-7px) rotate(-3deg); }
          30%       { transform: translateX(7px)  rotate(3deg); }
          45%       { transform: translateX(-5px) rotate(-2deg); }
          60%       { transform: translateX(5px)  rotate(2deg); }
          75%       { transform: translateX(-3px) rotate(-1deg); }
        }
        @keyframes ms-cast-flash {
          0%   { opacity: 0.55; }
          100% { opacity: 0; }
        }
        .ms-shake { animation: ms-shake 0.5s ease-in-out; }
      `}</style>

      {/* ── Juice: full-viewport cast flash ── */}
      {castFlash && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 40%, rgba(180,130,255,0.55) 0%, rgba(255,255,255,0.18) 60%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 9999,
          animation: 'ms-cast-flash 0.35s ease-out forwards',
        }} />
      )}
      <div ref={headerRef} className="quest-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <button onClick={() => { playClick(); onBackToMap() }} style={{
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '2px',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}>
          THE MATH SCRIPT
        </button>
        <div className="quest-header-buttons" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { playClick(); onBackToMap() }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#c4b5fd', background: 'rgba(196,181,253,0.08)',
            border: '1px solid rgba(196,181,253,0.25)', borderRadius: '10px',
            padding: '8px 14px', cursor: 'pointer', transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }} className="mobile-secondary-btn">🗺️ Map</button>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '15px',
            fontWeight: 700,
            color: '#fbbf24',
            background: 'rgba(251,191,36,0.08)',
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(251,191,36,0.2)',
            transition: 'all 0.3s',
            transform: coinAnim ? 'scale(1.3)' : 'scale(1)',
          }}>
            🪙 {session.coins}
          </div>
          {(session.equipped?.length > 0 || session.potions?.length > 0) && (
            <div style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#9ca3af',
              background: 'rgba(255,255,255,0.04)',
              padding: '6px 12px',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontFamily: "'Rajdhani', sans-serif",
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '8px', letterSpacing: '1px', color: '#6b7280' }}>GEAR</span>
              <span style={{ color: '#22c55e', fontWeight: 700 }}>{session.equipped?.length || 0}</span>
              {session.potions?.length > 0 && (
                <>
                  <span style={{ color: '#4b5563' }}>|</span>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '8px', letterSpacing: '1px', color: '#6b7280' }}>POT</span>
                  <span style={{ color: '#a855f7', fontWeight: 700 }}>{session.potions.length}</span>
                </>
              )}
            </div>
          )}
          <button onClick={() => { setShowShop(!showShop); setShowParent(false); setShowSubscription(false) }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.2)', borderRadius: '10px',
            padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }} className="mobile-secondary-btn">🏪 Shop</button>
          <button onClick={() => { setShowParent(!showParent); setShowShop(false); setShowSubscription(false) }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#00d4ff', background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px',
            padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }} className="mobile-secondary-btn">🔐 Parent</button>
          {subscription?.is_premium ? (
            <div style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
              color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)', borderRadius: '10px',
              padding: '8px 12px', cursor: 'pointer',
            }} onClick={() => { setShowSubscription(!showSubscription); setShowShop(false); setShowParent(false) }}>
              ⭐ Premium
            </div>
          ) : (
            <button onClick={() => { onOpenPromo?.(); setShowShop(false); setShowParent(false) }} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none', borderRadius: '10px',
              padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
              letterSpacing: '0.5px',
              boxShadow: '0 6px 0 rgba(0,0,0,0.3)',
            }}
            onMouseDown={e => { e.currentTarget.style.transform='translateY(1px)'; e.currentTarget.style.boxShadow='0 2px 0 rgba(0,0,0,0.3)' }}
            onMouseUp={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 6px 0 rgba(0,0,0,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='0 6px 0 rgba(0,0,0,0.3)' }}
            className="mobile-primary-btn">🚀 Upgrade</button>
          )}
        </div>
      </div>

      {subscription && !subscription.is_premium && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          padding: '10px 16px',
          background: subscription.can_solve ? 'rgba(0,212,255,0.05)' : 'rgba(239,68,68,0.08)',
          border: subscription.can_solve ? '1px solid rgba(0,212,255,0.15)' : '1px solid rgba(239,68,68,0.2)',
          borderRadius: '10px',
        }}>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            color: subscription.can_solve ? '#00d4ff' : '#fca5a5',
          }}>
            {subscription.can_solve
              ? `Free tier: ${subscription.remaining} of ${subscription.daily_limit} problems remaining today`
              : `Daily limit reached! Upgrade to Premium for unlimited quests`}
          </div>
          {!subscription.can_solve && (
            <button onClick={() => onOpenPromo?.()} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none', borderRadius: '8px', padding: '6px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Upgrade</button>
          )}
        </div>
      )}

      <div style={{
        marginBottom: '14px',
        padding: '10px 14px',
        background: 'rgba(124,58,237,0.08)',
        border: '1px solid rgba(124,58,237,0.22)',
        borderRadius: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
      }}>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          color: '#d8b4fe',
          fontWeight: 700,
          fontSize: '14px',
        }}>
          {profile?.player_name || 'Hero'} • {activeAgeMode} • {profile?.selected_realm || 'Sky Citadel'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            color: '#9ca3af',
            fontWeight: 600,
            fontSize: '13px',
          }}>
            Streak: {session?.streak_count || 1} 🔥 • Quests: {session?.quests_completed || session?.history?.length || 0}
            {' • '}
            <span style={{ color: '#a78bfa' }}>
              Lv.{displayLevel} · XP {displayXp}/{xpThreshold(displayLevel)}
            </span>
            {difficultyLabel && (
              <span style={{ color: '#7c3aed', marginLeft: '10px' }}>
                ⚔️ {difficultyLabel}
              </span>
            )}
          </div>
          <button onClick={() => setShowContact(true)} style={{
            background: 'none', border: '1px solid rgba(124,58,237,0.35)',
            borderRadius: '6px', padding: '3px 10px',
            color: '#7c3aed', fontSize: '11px', fontWeight: 700,
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Contact Us</button>
          <button onClick={() => { setLegalTab('tos'); setShowLegal(true) }} style={{
            background: 'none', border: 'none', color: '#4a5568',
            fontSize: '10px', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px',
            textTransform: 'uppercase', padding: '3px 4px', whiteSpace: 'nowrap',
          }}>Terms</button>
          <button onClick={() => { setLegalTab('privacy'); setShowLegal(true) }} style={{
            background: 'none', border: 'none', color: '#4a5568',
            fontSize: '10px', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px',
            textTransform: 'uppercase', padding: '3px 4px', whiteSpace: 'nowrap',
          }}>Privacy</button>
        </div>
      </div>

      <ContactPopup open={showContact} onClose={() => setShowContact(false)} />
      <LegalPopup open={showLegal} onClose={() => setShowLegal(false)} initialTab={legalTab} />

      {/* ── Guild / Ideology / Perseverance HUD ── */}
      {(currentGuild || displayIdeology !== 0 || displayPerseverance > 0) && (
        <div style={{
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '14px',
          alignItems: 'center',
        }}>
          {currentGuild && (
            <GuildBadge guild={currentGuild} compact />
          )}
          {(displayIdeology !== 0 || currentGuild) && (
            <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
              <IdeologyMeter meter={displayIdeology} label={ideologyLabel} compact />
            </div>
          )}
          {displayPerseverance > 0 && (
            <div style={{ flex: '1 1 100px', minWidth: '90px' }}>
              <PerseveranceBar score={displayPerseverance} compact />
            </div>
          )}
        </div>
      )}

      {showShop && (
        <ShopPanel sessionId={sessionId} session={session} refreshSession={refreshSession} onClose={() => setShowShop(false)} />
      )}

      {showParent && (
        <ParentDashboard sessionId={sessionId} session={session} onClose={() => setShowParent(false)} />
      )}

      {showSubscription && (
        <SubscriptionPanel
          sessionId={sessionId}
          subscription={subscription}
          onClose={() => setShowSubscription(false)}
          onRefresh={refreshSubscription}
        />
      )}

      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: '12px',
        fontWeight: 600,
        color: '#7c3aed',
        marginBottom: '16px',
        letterSpacing: '2px',
        textTransform: 'uppercase',
      }}>
        Select Your Hero
      </div>
      <div className="hero-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: '12px',
        marginBottom: heroLockMessage ? '10px' : '24px',
      }}>
        {HEROES.map((name, i) => (
          <HeroCard
            key={name}
            name={name}
            selected={selectedHero === name}
            locked={isHeroLocked(name)}
            lockLabel="Premium"
            onClick={() => {
              unlockAudioForIOS()
              playClick()
              if (isHeroLocked(name)) {
                setHeroLockMessage(lockMessage)
                onOpenPromo?.()
                return
              }
              setHeroLockMessage('')
              setSelectedHero(name)
            }}
            index={i}
          />
        ))}
      </div>
      {!hasPremiumHeroes && (
        <div style={{
          marginBottom: '14px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '13px',
          color: '#cbd5e1',
          fontWeight: 600,
        }}>
          Free heroes unlocked: {FREE_HERO_UNLOCKS.join(', ')} • Upgrade for full hero roster.
        </div>
      )}
      {heroLockMessage && (
        <div style={{
          marginBottom: '14px',
          padding: '8px 10px',
          borderRadius: '8px',
          border: '1px solid rgba(251,191,36,0.3)',
          background: 'rgba(251,191,36,0.08)',
          color: '#fde68a',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '13px',
          fontWeight: 700,
        }}>
          {heroLockMessage}
        </div>
      )}




      {loading && !showResult && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '16px',
          fontWeight: 600,
          color: '#7c3aed',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⚔️</div>
          Hero is casting a story spell...
          <style>{`
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {apiConnectionError && !loading && (
        <div style={{
          marginBottom: '12px',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid rgba(239,68,68,0.4)',
          background: 'rgba(239,68,68,0.08)',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          color: '#fca5a5',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div>
            ⚠️ AI Math Generator Offline
            <span style={{ color: '#cbd5e1', fontWeight: 500, marginLeft: '6px' }}>
              ({apiConnectionError})
            </span>
          </div>
          <button
            onClick={() => { setApiConnectionError(null); handleAttack() }}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '11px',
              fontWeight: 700,
              color: '#0f172a',
              background: 'linear-gradient(135deg, #f87171, #ef4444)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 12px',
              cursor: 'pointer',
              letterSpacing: '0.5px',
            }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {showResult && segments.length > 0 && (
        <>
          {solveMode !== 'full_ai' && (
            <div style={{
              marginBottom: '8px',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(251,191,36,0.28)',
              background: 'rgba(251,191,36,0.08)',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '14px',
              color: '#fde68a',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <div>
                ⚡ Quick Mode Active
                <span style={{ color: '#cbd5e1', fontWeight: 600, marginLeft: '6px' }}>
                  ({QUICK_MODE_REASON_LABELS[quickModeReason] || 'quick fallback in use'})
                </span>
              </div>
              <button
                onClick={() => handleAttack({ forceFullAi: true })}
                disabled={loading || fullAiRetrying}
                className="mobile-secondary-btn"
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0f172a',
                  background: loading || fullAiRetrying ? '#94a3b8' : 'linear-gradient(135deg, #22d3ee, #14b8a6)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: loading || fullAiRetrying ? 'default' : 'pointer',
                  letterSpacing: '0.5px',
                }}
              >
                {fullAiRetrying ? 'Retrying...' : 'Retry Full AI Solve'}
              </button>
            </div>
          )}
          <TeachingAnalogyCard data={teachingAnalogy} />

          {/* ── Narrative Choice (ideology shift) ── */}
          {showNarrativeChoice && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.8))',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '14px',
              padding: '14px 16px',
              marginBottom: '14px',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '1.5px',
                color: '#a855f7',
                marginBottom: '10px',
              }}>
                ✨ HOW DID YOU APPROACH IT?
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {NARRATIVE_CHOICES.map((choice) => (
                  <button
                    key={choice.shift}
                    onClick={async () => {
                      setShowNarrativeChoice(false)
                      const newMeter = Math.max(-100, Math.min(100, displayIdeology + choice.shift))
                      setIdeologyOverride(newMeter)
                      // Persist ideology shift to backend
                      try {
                        const ideologyRes = await updateIdeology(sessionId, choice.shift)
                        if (ideologyRes?.ideology_meter !== undefined) setIdeologyOverride(ideologyRes.ideology_meter)
                      } catch { /* silent — optimistic update already applied */ }
                      // If hint was used and correct, award extra perseverance
                      if (hintUsedThisRound) {
                        try {
                          const res = await recordHintUse(sessionId, true)
                          if (res?.perseverance_score !== undefined) setPerseveranceOverride(res.perseverance_score)
                        } catch { /* silent */ }
                      }
                    }}
                    style={{
                      flex: '1 1 140px',
                      textAlign: 'left',
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.25)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      color: '#e2e8f0',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.6)'; e.currentTarget.style.background = 'rgba(139,92,246,0.15)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)'; e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}
                  >
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: '14px', color: '#c4b5fd' }}>
                      {choice.label}
                    </div>
                    <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {choice.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#00d4ff',
            marginBottom: '8px',
            letterSpacing: '2px',
          }}>
            The Victory Story
          </div>
          <AnimatedScene hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={mathInput} prefetchedImages={prefetchedImages} mathSteps={mathSteps} miniGames={miniGames} session={session} onBonusCoins={(newTotal) => refreshSession()} />

          {/* ── World Builder Victory Beat ── */}
          {victoryStory && (
            <div style={{
              marginTop: '16px',
              padding: '16px 18px',
              background: 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(124,58,237,0.06))',
              border: '1px solid rgba(0,212,255,0.25)',
              borderRadius: '14px',
              backdropFilter: 'blur(6px)',
            }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '2px',
                color: '#00d4ff',
                marginBottom: '10px',
              }}>
                ⚡ WORLD BUILDER — VICTORY BEAT
              </div>
              <p style={{
                margin: 0,
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '15px',
                fontWeight: 600,
                lineHeight: '1.6',
                color: '#e2e8f0',
                whiteSpace: 'pre-wrap',
              }}>{victoryStory}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
