import { useState, useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import HeroCard from '../components/HeroCard'
import AnimatedScene from '../components/AnimatedScene'
import ShopPanel from '../components/ShopPanel'
import ParentDashboard from '../components/ParentDashboard'
import { generateStory, getYoutubeUrl } from '../api/client'

const HEROES = ['Wizard', 'Goku', 'Ninja', 'Princess', 'Hulk', 'Spider-Man', 'Storm']

export default function Quest({ sessionId, session, selectedHero, setSelectedHero, refreshSession }) {
  const [mathInput, setMathInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [segments, setSegments] = useState([])
  const [showShop, setShowShop] = useState(false)
  const [showParent, setShowParent] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [coinAnim, setCoinAnim] = useState(false)
  const headerRef = useRef(null)

  useEffect(() => {
    gsap.from(headerRef.current, { y: -30, opacity: 0, duration: 0.5 })
  }, [])

  const handleAttack = async () => {
    if (!mathInput.trim() || !selectedHero) return
    setLoading(true)
    setSegments([])
    setShowResult(false)
    setShowShop(false)
    setShowParent(false)

    try {
      const result = await generateStory(selectedHero, mathInput, sessionId)
      setSegments(result.segments || [result.story])
      setShowResult(true)
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
      <div ref={headerRef} style={{
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
      <div style={{
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

      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
      }}>
        <input
          type="text"
          value={mathInput}
          onChange={e => setMathInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAttack()}
          placeholder="Enter a math problem (e.g. 12 x 8 or What is a fraction?)"
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
          <AnimatedScene hero={selectedHero} segments={segments} sessionId={sessionId} mathProblem={mathInput} />

          <div style={{ margin: '20px 0' }}>
            <a
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
