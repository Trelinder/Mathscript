import { useEffect, useRef, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { generateSegmentImagesBatch, generateTTS, fetchTTSVoices, addBonusCoins } from '../api/client'
import MathPaper from './MathPaper'
import MiniGame from './MiniGame'

let sharedAudioEl = null
let currentBlobUrl = null
let audioUnlocked = false

function getAudioElement() {
  if (!sharedAudioEl) {
    sharedAudioEl = new Audio()
    sharedAudioEl.setAttribute('playsinline', '')
    sharedAudioEl.setAttribute('webkit-playsinline', '')
  }
  return sharedAudioEl
}

export const unlockAudioForIOS = () => {
  unlockAudio()
}

const unlockAudio = () => {
  if (audioUnlocked) return
  const el = getAudioElement()
  const silentWav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
  el.src = silentWav
  el.volume = 0.01
  const p = el.play()
  if (p && p.then) {
    p.then(() => {
      audioUnlocked = true
      el.volume = 1.0
    }).catch(() => {})
  }
}

async function playBase64Audio(base64Data, mimeType) {
  const el = getAudioElement()

  stopCurrentAudio()

  const raw = atob(base64Data)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i)
  }

  const blob = new Blob([arr], { type: mimeType || 'audio/mpeg' })
  const url = URL.createObjectURL(blob)

  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
  }
  currentBlobUrl = url

  el.src = url
  el.volume = 1.0
  try {
    await el.play()
  } catch (e) {
    console.warn('Audio play blocked:', e.message)
  }
  return el
}

function stopCurrentAudio() {
  const el = getAudioElement()
  if (!el.paused) {
    el.pause()
    el.currentTime = 0
  }
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
}

const HERO_SPRITES = {
  Arcanos: { emoji: '🧙‍♂️', color: '#a855f7', particles: ['✨','⭐','🔮','💫','🌟'], action: 'casting a spell', moves: 'spell', img: '/images/hero-arcanos.png' },
  Blaze: { emoji: '🔥', color: '#f97316', particles: ['🔥','💥','⚡','💪','✊'], action: 'powering up', moves: 'punch', img: '/images/hero-blaze.png' },
  Shadow: { emoji: '🥷', color: '#64748b', particles: ['💨','🌀','⚔️','🌙','💫'], action: 'throwing stars', moves: 'dash', img: '/images/hero-shadow.png' },
  Luna: { emoji: '🌙', color: '#ec4899', particles: ['🌙','💎','🦋','🌸','✨'], action: 'casting lunar magic', moves: 'magic', img: '/images/hero-luna.png' },
  Titan: { emoji: '💪', color: '#22c55e', particles: ['💥','💪','🪨','⚡','🔥'], action: 'smashing', moves: 'smash', img: '/images/hero-titan.png' },
  Webweaver: { emoji: '🕸️', color: '#ef4444', particles: ['🕸️','💫','⚡','🌀','✨'], action: 'slinging webs', moves: 'swing', img: '/images/hero-webweaver.png' },
  Volt: { emoji: '⚡', color: '#dc2626', particles: ['⚡','💥','🕸️','✨','🌀'], action: 'charging a venom blast', moves: 'venom', img: '/images/hero-volt.png' },
  Tempest: { emoji: '🌪️', color: '#3b82f6', particles: ['⚡','🌩️','💨','🌪️','✨'], action: 'summoning a storm', moves: 'storm', img: '/images/hero-tempest.png' },
}

const SEGMENT_LABELS = ['The Challenge Appears...', 'Hero Powers Activate!', 'The Battle Rages On!', 'Victory!']

