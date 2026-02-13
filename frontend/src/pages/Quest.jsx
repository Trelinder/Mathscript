import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene from '../components/AnimatedScene'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import SubscriptionPanel from '../components/SubscriptionPanel'
import { generateStory, generateSegmentImagesBatch, analyzeMathPhoto, fetchSubscription } from '../api/client'

const HEROES = ['Arcanos', 'Blaze', 'Shadow', 'Luna', 'Titan', 'Webweaver', 'Volt', 'Tempest']

export default function Quest({ sessionId, session, selectedHero, setSelectedHero, refreshSession }) {
  const [mathInput, setMathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState([])
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
  const fileInputRef = useRef(null)
  const headerRef = useRef(null)

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
    if (!mathInput.trim() || !selectedHero) return

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

    try {
      const result = await generateStory(selectedHero, mathInput, sessionId)
      const segs = result.segments || [result.story]
      setSegments(segs)
      setMathSteps(result.math_steps || [])
      setMiniGames(result.mini_games || [])
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
    } catch (e) {
      setSegments([])
      setShowResult(false)
      if (e.message && e.message.includes('Daily limit')) {
        refreshSubscription()
        setShowSubscription(true)
      } else {
        alert(e.message || 'Something went wrong. Try again!')
      }
    }
    setLoading(false)
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
              : `Daily limit reached! Upgrade to Premium for unlimited quests`}
          </div>
          {!subscription.can_solve && (
            <button onClick={() => setShowSubscription(true)} style={{
              fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700,
              color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              border: 'none', borderRadius: '8px', padding: '6px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Upgrade</button>
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
        marginBottom: '24px',
      }}>
        {HEROES.map((name, i) => (
          <HeroCard
            key={name}
            name={name}
            selected={selectedHero === name}
            onClick={() => setSelectedHero(name)}
            index={i}
          />
        ))}
      </div>

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
          <AnimatedScene hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={mathInput} prefetchedImages={prefetchedImages} mathSteps={mathSteps} miniGames={miniGames} session={session} onBonusCoins={(newTotal) => refreshSession()} />
        </>
      )}
    </div>
  )
}
