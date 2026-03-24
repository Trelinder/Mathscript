import { Suspense, useState, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene, { unlockAudioForIOS } from '../components/AnimatedScene'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import SubscriptionPanel from '../components/SubscriptionPanel'
import TeachingAnalogyCard from '../components/TeachingAnalogyCard'
import { generateStory, generateSegmentImagesBatch, analyzeMathPhoto, fetchSubscription, verifyParentPin, setParentPin as setParentPinApi, persistMathDraft } from '../api/client'
import ContactPopup from '../components/ContactPopup'
import SuccessBurst from '../components/SuccessBurst'
import { EDU_THEME } from '../styles/designSystem'
import { formatLocalizedNumber } from '../utils/locale'
import { normalizeMathInput, toFriendlyMathError } from '../utils/mathExpression'

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
  const [showResult, setShowResult] = useState(false)
  const [coinAnim, setCoinAnim] = useState(false)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [heroLockMessage, setHeroLockMessage] = useState('')
  const [solveMode, setSolveMode] = useState('full_ai')
  const [quickModeReason, setQuickModeReason] = useState('')
  const [fullAiRetrying, setFullAiRetrying] = useState(false)
  const [teachingAnalogy, setTeachingAnalogy] = useState(null)
  const [questFeedback, setQuestFeedback] = useState('')
  const [showSuccessBurst, setShowSuccessBurst] = useState(false)
  const [parentVerifiedUntil, setParentVerifiedUntil] = useState(0)
  const fileInputRef = useRef(null)
  const headerRef = useRef(null)
  const activeAgeMode = AGE_MODE_LABELS[profile?.age_group] || AGE_MODE_LABELS['8-10']
  const inputPlaceholder = profile?.age_group === '5-7'
    ? 'Try: 7 + 5 or 12 - 4 (or upload a photo)'
    : profile?.age_group === '11-13'
      ? 'Type a challenge: fractions, exponents, equations...'
      : 'Type a math problem or upload a photo...'
  const hasPremiumHeroes = subscription?.is_premium === true
  const isHeroLocked = useCallback((heroName) => !hasPremiumHeroes && !FREE_HERO_UNLOCKS.includes(heroName), [hasPremiumHeroes])
  const lockMessage = 'This hero is Premium-only. Upgrade to unlock all heroes.'
  const normalizedMathInput = normalizeMathInput(mathInput)
  const problemText = mathInput.trim()
  const language = profile?.language || 'en'

  const refreshSubscription = useCallback(() => {
    fetchSubscription(sessionId).then(s => setSubscription(s)).catch(() => {})
  }, [sessionId])

  const handleToggleParentDashboard = async () => {
    if (showParent) {
      setShowParent(false)
      return
    }
    if (Date.now() >= parentVerifiedUntil) {
      const pinInput = window.prompt('Enter parent PIN (4-8 digits). If this is your first time, enter a new PIN to set it.')
      if (!pinInput) return
      const pin = pinInput.trim()
      try {
        const verify = await verifyParentPin(sessionId, pin)
        if (verify.setup_required) {
          await setParentPinApi(sessionId, pin)
        } else if (verify.locked) {
          alert('Parent PIN is temporarily locked. Please wait and try again.')
          return
        } else if (!verify.verified) {
          alert('Incorrect parent PIN.')
          return
        }
        setParentVerifiedUntil(Date.now() + 15 * 60 * 1000)
      } catch (err) {
        alert(err.message || 'Could not verify parent PIN.')
        return
      }
    }
    setShowParent(true)
    setShowShop(false)
    setShowSubscription(false)
  }

  useEffect(() => {
    gsap.from(headerRef.current, { y: -30, opacity: 0, duration: 0.5 })
    refreshSubscription()

    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setTimeout(refreshSubscription, 2000)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [refreshSubscription])

  useEffect(() => {
    if (subscription && !subscription.is_premium && selectedHero && isHeroLocked(selectedHero)) {
      setSelectedHero(FREE_HERO_UNLOCKS[0])
    }
  }, [subscription, selectedHero, setSelectedHero, isHeroLocked])

  useEffect(() => {
    if (!heroLockMessage) return
    const t = setTimeout(() => setHeroLockMessage(''), 2400)
    return () => clearTimeout(t)
  }, [heroLockMessage])

  useEffect(() => {
    persistMathDraft(sessionId, normalizeMathInput(mathInput))
  }, [mathInput, sessionId])

  const handleMathInputChange = useCallback((nextValue) => {
    setMathInput(nextValue)
    setQuestFeedback('')
  }, [])

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoAnalyzing(true)
    setQuestFeedback('')
    try {
      const result = await analyzeMathPhoto(file)
      if (result.problem) {
        setMathInput(normalizeMathInput(result.problem))
        setQuestFeedback('Photo imported. Review the expression, then press Attack.')
      }
    } catch (err) {
      setQuestFeedback(err.message || "I couldn't read that photo clearly yet. Try a brighter, closer photo.")
    }
    setPhotoAnalyzing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAttack = async (opts = {}) => {
    const forceFullAi = Boolean(opts.forceFullAi)
    unlockAudioForIOS()
    if (!mathInput.trim() || !selectedHero) return
    if (isHeroLocked(selectedHero)) {
      setHeroLockMessage(lockMessage)
      setShowSubscription(true)
      return
    }

    if (subscription && !subscription.can_solve) {
      setShowSubscription(true)
      return
    }

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
    setTeachingAnalogy(null)
    if (forceFullAi) setFullAiRetrying(true)

    try {
      const result = await generateStory(selectedHero, mathInput, sessionId, {
        ageGroup: profile?.age_group,
        playerName: profile?.player_name,
        selectedRealm: profile?.selected_realm,
        forceFullAi,
        timeoutMs: forceFullAi ? 45000 : 28000,
      })
      const segs = result.segments || [result.story]
      setSegments(segs)
      setMathSteps(result.math_steps || [])
      setMiniGames(result.mini_games || [])
      setSolveMode(result.solve_mode || 'full_ai')
      setQuickModeReason(result.quick_mode_reason || '')
      setTeachingAnalogy(result.teaching_analogy || null)
      setShowResult(true)

      generateSegmentImagesBatch(selectedHero, segs, sessionId)
        .then(res => {
          if (res && res.images) {
            const imgMap = {}
            res.images.forEach((img, idx) => {
              imgMap[idx] = (img && img.image) ? img : 'failed'
            })
            setPrefetchedImages(imgMap)
          }
        })
        .catch(() => {})

      await refreshSession()
      refreshSubscription()

      setCoinAnim(true)
      setTimeout(() => setCoinAnim(false), 2000)
      setShowSuccessBurst(true)
      setTimeout(() => setShowSuccessBurst(false), 1800)
      setQuestFeedback('Nice solving! Story generated and progress saved.')
    } catch (e) {
      setSegments([])
      setShowResult(false)
      setSolveMode('full_ai')
      setQuickModeReason('')
      setTeachingAnalogy(null)
      if (e.message && e.message.includes('Daily limit')) {
        refreshSubscription()
        setShowSubscription(true)
        setQuestFeedback(toFriendlyMathError(e.message, problemText))
      } else {
        setQuestFeedback(toFriendlyMathError(e.message, problemText))
      }
    }
    setLoading(false)
    setFullAiRetrying(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, ${EDU_THEME.colors.appBgStart} 0%, ${EDU_THEME.colors.appBgEnd} 100%)`,
      padding: '24px 20px 28px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <div ref={headerRef} className="quest-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: 'clamp(13px, 2.2vw, 20px)',
          fontWeight: 800,
          color: EDU_THEME.colors.heading,
          letterSpacing: '2px',
        }}>
          THE MATH SCRIPT
        </div>
        <div className="quest-header-buttons" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onBackToMap} style={{
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
            🪙 {formatLocalizedNumber(session.coins, language)}
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
          <button onClick={handleToggleParentDashboard} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#00d4ff', background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px',
            padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }} className="mobile-secondary-btn">🔐 Parent</button>
          {subscription?.is_premium ? (
            <button
              type="button"
              aria-label="Open premium subscription options"
              style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
              color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.2)', borderRadius: '10px',
              padding: '8px 12px', cursor: 'pointer',
            }}
              className="mobile-secondary-btn"
              onClick={() => { setShowSubscription(!showSubscription); setShowShop(false); setShowParent(false) }}
            >
              ⭐ Premium
            </button>
          ) : (
            <button onClick={() => { onOpenPromo?.(); setShowShop(false); setShowParent(false) }} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none', borderRadius: '10px',
              padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 10px rgba(124,58,237,0.3)',
            }} className="mobile-primary-btn">🚀 Upgrade</button>
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
          </div>
          <button onClick={() => setShowContact(true)} style={{
            background: 'none', border: '1px solid rgba(124,58,237,0.35)',
            borderRadius: '6px', padding: '3px 10px',
            color: '#7c3aed', fontSize: '11px', fontWeight: 700,
            fontFamily: "'Rajdhani', sans-serif", letterSpacing: '1px',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Contact Us</button>
        </div>
      </div>

      <ContactPopup open={showContact} onClose={() => setShowContact(false)} />

      {showShop && (
        <Suspense fallback={<div style={{ color: '#94a3b8', marginBottom: '10px' }}>Loading shop...</div>}>
          <ShopPanel sessionId={sessionId} session={session} refreshSession={refreshSession} onClose={() => setShowShop(false)} />
        </Suspense>
      )}

      {showParent && (
        <Suspense fallback={<div style={{ color: '#94a3b8', marginBottom: '10px' }}>Loading parent dashboard...</div>}>
          <ParentDashboard sessionId={sessionId} session={session} onClose={() => setShowParent(false)} />
        </Suspense>
      )}

      {showSubscription && (
        <Suspense fallback={<div style={{ color: '#94a3b8', marginBottom: '10px' }}>Loading subscription...</div>}>
          <SubscriptionPanel
            sessionId={sessionId}
            subscription={subscription}
            onClose={() => setShowSubscription(false)}
            onRefresh={refreshSubscription}
          />
        </Suspense>
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

      <div className="quest-action-panel" style={{ marginBottom: '12px' }}>
        <div className="input-bar" style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <input
            type="text"
            value={mathInput}
            onChange={e => handleMathInputChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAttack()}
            placeholder={inputPlaceholder}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '14px 18px',
              fontSize: '16px',
              fontWeight: 500,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px',
              color: '#e8e8f0',
              outline: 'none',
              fontFamily: "'Rajdhani', sans-serif",
              transition: 'border-color 0.3s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,58,237,0.5)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            style={{ display: 'none' }}
          />
          <div className="input-bar-buttons" style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={photoAnalyzing || loading}
              className="mobile-secondary-btn"
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '15px',
                fontWeight: 700,
                color: '#fff',
                background: photoAnalyzing ? '#333' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                border: 'none',
                borderRadius: '12px',
                padding: '14px 18px',
                cursor: photoAnalyzing ? 'wait' : 'pointer',
                boxShadow: photoAnalyzing ? 'none' : '0 4px 15px rgba(37,99,235,0.3)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {photoAnalyzing ? 'Reading...' : '📷 Photo'}
            </button>
            <button
              onClick={handleAttack}
              disabled={loading || !selectedHero || !mathInput.trim()}
              className="mobile-primary-btn"
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#fff',
                background: loading ? '#333' : 'linear-gradient(135deg, #ef4444, #dc2626)',
                border: 'none',
                borderRadius: '12px',
                padding: '14px 28px',
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 15px rgba(220,38,38,0.3)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                letterSpacing: '1px',
              }}
            >
              {loading ? 'Casting...' : '⚔️ ATTACK!'}
            </button>
          </div>
        </div>

        {photoAnalyzing && (
          <div style={{
            textAlign: 'center',
            padding: '6px 0 2px',
            color: '#3b82f6',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
          }}>
            Analyzing your homework photo...
          </div>
        )}
      </div>

      {photoAnalyzing && (
        <div role="status" aria-live="polite" style={{
            textAlign: 'center',
            padding: '6px 0 2px',
            color: '#3b82f6',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
          }}>
            Analyzing your homework photo...
          </div>
        )}

      {loading && !showResult && (
        <div role="status" aria-live="polite" style={{
          textAlign: 'center',
          padding: '40px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '16px',
          fontWeight: 600,
          color: '#7c3aed',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⚔️</div>
          Hero is casting a story spell...
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <SuccessBurst active={showSuccessBurst} message="Nice solving! Story generated and progress saved." />

      {questFeedback && (
        <div role="status" aria-live="polite" style={{
          marginBottom: '12px',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(59,130,246,0.28)',
          background: 'rgba(59,130,246,0.08)',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          color: '#93c5fd',
          fontWeight: 600,
        }}>
          {questFeedback}
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
          <Suspense fallback={<div style={{ color: '#94a3b8' }}>Loading animated story...</div>}>
            <AnimatedScene hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={normalizedMathInput} prefetchedImages={prefetchedImages} mathSteps={mathSteps} miniGames={miniGames} session={session} onBonusCoins={() => refreshSession()} />
          </Suspense>
        </>
      )}
    </div>
  )
}
