import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene from '../components/AnimatedScene'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import { generateStory, generateSegmentImagesBatch, getYoutubeUrl, analyzeMathPhoto } from '../api/client'

const HEROES = ['Wizard', 'Goku', 'Ninja', 'Princess', 'Hulk', 'Spider-Man', 'Miles Morales', 'Storm']

export default function Quest({ sessionId, session, selectedHero, setSelectedHero, refreshSession }) {
  const [mathInput, setMathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState([])
  const [mathSteps, setMathSteps] = useState([])
  const [prefetchedImages, setPrefetchedImages] = useState(null)
  const [showShop, setShowShop] = useState(false)
  const [showParent, setShowParent] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [coinAnim, setCoinAnim] = useState(false)
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false)
  const fileInputRef = useRef(null)
  const headerRef = useRef(null)

  useEffect(() => {
    gsap.from(headerRef.current, { y: -30, opacity: 0, duration: 0.5 })
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
    setLoading(true)
    setSegments([])
    setMathSteps([])
    setPrefetchedImages(null)
    setShowResult(false)
    setShowShop(false)
    setShowParent(false)

    try {
      const result = await generateStory(selectedHero, mathInput, sessionId)
      const segs = result.segments || [result.story]
      setSegments(segs)
      setMathSteps(result.math_steps || [])
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

      setCoinAnim(true)
      setTimeout(() => setCoinAnim(false), 2000)
    } catch (e) {
      setSegments([])
      setShowResult(false)
      alert(e.message || 'Something went wrong. Try again!')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
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
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 'clamp(12px, 2vw, 18px)',
          color: '#4ecca3',
          textShadow: '0 0 10px rgba(78,204,163,0.5)',
        }}>
          THE MATH SCRIPT
        </div>
        <div className="quest-header-buttons" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '12px',
            color: '#ffd700',
            background: 'rgba(255,215,0,0.1)',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '2px solid rgba(255,215,0,0.3)',
            transition: 'all 0.3s',
            transform: coinAnim ? 'scale(1.3)' : 'scale(1)',
          }}>
            🪙 {session.coins}
          </div>
          {session.inventory?.length > 0 && (
            <div style={{
              fontSize: '11px',
              color: '#aaa',
              background: 'rgba(255,255,255,0.05)',
              padding: '8px 12px',
              borderRadius: '8px',
            }}>
              🎒 {session.inventory.join(', ')}
            </div>
          )}
          <button onClick={() => { setShowShop(!showShop); setShowParent(false) }} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
            color: '#f0e68c', background: 'rgba(240,230,140,0.1)',
            border: '2px solid rgba(240,230,140,0.3)', borderRadius: '8px',
            padding: '8px 14px', cursor: 'pointer',
          }}>🏪 Shop</button>
          <button onClick={() => { setShowParent(!showParent); setShowShop(false) }} style={{
            fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
            color: '#4ecca3', background: 'rgba(78,204,163,0.1)',
            border: '2px solid rgba(78,204,163,0.3)', borderRadius: '8px',
            padding: '8px 14px', cursor: 'pointer',
          }}>🔐 Parent</button>
        </div>
      </div>

      {showShop && (
        <ShopPanel sessionId={sessionId} session={session} refreshSession={refreshSession} onClose={() => setShowShop(false)} />
      )}

      {showParent && (
        <ParentDashboard sessionId={sessionId} session={session} onClose={() => setShowParent(false)} />
      )}

      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '12px',
        color: '#e94560',
        marginBottom: '16px',
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
            background: 'rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.15)',
            borderRadius: '10px',
            color: '#eee',
            outline: 'none',
            fontFamily: "'Inter', sans-serif",
          }}
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
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '11px',
              color: '#fff',
              background: photoAnalyzing ? '#555' : 'linear-gradient(180deg, #3498db, #2980b9)',
              border: photoAnalyzing ? '3px solid #444' : '3px solid #1a6da0',
              borderRadius: '10px',
              padding: '14px 16px',
              cursor: photoAnalyzing ? 'wait' : 'pointer',
              boxShadow: photoAnalyzing ? 'none' : '0 4px 0 #1a6da0',
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
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '12px',
              color: '#fff',
              background: loading ? '#555' : 'linear-gradient(180deg, #e94560, #c0392b)',
              border: loading ? '3px solid #444' : '3px solid #922b3e',
              borderRadius: '10px',
              padding: '14px 28px',
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: loading ? 'none' : '0 4px 0 #922b3e',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Casting...' : '⚔️ Attack!'}
          </button>
        </div>
      </div>

      {photoAnalyzing && (
        <div style={{
          textAlign: 'center',
          padding: '12px',
          color: '#3498db',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '10px',
          marginBottom: '12px',
        }}>
          Analyzing your homework photo...
        </div>
      )}

      {loading && !showResult && (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: '12px',
          color: '#4ecca3',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 1s linear infinite' }}>⚔️</div>
          Hero is casting a story spell...
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {showResult && segments.length > 0 && (
        <>
          <div style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '14px',
            color: '#4ecca3',
            marginBottom: '8px',
          }}>
            The Victory Story
          </div>
          <AnimatedScene hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={mathInput} prefetchedImages={prefetchedImages} mathSteps={mathSteps} />

          <div style={{ margin: '20px 0' }}>
            <a
              className="youtube-btn"
              href={getYoutubeUrl(mathInput)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '11px',
                color: '#fff',
                background: 'linear-gradient(180deg, #FF0000, #CC0000)',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
                border: '3px solid #990000',
                boxShadow: '0 3px 0 #990000',
              }}
            >
              ▶ Watch Math Videos
            </a>
          </div>
        </>
      )}
    </div>
  )
}
