import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene from '../components/AnimatedScene'
import { unlockAudioForIOS } from '../utils/audioPlayer'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import SubscriptionPanel from '../components/SubscriptionPanel'
import { generateStoryStream, generateSegmentImagesBatch, analyzeMathPhoto, fetchSubscription } from '../api/client'

const HEROES = ['Arcanos', 'Blaze', 'Shadow', 'Luna', 'Titan', 'Webweaver', 'Volt', 'Tempest', 'Zenith']
const PREMIUM_HEROES = ['Blaze', 'Shadow', 'Webweaver', 'Volt']
const ZENITH_FREE_LIMIT = 2

export default function Quest({ sessionId, session, selectedHero, setSelectedHero, refreshSession }) {
  const [mathInput, setMathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [segments, setSegments] = useState([])
  const [storyKey, setStoryKey] = useState(0)
  const [mathSteps, setMathSteps] = useState([])
  const [miniGames, setMiniGames] = useState([])
  const [prefetchedImages, setPrefetchedImages] = useState(null)
  const [showShop, setShowShop] = useState(false)
  const [showParent, setShowParent] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [coinAnim, setCoinAnim] = useState(false)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const fileInputRef = useRef(null)
  const headerRef = useRef(null)
  const subscriptionRef = useRef(null)

  const openSubscription = () => {
    setShowSubscription(true)
    setShowShop(false)
    setShowParent(false)
    setTimeout(() => {
      if (subscriptionRef.current) {
        subscriptionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 50)
  }

  const refreshSubscription = () => {
    fetchSubscription(sessionId).then(s => setSubscription(s)).catch(() => {})
  }

  useEffect(() => {
    gsap.from(headerRef.current, { y: -30, opacity: 0, duration: 0.5 })
    refreshSubscription()

    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setTimeout(refreshSubscription, 2000)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

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

  const handleAttack = async () => {
    unlockAudioForIOS()
    if (!mathInput.trim() || !selectedHero) return

    if (!subscription?.is_premium && PREMIUM_HEROES.includes(selectedHero)) {
      setSelectedHero('')
      openSubscription()
      return
    }

    if (!subscription?.is_premium && selectedHero === 'Zenith' && (subscription?.zenith_uses || 0) >= ZENITH_FREE_LIMIT) {
      setSelectedHero('')
      openSubscription()
      return
    }

    if (subscription && !subscription.can_solve) {
      openSubscription()
      return
    }

    setSegments([])
    setMathSteps([])
    setMiniGames([])
    setPrefetchedImages(null)
    setShowShop(false)
    setShowParent(false)
    setShowSubscription(false)
    setStoryKey(prev => prev + 1)
    setStreaming(true)
    setShowResult(true)
    setLoading(false)

    let streamedSegments = []
    let streamDone = false
    try {
      await generateStoryStream(selectedHero, mathInput, sessionId, {
        onMiniGames: (games) => {
          setMiniGames(games)
        },
        onMathSteps: (steps) => {
          setMathSteps(steps)
        },
        onSegment: (index, text) => {
          while (streamedSegments.length <= index) streamedSegments.push('')
          streamedSegments[index] = text
          setSegments([...streamedSegments])
        },
        onDone: (data) => {
          streamDone = true
          setStreaming(false)
          if (streamedSegments.length > 0) {
            generateSegmentImagesBatch(selectedHero, streamedSegments, sessionId)
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
          }
          refreshSession()
          refreshSubscription()
          setCoinAnim(true)
          setTimeout(() => setCoinAnim(false), 2000)
        },
        onError: (detail) => {
          if (!streamDone) {
            setStreaming(false)
            setShowResult(false)
            setSegments([])
            alert(detail || 'Something went wrong. Try again!')
          }
        }
      })
    } catch (e) {
      setSegments([])
      setShowResult(false)
      setStreaming(false)
      if (e.message && (e.message.includes('Daily limit') || e.message.includes('Zenith'))) {
        refreshSubscription()
        openSubscription()
      } else {
        alert(e.message || 'Something went wrong. Try again!')
      }
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
      padding: '20px',
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
          background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          letterSpacing: '2px',
        }}>
          THE MATH SCRIPT
        </div>
        <div className="quest-header-buttons" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
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
          }}>🏪 Shop</button>
          <button onClick={() => { setShowParent(!showParent); setShowShop(false); setShowSubscription(false) }} style={{
            fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
            color: '#00d4ff', background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px',
            padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
            letterSpacing: '0.5px',
          }}>🔐 Parent</button>
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
            <button onClick={() => { setShowSubscription(!showSubscription); setShowShop(false); setShowParent(false) }} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none', borderRadius: '10px',
              padding: '8px 16px', cursor: 'pointer', transition: 'all 0.2s',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 10px rgba(124,58,237,0.3)',
            }}>🚀 Upgrade</button>
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
              : `You've completed all 3 free quests today! Start your 3-day free trial for unlimited adventures`}
          </div>
          {!subscription.can_solve && (
            <button onClick={() => openSubscription()} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '15px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              border: 'none', borderRadius: '10px', padding: '10px 22px',
              cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 4px 15px rgba(124,58,237,0.35)',
              transition: 'all 0.2s',
            }}>Try Premium Free</button>
          )}
        </div>
      )}

      {showShop && (
        <ShopPanel sessionId={sessionId} session={session} refreshSession={refreshSession} onClose={() => setShowShop(false)} isPremium={subscription?.is_premium} />
      )}

      {showParent && (
        <ParentDashboard sessionId={sessionId} session={session} onClose={() => setShowParent(false)} subscription={subscription} onUpgrade={() => { setShowParent(false); openSubscription() }} />
      )}

      {showSubscription && (
        <div ref={subscriptionRef}>
        <SubscriptionPanel
          sessionId={sessionId}
          subscription={subscription}
          onClose={() => setShowSubscription(false)}
          onRefresh={refreshSubscription}
        />
        </div>
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
        marginBottom: '24px',
      }}>
        {HEROES.map((name, i) => {
          const zenithExhausted = !subscription?.is_premium && name === 'Zenith' && (subscription?.zenith_uses || 0) >= ZENITH_FREE_LIMIT
          const zenithTrial = !subscription?.is_premium && name === 'Zenith' ? {
            remaining: Math.max(0, ZENITH_FREE_LIMIT - (subscription?.zenith_uses || 0)),
            limit: ZENITH_FREE_LIMIT,
            exhausted: zenithExhausted,
          } : null
          return (
          <HeroCard
            key={name}
            name={name}
            selected={selectedHero === name}
            onClick={() => { unlockAudioForIOS(); setSelectedHero(name) }}
            index={i}
            locked={!subscription?.is_premium && PREMIUM_HEROES.includes(name)}
            onLockedClick={() => openSubscription()}
            trialInfo={zenithTrial}
          />
          )
        })}
      </div>

      {!subscription?.is_premium && (
        <div
          onClick={() => openSubscription()}
          style={{
            marginBottom: '24px',
            padding: '16px 20px',
            background: 'rgba(124,58,237,0.05)',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            backgroundImage: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(0,212,255,0.05))',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: '24px' }}>🚀</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              color: '#a855f7',
              letterSpacing: '1px',
              marginBottom: '2px',
            }}>Try Premium Free for 3 Days</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '13px',
              fontWeight: 500,
              color: '#9ca3af',
            }}>Unlock all heroes, unlimited quests & voice narration</div>
          </div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            borderRadius: '8px',
            padding: '8px 16px',
            whiteSpace: 'nowrap',
          }}>Start Free Trial</div>
        </div>
      )}

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
          onChange={e => setMathInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAttack()}
          placeholder="Type a math problem or upload a photo..."
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
          padding: '12px',
          color: '#3b82f6',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          fontWeight: 600,
          marginBottom: '12px',
        }}>
          Analyzing your homework photo...
        </div>
      )}

      {showResult && streaming && segments.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '16px',
          fontWeight: 600,
          color: '#7c3aed',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⚔️</div>
          {selectedHero} is preparing for battle...
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {showResult && segments.length > 0 && (
        <>
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
          <AnimatedScene key={storyKey} hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={mathInput} prefetchedImages={prefetchedImages} mathSteps={mathSteps} miniGames={miniGames} session={session} onBonusCoins={(newTotal) => refreshSession()} streaming={streaming} isPremium={subscription?.is_premium} />
        </>
      )}

      {showResult && segments.length > 0 && !subscription?.is_premium && (
        <div style={{
          marginTop: '24px',
          padding: '20px 24px',
          background: 'rgba(124,58,237,0.06)',
          border: '1px solid rgba(124,58,237,0.15)',
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
          backdropFilter: 'blur(8px)',
        }}>
          <div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: '11px',
              fontWeight: 700,
              color: '#7c3aed',
              letterSpacing: '1.5px',
              marginBottom: '4px',
            }}>KEEP GOING</div>
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '15px',
              fontWeight: 600,
              color: '#d1d5db',
            }}>Enjoying the adventure? Get unlimited quests with Premium!</div>
          </div>
          <button onClick={() => openSubscription()} style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#fff',
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 22px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(124,58,237,0.3)',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
          }}>Try 3 Days Free</button>
        </div>
      )}

      <div style={{
        marginTop: '60px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: '24px',
        paddingBottom: '32px',
        display: 'flex',
        gap: '12px',
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setShowTerms(v => !v)}
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            color: '#9ca3af',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '10px 20px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ⚖️ Terms of Service
        </button>
        <button
          onClick={() => setShowPrivacy(v => !v)}
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            color: '#9ca3af',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '10px 20px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          🔒 Privacy Policy
        </button>
      </div>

      {showTerms && (
        <div style={{
          background: 'rgba(124,58,237,0.08)',
          border: '1px solid rgba(124,58,237,0.2)',
          borderRadius: '12px',
          padding: '24px 28px',
          marginBottom: '20px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          lineHeight: '1.8',
          color: '#d1d5db',
        }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#7c3aed', marginBottom: '16px', letterSpacing: '1px' }}>TERMS OF SERVICE</div>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>Last Updated: February 2026</p>

          <p style={{ marginBottom: '12px' }}><strong style={{ color: '#e8e8f0' }}>1. Acceptance of Terms</strong></p>
          <p>By accessing or using The Math Script ("the App"), you (the parent, guardian, or authorized school representative) agree to these Terms of Service on behalf of yourself and any child using the App. If you do not agree, please do not use the App.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>2. Description of Service</strong></p>
          <p>The Math Script is an AI-powered educational math app designed for children. It provides interactive story-based math explanations, mini-games, and progress tracking. AI-generated content is for educational purposes and should be verified by a parent, guardian, or teacher.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>3. Age Requirements</strong></p>
          <p>The App is designed for children ages 5-13. A parent or guardian must provide consent before a child uses the App. We comply with the Children's Online Privacy Protection Act (COPPA).</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>4. Subscriptions & Billing</strong></p>
          <p>Free Tier: 6 math problems per day at no cost. Premium: $9.99/month or $79.99/year with a 3-day free trial. Premium provides unlimited problems. Subscriptions auto-renew unless cancelled before the renewal date. No partial refunds are provided for unused portions of a billing period. You may cancel anytime through the Stripe customer portal.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>5. Intellectual Property</strong></p>
          <p>All content, characters, stories, code, and visual assets in The Math Script are the exclusive property of The Math Script and its creators. You may not copy, reproduce, distribute, reverse-engineer, scrape, or create derivative works from any part of the App without prior written permission.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>6. AI-Generated Content</strong></p>
          <p>The App uses artificial intelligence to generate story explanations, illustrations, and voice narration. While we strive for accuracy, AI-generated content may occasionally contain errors. Parents and educators should verify math solutions independently. We are not liable for decisions made based on AI-generated content.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>7. Acceptable Use</strong></p>
          <p>You agree not to: (a) use the App for any unlawful purpose, (b) attempt to gain unauthorized access to our systems, (c) use bots or automated tools to interact with the App, (d) submit inappropriate or harmful content through the math input field, or (e) interfere with other users' experience.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>8. Account Termination</strong></p>
          <p>We reserve the right to suspend or terminate accounts that violate these Terms. You may delete your account at any time by contacting support. Upon deletion, all associated data will be permanently removed within 30 days.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>9. Limitation of Liability</strong></p>
          <p>The App is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the App. Our total liability shall not exceed the amount you have paid us in the preceding 12 months.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>10. Changes to Terms</strong></p>
          <p>We may update these Terms from time to time. Material changes will be communicated via the App or email at least 30 days before they take effect. Continued use after changes constitutes acceptance of the updated Terms.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>11. Contact</strong></p>
          <p>For questions about these Terms, contact us at: <span style={{ color: '#7c3aed' }}>support@themathscript.com</span></p>
        </div>
      )}

      {showPrivacy && (
        <div style={{
          background: 'rgba(0,212,255,0.06)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: '12px',
          padding: '24px 28px',
          marginBottom: '20px',
          fontFamily: "'Rajdhani', sans-serif",
          fontSize: '14px',
          lineHeight: '1.8',
          color: '#d1d5db',
        }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#00d4ff', marginBottom: '16px', letterSpacing: '1px' }}>PRIVACY POLICY</div>
          <p style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>Last Updated: February 2026 | COPPA Compliant</p>

          <p style={{ marginBottom: '12px' }}><strong style={{ color: '#e8e8f0' }}>1. Introduction</strong></p>
          <p>The Math Script ("we," "us," "our") is committed to protecting children's privacy. This Privacy Policy explains how we collect, use, and safeguard information from children under 13 and their parents/guardians, in full compliance with the Children's Online Privacy Protection Act (COPPA).</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>2. Information We Collect</strong></p>
          <p><strong style={{ color: '#c4b5fd' }}>From Children:</strong> Math problems submitted, learning progress and scores, in-app purchases (gold coins, items), and session activity for progress tracking. We do NOT collect names, email addresses, photos, precise location, or any other personal information from children.</p>
          <p style={{ marginTop: '8px' }}><strong style={{ color: '#c4b5fd' }}>From Parents/Guardians:</strong> Payment information (processed securely through Stripe — we never store card details), and subscription preferences.</p>
          <p style={{ marginTop: '8px' }}><strong style={{ color: '#c4b5fd' }}>Automatically Collected:</strong> Anonymous device type and browser information for technical support, and anonymous usage analytics to improve the App. We do NOT use persistent identifiers to track children across apps or websites.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>3. How We Use Information</strong></p>
          <p>We use collected information solely to: provide personalized math story explanations, track learning progress in the Parent Command Center, enable the in-app reward and shop system, process subscription payments, and improve app performance and fix technical issues. We do NOT use children's data for advertising, marketing, behavioral profiling, or AI model training.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>4. Information Sharing</strong></p>
          <p>We never sell, rent, or trade children's personal information. We only share data with: Stripe (payment processing, under strict data protection agreements), cloud hosting providers (to operate the App), and law enforcement (only when required by law or to protect safety). All third-party service providers are contractually bound to protect user data and maintain COPPA compliance.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>5. Data Retention & Deletion</strong></p>
          <p>We retain children's progress data only as long as the account is active. Inactive accounts are automatically purged after 12 months of inactivity. You may request immediate deletion of all data at any time by contacting us. Deletion requests are processed within 30 days, after which data is permanently and irreversibly removed.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>6. Parental Rights</strong></p>
          <p>Parents and guardians have the right to: review their child's information via the Parent Command Center, request complete deletion of their child's data, refuse further collection of information, and withdraw consent at any time. To exercise these rights, contact us at the email below. We will respond within 10 business days.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>7. Security Measures</strong></p>
          <p>We implement industry-standard security practices including: encrypted data transmission (SSL/TLS), HMAC-signed session identifiers, rate limiting and IP-based abuse prevention, input validation and sanitization, Content Security Policy headers, and regular security audits. While no system is 100% secure, we take every reasonable precaution to protect your data.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>8. Third-Party Services</strong></p>
          <p>The App uses the following third-party services: OpenAI (AI story generation — no children's data is stored or used for training), Google Gemini (AI image generation — no children's data is retained), ElevenLabs (voice narration — no children's data is stored), and Stripe (payment processing — PCI-DSS compliant). We do not use behavioral advertising networks, social media tracking plugins, or analytics services that profile children.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>9. Changes to This Policy</strong></p>
          <p>We will notify parents of material changes to this Privacy Policy via in-app notice at least 30 days before changes take effect. The "Last Updated" date at the top will always reflect the most recent revision.</p>

          <p style={{ marginBottom: '12px', marginTop: '16px' }}><strong style={{ color: '#e8e8f0' }}>10. Contact Us</strong></p>
          <p>For privacy questions, data requests, or concerns:<br/>
          <span style={{ color: '#00d4ff' }}>support@themathscript.com</span></p>
        </div>
      )}
    </div>
  )
}
