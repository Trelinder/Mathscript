import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { generateSegmentImage } from '../api/client'

const HERO_SPRITES = {
  Wizard: { emoji: '🧙‍♂️', color: '#7B1FA2', particles: ['✨','⭐','🔮','💫','🌟'], action: 'casting a spell', moves: 'spell' },
  Goku: { emoji: '💥', color: '#FF6F00', particles: ['⚡','💥','🔥','💪','✊'], action: 'powering up', moves: 'punch' },
  Ninja: { emoji: '🥷', color: '#37474F', particles: ['💨','🌀','⚔️','🌙','💫'], action: 'throwing stars', moves: 'dash' },
  Princess: { emoji: '👑', color: '#E91E63', particles: ['👑','💎','🦋','🌸','✨'], action: 'casting royal magic', moves: 'magic' },
  Hulk: { emoji: '💪', color: '#2E7D32', particles: ['💥','💪','🪨','⚡','🔥'], action: 'smashing', moves: 'smash' },
  'Spider-Man': { emoji: '🕷️', color: '#D32F2F', particles: ['🕸️','🕷️','💫','⚡','🌀'], action: 'slinging webs', moves: 'swing' },
}

const SEGMENT_LABELS = ['The Challenge Appears...', 'Hero Powers Activate!', 'The Battle Rages On!', 'Victory!']