function StorySegment({ text, image, imageStatus, index, isActive, isRevealed, sprite, hero, mathSteps, totalSegments }) {
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
        accum += chars[idx]
        setDisplayedText(accum)
        idx += 1
      } else {
        clearInterval(typeInterval)
        setTypingDone(true)
      }
    }, 50)

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
    <div ref={segRef} data-segment={index} style={{
      marginBottom: '24px',
      opacity: isActive ? 1 : 0.7,
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 'clamp(10px, 1.3vw, 13px)',
        fontWeight: 600,
        color: sprite.color,
        marginBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        letterSpacing: '1px',
      }}>
        <span style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: `${sprite.color}22`, border: `1px solid ${sprite.color}88`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>{index + 1}</span>
        {label}
      </div>

      <div className={`story-segment-layout ${index % 2 === 0 ? 'story-seg-even' : 'story-seg-odd'}`} style={{
        display: 'flex',
        gap: '16px',
        alignItems: 'flex-start',
      }}>
        <div className="story-text-block" style={{
          flex: '1 1 auto',
          minWidth: 0,
          fontFamily: "'Rajdhani', 'Inter', sans-serif",
          fontSize: '17px',
          fontWeight: 500,
          lineHeight: '1.9',
          color: '#d0d0e0',
          padding: '16px 20px',
          background: 'rgba(17,24,39,0.85)',
          borderRadius: '12px',
          borderLeft: `3px solid ${sprite.color}`,
          backdropFilter: 'blur(8px)',
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
          {mathSteps && mathSteps.length > 0 && isRevealed && index === (totalSegments || 4) - 1 && (
            <MathPaper
              steps={mathSteps}
              activeStep={(() => {
                const segs = totalSegments || 4
                const solvingOnly = mathSteps.filter(s => !s.toLowerCase().startsWith('answer:'))
                const stepsPerSeg = Math.max(1, Math.ceil(solvingOnly.length / segs))
                return Math.min((index + 1) * stepsPerSeg, solvingOnly.length) - 1
              })()}
              color={sprite.color}
              isFinalSegment={index === (totalSegments || 4) - 1}
            />
          )}
        </div>

        <div ref={imgRef} className="story-image-container" style={{
          borderRadius: '14px',
          overflow: 'hidden',
          border: `3px solid ${sprite.color}55`,
          background: `linear-gradient(135deg, ${sprite.color}11, ${sprite.color}22)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {image ? (
            <img
              src={`data:${image.mime};base64,${image.image}`}
              alt={`Story scene ${index + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : imageStatus === 'failed' ? (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <img
                src={sprite.img}
                alt={hero}
                style={{
                  width: '64px', height: '64px', objectFit: 'contain',
                  borderRadius: '50%', border: `2px solid ${sprite.color}44`,
                  marginBottom: '8px',
                }}
              />
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '12px', fontWeight: 600, color: sprite.color, opacity: 0.5,
              }}>Imagine this!</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px' }}>
              <img
                src={sprite.img}
                alt={hero}
                style={{
                  width: '48px', height: '48px', objectFit: 'contain',
                  borderRadius: '50%', border: `2px solid ${sprite.color}44`,
                  marginBottom: '8px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '12px', fontWeight: 600, color: sprite.color, opacity: 0.6,
              }}>Drawing...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AnimatedScene({ hero, segments, sessionId, mathProblem, onComplete, prefetchedImages, mathSteps, miniGames, onBonusCoins }) {
  const sceneRef = useRef(null)
  const heroRef = useRef(null)
  const particleContainerRef = useRef(null)
  const actionRef = useRef(null)
  const [activeSegment, setActiveSegment] = useState(0)
  const [revealedSegments, setRevealedSegments] = useState([0])
  const [segmentImages, setSegmentImages] = useState({})
  const [allDone, setAllDone] = useState(false)
  const [narrationPlaying, setNarrationPlaying] = useState(false)
  const [narrationLoading, setNarrationLoading] = useState(false)
  const [narrationOn, setNarrationOn] = useState(false)
  const narrationOnRef = useRef(false)
  const [storyVoiceId, setStoryVoiceId] = useState(null)
  const [showMiniGame, setShowMiniGame] = useState(false)
  const [currentMiniGameIdx, setCurrentMiniGameIdx] = useState(0)
  const [completedMiniGames, setCompletedMiniGames] = useState({})
  const [totalBonusCoins, setTotalBonusCoins] = useState(0)
  const sprite = HERO_SPRITES[hero] || HERO_SPRITES.Arcanos

  const storySegments = segments || []
  const games = miniGames || []

  useEffect(() => {
    if (!storySegments.length) return
    fetchTTSVoices().then(voices => {
      if (voices.length > 0) {
        setStoryVoiceId(voices[Math.floor(Math.random() * voices.length)])
      }
    }).catch(() => {})
  }, [storySegments.length])

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
    } else if (sprite.moves === 'venom') {
      tl.to(heroEl, { x: 60, duration: 0.2, ease: 'power3.in' })
        .to(heroEl, { scale: 1.4, duration: 0.15, ease: 'power4.in' })
        .to(heroEl, { x: -40, scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' })
        .to(heroEl, { x: 0, duration: 0.3, ease: 'power2.out' })
    } else if (sprite.moves === 'storm') {
      tl.to(heroEl, { y: -50, scale: 1.3, duration: 0.5, ease: 'power2.out' })
        .to(heroEl, { x: -30, duration: 0.15, ease: 'power4.in' })
        .to(heroEl, { x: 30, duration: 0.15, ease: 'power4.in' })
        .to(heroEl, { x: -20, duration: 0.1, ease: 'power4.in' })
        .to(heroEl, { x: 20, duration: 0.1, ease: 'power4.in' })
        .to(heroEl, { x: 0, y: 0, scale: 1, duration: 0.4, ease: 'power2.out' })
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

    if (prefetchedImages) {
      setSegmentImages(prefetchedImages)
      return
    }

    const hasAny = Object.keys(segmentImages).length > 0
    if (hasAny) return
    const initImages = {}
    storySegments.forEach((_, idx) => { initImages[idx] = 'loading' })
    setSegmentImages(initImages)
    generateSegmentImagesBatch(hero, storySegments, sessionId)
      .then(res => {
        if (res && res.images) {
          const updated = {}
          res.images.forEach((img, idx) => {
            if (img && img.image) {
              updated[idx] = img
            } else {
              updated[idx] = 'failed'
            }
          })
          setSegmentImages(updated)
        } else {
          const failed = {}
          storySegments.forEach((_, idx) => { failed[idx] = 'failed' })
          setSegmentImages(failed)
        }
      })
      .catch(() => {
        const failed = {}
        storySegments.forEach((_, idx) => { failed[idx] = 'failed' })
        setSegmentImages(failed)
      })
  }, [storySegments, prefetchedImages])

  const narrateSegment = useCallback(async (segIndex) => {
    const text = storySegments[segIndex]
    if (!text) return
    setNarrationLoading(true)
    try {
      const res = await generateTTS(text, 'Kore', storyVoiceId)
      if (!narrationOnRef.current) { setNarrationLoading(false); return }
      if (res && res.audio) {
        const el = getAudioElement()
        el.onended = () => {
          setNarrationPlaying(false)
        }
        await playBase64Audio(res.audio, res.mime || 'audio/mpeg')
        setNarrationPlaying(true)
      }
    } catch (e) {
      console.warn('Narration failed:', e)
    } finally {
      setNarrationLoading(false)
    }
  }, [storySegments, storyVoiceId])

  const handleNarratorClick = () => {
    if (narrationOn) {
      stopCurrentAudio()
      setNarrationPlaying(false)
      setNarrationOn(false)
      narrationOnRef.current = false
      return
    }
    setNarrationOn(true)
    narrationOnRef.current = true
    narrateSegment(activeSegment)
  }

  useEffect(() => {
    if (narrationOn && !narrationPlaying && !narrationLoading) {
      narrateSegment(activeSegment)
    }
  }, [activeSegment])

  const handleMiniGameComplete = useCallback((bonusCoins) => {
    setCompletedMiniGames(prev => ({ ...prev, [currentMiniGameIdx]: true }))
    setTotalBonusCoins(prev => prev + bonusCoins)
    if (sessionId) {
      addBonusCoins(sessionId, bonusCoins).then(res => {
        if (res && onBonusCoins) onBonusCoins(res.coins)
      }).catch(() => {})
    }
    setTimeout(() => {
      setShowMiniGame(false)
      const next = activeSegment + 1
      if (next < storySegments.length) {
        setActiveSegment(next)
        setRevealedSegments(prev => [...new Set([...prev, next])])
        scrollToBottom()
      } else {
        setAllDone(true)
        if (onComplete) onComplete()
      }
    }, 2200)
  }, [currentMiniGameIdx, activeSegment, storySegments.length, sessionId, onBonusCoins, onComplete])

  const scrollToBottom = () => {
    setTimeout(() => {
      const sceneEl = sceneRef.current
      if (sceneEl) {
        const isMobile = window.innerWidth <= 600
        if (isMobile) {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
        } else {
          sceneEl.scrollTo({ top: sceneEl.scrollHeight, behavior: 'smooth' })
        }
      }
    }, 150)
  }

  const handleNextSegment = () => {
    stopCurrentAudio()
    setNarrationPlaying(false)
    const next = activeSegment + 1

    const maxMiniGames = Math.min(games.length, storySegments.length - 1)
    if (next < storySegments.length && maxMiniGames > 0 && currentMiniGameIdx < maxMiniGames && !completedMiniGames[currentMiniGameIdx]) {
      setShowMiniGame(true)
      scrollToBottom()
      return
    }

    if (next < storySegments.length) {
      setActiveSegment(next)
      setRevealedSegments(prev => [...new Set([...prev, next])])
      scrollToBottom()
    } else {
      setAllDone(true)
      if (onComplete) onComplete()
    }
  }

  if (!storySegments.length) return null

  return (
    <div ref={sceneRef} className="scene-container" style={{
      background: `linear-gradient(135deg, ${sprite.color}10, ${sprite.color}18)`,
      border: `1px solid ${sprite.color}44`,
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
          display: 'inline-block', willChange: 'transform',
          filter: `drop-shadow(0 0 20px ${sprite.color}88)`,
        }}>
          <img
            className="scene-hero-img"
            src={sprite.img}
            alt={hero}
            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
            style={{
              width: '100px',
              height: '100px',
              objectFit: 'contain',
              borderRadius: '50%',
              border: `3px solid ${sprite.color}`,
              background: `${sprite.color}22`,
            }}
          />
          <span style={{ display: 'none', fontSize: '72px' }}>{sprite.emoji}</span>
        </div>
      </div>

      <div ref={actionRef} style={{
        textAlign: 'center',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 'clamp(11px, 1.5vw, 15px)',
        fontWeight: 600,
        color: sprite.color,
        margin: '8px 0 12px',
        letterSpacing: '1px',
        position: 'relative', zIndex: 2, opacity: 0,
      }}>
        {hero} is {sprite.action}!
      </div>

      <div style={{ textAlign: 'center', marginBottom: '16px', position: 'relative', zIndex: 2 }}>
        <button
          onClick={handleNarratorClick}
          disabled={narrationLoading && !narrationOn}
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: narrationOn ? '#fff' : '#aaa',
            background: narrationOn ? `${sprite.color}33` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${narrationOn ? sprite.color + '66' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '24px',
            padding: '10px 24px',
            cursor: narrationLoading ? 'wait' : 'pointer',
            transition: 'all 0.3s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            opacity: narrationLoading ? 0.7 : 1,
            letterSpacing: '0.5px',
          }}
        >
          <span style={{ fontSize: '16px' }}>{narrationOn ? (narrationPlaying ? '🔊' : narrationLoading ? '⏳' : '🔊') : '🔇'}</span>
          {narrationOn ? (narrationPlaying ? 'Narrator ON' : narrationLoading ? 'Loading...' : 'Narrator ON') : 'Read Aloud'}
        </button>
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
            <div key={i}>
              <StorySegment
                text={seg}
                image={imageObj}
                imageStatus={status}
                index={i}
                isActive={i === activeSegment}
                isRevealed={revealedSegments.includes(i)}
                sprite={sprite}
                hero={hero}
                mathSteps={mathSteps}
                totalSegments={storySegments.length}
              />
              {i === activeSegment && showMiniGame && games[currentMiniGameIdx] && (
                <MiniGame
                  game={games[currentMiniGameIdx]}
                  hero={hero}
                  heroColor={sprite.color}
                  sessionId={sessionId}
                  onComplete={(bonus) => {
                    setCurrentMiniGameIdx(prev => prev + 1)
                    handleMiniGameComplete(bonus)
                  }}
                />
              )}
            </div>
          )
        })}

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {!allDone ? (
            showMiniGame ? (
              <div style={{
                fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', color: '#9ca3af',
                padding: '10px', letterSpacing: '0.5px',
              }}>
                Complete the mini-game to continue!
              </div>
            ) : (
            <button
              className="scene-next-btn"
              onClick={handleNextSegment}
              style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '13px',
                fontWeight: 700,
                color: '#fff',
                background: `linear-gradient(135deg, ${sprite.color}, ${sprite.color}cc)`,
                border: 'none',
                borderRadius: '12px',
                padding: '14px 36px',
                cursor: 'pointer',
                boxShadow: `0 4px 15px ${sprite.color}44`,
                transition: 'all 0.2s',
                letterSpacing: '1px',
              }}
            >
              {activeSegment < storySegments.length - 1 ? '▶ Next Part' : '🏆 Finish!'}
            </button>
            )
          ) : (
            <>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '16px',
                fontWeight: 700,
                color: '#fbbf24',
                padding: '12px',
                animation: 'pulse 1.5s ease-in-out infinite',
                letterSpacing: '1px',
              }}>
                🎉 Quest Complete! +50 Gold! 🎉
              </div>

              <div className="victory-parent-activity" style={{
                marginTop: '20px',
                background: 'linear-gradient(135deg, rgba(255,193,7,0.08), rgba(255,152,0,0.12))',
                border: '2px dashed rgba(255,193,7,0.4)',
                borderRadius: '14px',
                padding: '20px 24px',
                textAlign: 'left',
                maxWidth: '500px',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}>
                <div style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#fbbf24',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  letterSpacing: '1px',
                }}>
                  <span style={{ fontSize: '18px' }}>📝</span> Parent Activity
                </div>
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '16px',
                  fontWeight: 500,
                  lineHeight: '1.7',
                  color: '#e0e0e0',
                }}>
                  <p style={{ margin: '0 0 10px' }}>
                    Grab a piece of paper and work through this together!
                  </p>
                  <div style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    marginBottom: '12px',
                    borderLeft: '3px solid #ffc107',
                  }}>
                    <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>The Problem:</div>
                    <div style={{ fontSize: '18px', color: '#fff', fontWeight: 600 }}>{mathProblem}</div>
                  </div>
                  <ol style={{ margin: '0', paddingLeft: '20px', color: '#ccc' }}>
                    <li style={{ marginBottom: '6px' }}>Have your child write the problem on paper</li>
                    <li style={{ marginBottom: '6px' }}>Let them show the steps to solve it</li>
                    <li style={{ marginBottom: '6px' }}>Write the final answer together</li>
                    <li>Keep it in a folder to track their progress!</li>
                  </ol>
                </div>
              </div>
            </>
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