function StorySegment({ text, image, imageStatus, index, isActive, isRevealed, sprite, hero }) {
  const segRef = useRef(null)
  const imgRef = useRef(null)
  const textRef = useRef(null)
  const [displayedText, setDisplayedText] = useState('')
  const [typingDone, setTypingDone] = useState(false)

  useEffect(() => {
    if (!isActive || !text) return
    setDisplayedText('')
    setTypingDone(false)

    const el = segRef.current
    gsap.fromTo(el, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power2.out' })

    let idx = 0
    const chars = text.split('')
    let accum = ''
    const typeInterval = setInterval(() => {
      if (idx < chars.length) {
        const batch = Math.min(2, chars.length - idx)
        accum += chars.slice(idx, idx + batch).join('')
        setDisplayedText(accum)
        idx += batch
      } else {
        clearInterval(typeInterval)
        setTypingDone(true)
      }
    }, 25)

    return () => clearInterval(typeInterval)
  }, [isActive, text])

  useEffect(() => {
    if (image && imgRef.current) {
      gsap.fromTo(imgRef.current,
        { opacity: 0, scale: 0.8, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: 'back.out(1.4)' }
      )
    }
  }, [image])

  if (!isRevealed) return null

  const label = SEGMENT_LABELS[index] || `Part ${index + 1}`

  return (
    <div ref={segRef} style={{
      marginBottom: '24px',
      opacity: isActive ? 1 : 0.7,
    }}>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 'clamp(9px, 1.2vw, 12px)',
        color: sprite.color,
        marginBottom: '10px',
        textShadow: `0 0 8px ${sprite.color}66`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: `${sprite.color}33`, border: `2px solid ${sprite.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: '#fff', flexShrink: 0,
        }}>{index + 1}</span>
        {label}
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
        flexDirection: index % 2 === 0 ? 'row' : 'row-reverse',
        flexWrap: 'wrap',
      }}>
        <div style={{
          flex: '1 1 300px',
          fontFamily: "'Inter', sans-serif",
          fontSize: '16px',
          lineHeight: '1.9',
          color: '#e0e0e0',
          padding: '16px 20px',
          background: 'rgba(26,26,46,0.85)',
          borderRadius: '12px',
          borderLeft: `4px solid ${sprite.color}`,
          backdropFilter: 'blur(4px)',
          minHeight: '80px',
        }}>
          <div ref={textRef} style={{ whiteSpace: 'pre-wrap' }}>
            {isActive ? displayedText : text}
            {isActive && !typingDone && (
              <span style={{
                display: 'inline-block', width: '2px', height: '18px',
                background: sprite.color, marginLeft: '2px', verticalAlign: 'text-bottom',
                animation: 'blink 0.7s step-end infinite',
              }} />
            )}
          </div>
        </div>

        <div ref={imgRef} style={{
          flex: '0 0 auto',
          width: 'clamp(160px, 30vw, 240px)',
          aspectRatio: '1',
          borderRadius: '14px',
          overflow: 'hidden',
          border: `3px solid ${sprite.color}55`,
          background: `linear-gradient(135deg, ${sprite.color}11, ${sprite.color}22)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {image ? (
            <img
              src={`data:${image.mime};base64,${image.image}`}
              alt={`Story scene ${index + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : imageStatus === 'failed' ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>{sprite.emoji}</div>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px', color: sprite.color, opacity: 0.5,
              }}>Imagine this!</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px', animation: 'pulse 1.5s ease-in-out infinite' }}>
                {sprite.emoji}
              </div>
              <div style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '8px', color: sprite.color, opacity: 0.6,
              }}>Drawing...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AnimatedScene({ hero, segments, sessionId, onComplete }) {
  const sceneRef = useRef(null)
  const heroRef = useRef(null)
  const particleContainerRef = useRef(null)
  const actionRef = useRef(null)
  const [activeSegment, setActiveSegment] = useState(0)
  const [revealedSegments, setRevealedSegments] = useState([0])
  const [segmentImages, setSegmentImages] = useState({})
  const [allDone, setAllDone] = useState(false)
  const sprite = HERO_SPRITES[hero] || HERO_SPRITES.Wizard

  const storySegments = segments || []

  useEffect(() => {
    if (!storySegments.length) return

    const tl = gsap.timeline()
    const heroEl = heroRef.current
    const actionEl = actionRef.current

    tl.fromTo(heroEl, { y: -150, scale: 0, opacity: 0, rotation: -180 },
      { y: 0, scale: 1, opacity: 1, rotation: 0, duration: 1, ease: 'back.out(1.7)' })
    .to(heroEl, { scale: 1.3, duration: 0.2, ease: 'power2.in' })
    .to(heroEl, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.3)' })

    tl.fromTo(actionEl, { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.2')

    if (sprite.moves === 'punch') {
      tl.to(heroEl, { x: 100, duration: 0.3, ease: 'power3.in' })
        .to(heroEl, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' })
    } else if (sprite.moves === 'dash') {
      tl.to(heroEl, { x: 150, opacity: 0.3, duration: 0.2, ease: 'power4.in' })
        .to(heroEl, { x: -150, duration: 0.01 })
        .to(heroEl, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' })
    } else if (sprite.moves === 'smash') {
      tl.to(heroEl, { y: -60, duration: 0.4, ease: 'power2.out' })
        .to(heroEl, { y: 10, duration: 0.15, ease: 'power4.in' })
        .to(heroEl, { y: 0, duration: 0.3, ease: 'bounce.out' })
    } else if (sprite.moves === 'swing') {
      tl.to(heroEl, { x: 80, y: -40, rotation: 20, duration: 0.4, ease: 'power2.inOut' })
        .to(heroEl, { x: -80, y: -20, rotation: -20, duration: 0.5, ease: 'power2.inOut' })
        .to(heroEl, { x: 0, y: 0, rotation: 0, duration: 0.4, ease: 'power2.out' })
    } else if (sprite.moves === 'magic') {
      tl.to(heroEl, { rotation: 360, scale: 1.2, duration: 0.8, ease: 'power2.inOut' })
        .to(heroEl, { rotation: 720, scale: 1, duration: 0.5, ease: 'power2.out' })
    } else {
      tl.to(heroEl, { y: -30, duration: 0.4, ease: 'power2.out' })
        .to(heroEl, { y: 0, duration: 0.3, ease: 'bounce.out' })
    }

    gsap.to(heroEl, { y: '+=12', duration: 2, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2 })
    gsap.to(heroEl, { rotation: 5, duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2 })

    const container = particleContainerRef.current
    let particleTimer
    const spawnParticle = () => {
      const p = document.createElement('div')
      p.textContent = sprite.particles[Math.floor(Math.random() * sprite.particles.length)]
      p.style.cssText = `position:absolute;font-size:${20 + Math.random() * 28}px;pointer-events:none;`
      const startX = Math.random() * container.offsetWidth
      const startY = Math.random() * container.offsetHeight * 0.5 + container.offsetHeight * 0.25
      container.appendChild(p)
      gsap.fromTo(p,
        { x: startX, y: startY, opacity: 1, scale: 0 },
        { y: startY - 80 - Math.random() * 120, x: startX + (Math.random() - 0.5) * 200,
          opacity: 0, scale: 1.5, rotation: Math.random() * 360,
          duration: 1.5 + Math.random() * 1.5, ease: 'power2.out',
          onComplete: () => p.remove() }
      )
    }
    particleTimer = setInterval(spawnParticle, 300)
    setTimeout(() => { clearInterval(particleTimer); particleTimer = setInterval(spawnParticle, 2000) }, 3000)

    return () => { tl.kill(); gsap.killTweensOf(heroEl); clearInterval(particleTimer) }
  }, [hero, storySegments.length])

  useEffect(() => {
    if (storySegments.length === 0) return
    storySegments.forEach((seg, idx) => {
      if (!seg || segmentImages[idx] !== undefined) return
      setSegmentImages(prev => ({ ...prev, [idx]: 'loading' }))
      generateSegmentImage(hero, seg, idx, sessionId)
        .then(img => {
          if (img && img.image) {
            setSegmentImages(prev => ({ ...prev, [idx]: img }))
          } else {
            setSegmentImages(prev => ({ ...prev, [idx]: 'failed' }))
          }
        })
        .catch(() => {
          setSegmentImages(prev => ({ ...prev, [idx]: 'failed' }))
        })
    })
  }, [storySegments])

  const handleNextSegment = () => {
    const next = activeSegment + 1
    if (next < storySegments.length) {
      setActiveSegment(next)
      setRevealedSegments(prev => [...new Set([...prev, next])])
      const sceneEl = sceneRef.current
      if (sceneEl) {
        setTimeout(() => {
          sceneEl.scrollTo({ top: sceneEl.scrollHeight, behavior: 'smooth' })
        }, 100)
      }
    } else {
      setAllDone(true)
      if (onComplete) onComplete()
    }
  }

  if (!storySegments.length) return null

  return (
    <div ref={sceneRef} style={{
      background: `linear-gradient(135deg, ${sprite.color}15, ${sprite.color}30)`,
      border: `3px solid ${sprite.color}`,
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
      position: 'relative',
      overflow: 'auto',
      maxHeight: '80vh',
    }}>
      <div ref={particleContainerRef} style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1, overflow: 'hidden',
      }} />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginBottom: '16px' }}>
        <div ref={heroRef} style={{
          fontSize: '72px', display: 'inline-block', willChange: 'transform',
          filter: `drop-shadow(0 0 20px ${sprite.color}88)`,
        }}>
          {sprite.emoji}
        </div>
      </div>

      <div ref={actionRef} style={{
        textAlign: 'center',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 'clamp(10px, 1.5vw, 14px)',
        color: sprite.color,
        margin: '8px 0 20px',
        textShadow: `0 0 10px ${sprite.color}88`,
        position: 'relative', zIndex: 2, opacity: 0,
      }}>
        {hero} is {sprite.action}!
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px',
        }}>
          {storySegments.map((_, i) => (
            <div key={i} style={{
              width: `${100 / storySegments.length}%`,
              maxWidth: '120px',
              height: '6px',
              borderRadius: '3px',
              background: i <= activeSegment ? sprite.color : `${sprite.color}33`,
              transition: 'background 0.4s ease',
            }} />
          ))}
        </div>

        {storySegments.map((seg, i) => {
          const imgData = segmentImages[i]
          const imageObj = (imgData && typeof imgData === 'object') ? imgData : null
          const status = imgData === 'failed' ? 'failed' : imgData === 'loading' ? 'loading' : imgData === undefined ? 'pending' : 'done'
          return (
            <StorySegment
              key={i}
              text={seg}
              image={imageObj}
              imageStatus={status}
              index={i}
              isActive={i === activeSegment}
              isRevealed={revealedSegments.includes(i)}
              sprite={sprite}
              hero={hero}
            />
          )
        })}

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {!allDone ? (
            <button
              onClick={handleNextSegment}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '12px',
                color: '#fff',
                background: `linear-gradient(180deg, ${sprite.color}, ${sprite.color}cc)`,
                border: `3px solid ${sprite.color}88`,
                borderRadius: '10px',
                padding: '14px 32px',
                cursor: 'pointer',
                boxShadow: `0 4px 0 ${sprite.color}88`,
                transition: 'all 0.2s',
              }}
            >
              {activeSegment < storySegments.length - 1 ? '▶ Next Part' : '🏆 Finish!'}
            </button>
          ) : (
            <div style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '14px',
              color: '#ffd700',
              textShadow: '0 0 15px rgba(255,215,0,0.5)',
              padding: '12px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              🎉 Quest Complete! +50 Gold! 🎉
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>
    </div>
  )
}
