import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { gsap } from 'gsap'
import { generateSegmentImagesBatch, generateTTS, fetchTTSVoices, addBonusCoins } from '../api/client'
import MathPaper from './MathPaper'
import MiniGame from './MiniGame'
import AccessibleMath from './AccessibleMath'
import { useMotionSettings } from '../utils/motion'
import { unlockAudioForIOS } from '../utils/audio'

let sharedAudioEl = null
let currentBlobUrl = null
let onEndedCallback = null

function getAudioElement() {
  if (!sharedAudioEl) {
    sharedAudioEl = document.createElement('audio')
    sharedAudioEl.setAttribute('playsinline', '')
    sharedAudioEl.setAttribute('webkit-playsinline', '')
    sharedAudioEl.setAttribute('preload', 'auto')
    document.body.appendChild(sharedAudioEl)
  }
  return sharedAudioEl
}

function stopBrowserNarration() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
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

  el.onended = () => {
    if (onEndedCallback) onEndedCallback()
  }

  el.src = url
  el.volume = 1.0
  el.muted = false

  try {
    await el.load()
    await el.play()
  } catch (e) {
    console.warn('Audio play failed, retrying...', e.message)
    try {
      await new Promise(r => setTimeout(r, 100))
      await el.play()
    } catch (e2) {
      console.warn('Audio retry also failed:', e2.message)
    }
  }
  return el
}

function stopCurrentAudio() {
  const el = getAudioElement()
  if (!el.paused) {
    el.pause()
    el.currentTime = 0
  }
  el.onended = null
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl)
    currentBlobUrl = null
  }
  stopBrowserNarration()
  onEndedCallback = null
}

const PARTICLE_SHAPES = {
  diamond: (color) => `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 0L16 8L8 16L0 8Z" fill="${color}" opacity="0.8"/></svg>`,
  circle: (color) => `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="${color}" opacity="0.7"/></svg>`,
  star: (color) => `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 0L10 6L16 6L11 10L13 16L8 12L3 16L5 10L0 6L6 6Z" fill="${color}" opacity="0.8"/></svg>`,
  bolt: (color) => `<svg width="12" height="18" viewBox="0 0 12 18"><path d="M7 0L0 10H5L4 18L12 7H7Z" fill="${color}" opacity="0.9"/></svg>`,
  cross: (color) => `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 0H9V5H14V9H9V14H5V9H0V5H5Z" fill="${color}" opacity="0.7"/></svg>`,
}

const HERO_SPRITES = {
  Arcanos: { color: '#a855f7', particleShapes: ['star', 'diamond', 'circle'], action: 'casting a spell', moves: 'spell', img: '/images/hero-arcanos.png' },
  Blaze: { color: '#f97316', particleShapes: ['bolt', 'cross', 'diamond'], action: 'powering up', moves: 'punch', img: '/images/hero-blaze.png' },
  Shadow: { color: '#64748b', particleShapes: ['diamond', 'circle', 'star'], action: 'throwing stars', moves: 'dash', img: '/images/hero-shadow.png' },
  Luna: { color: '#ec4899', particleShapes: ['star', 'circle', 'diamond'], action: 'casting lunar magic', moves: 'magic', img: '/images/hero-luna.png' },
  Titan: { color: '#22c55e', particleShapes: ['cross', 'bolt', 'diamond'], action: 'smashing', moves: 'smash', img: '/images/hero-titan.png' },
  Webweaver: { color: '#ef4444', particleShapes: ['diamond', 'star', 'circle'], action: 'slinging webs', moves: 'swing', img: '/images/hero-webweaver.png' },
  Volt: { color: '#dc2626', particleShapes: ['bolt', 'diamond', 'star'], action: 'charging a venom blast', moves: 'venom', img: '/images/hero-volt.png' },
  Tempest: { color: '#3b82f6', particleShapes: ['bolt', 'star', 'cross'], action: 'summoning a storm', moves: 'storm', img: '/images/hero-tempest.png' },
  Zenith: { color: '#f59e0b', particleShapes: ['bolt', 'star', 'diamond'], action: 'powering up dark ki', moves: 'punch', img: '/images/hero-zenith.svg' },
}

const SEGMENT_LABELS = ['The Challenge Appears...', 'Hero Powers Activate!', 'The Battle Rages On!', 'Victory!']

function StorySegment({ text, image, imageStatus, index, isActive, isRevealed, sprite, hero, mathSteps, totalSegments, reduceEffects }) {
  const segRef = useRef(null)
  const imgRef = useRef(null)
  const textRef = useRef(null)
  const [displayedText, setDisplayedText] = useState('')

  useEffect(() => {
    if (!isActive || !text) return
    const el = segRef.current

    if (reduceEffects) {
      if (el) gsap.set(el, { opacity: 1, y: 0, scale: 1 })
      return
    }

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
      }
    }, 50)

    return () => clearInterval(typeInterval)
  }, [isActive, text, reduceEffects])

  useEffect(() => {
    if (reduceEffects) return
    if (image && imgRef.current) {
      gsap.fromTo(imgRef.current,
        { opacity: 0, scale: 0.8, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8, ease: 'back.out(1.4)' }
      )
    }
  }, [image, reduceEffects])

  if (!isRevealed) return null

  const label = SEGMENT_LABELS[index] || `Part ${index + 1}`
  const currentText = isActive ? (reduceEffects ? text : displayedText) : text
  const showCursor = isActive && !reduceEffects && displayedText.length < text.length

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
            {currentText}
            {showCursor && (
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
                  animation: reduceEffects ? 'none' : 'pulse 1.5s ease-in-out infinite',
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

export default function AnimatedScene({ hero, segments, sessionId, mathProblem, onComplete, prefetchedImages, mathSteps, miniGames, session, onBonusCoins }) {
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
  const [narrationError, setNarrationError] = useState('')
  const narrationOnRef = useRef(false)
  const [storyVoiceId, setStoryVoiceId] = useState(null)
  const [showMiniGame, setShowMiniGame] = useState(false)
  const [currentMiniGameIdx, setCurrentMiniGameIdx] = useState(0)
  const [completedMiniGames, setCompletedMiniGames] = useState({})
  const motion = useMotionSettings()
  const sprite = HERO_SPRITES[hero] || HERO_SPRITES.Arcanos

  const storySegments = useMemo(() => segments || [], [segments])
  const games = useMemo(() => miniGames || [], [miniGames])

  const normalizeVoiceId = useCallback((voice) => {
    if (!voice) return null
    if (typeof voice === 'string') return voice
    if (typeof voice === 'object') return voice.id || voice.voice_id || null
    return null
  }, [])

  useEffect(() => {
    if (!storySegments.length) return
    fetchTTSVoices().then(voices => {
      const normalized = (voices || []).map(normalizeVoiceId).filter(Boolean)
      if (normalized.length > 0) {
        setStoryVoiceId(normalized[Math.floor(Math.random() * normalized.length)])
      }
    }).catch(() => {})
  }, [normalizeVoiceId, storySegments])

  useEffect(() => {
    // Reset narrator state between stories/heroes to avoid stale playback.
    stopCurrentAudio()
    narrationOnRef.current = false
    setNarrationOn(false)
    setNarrationPlaying(false)
    setNarrationLoading(false)
    setNarrationError('')
  }, [hero, storySegments.length])

  useEffect(() => {
    if (!storySegments.length) return

    const tl = gsap.timeline()
    const heroEl = heroRef.current
    const actionEl = actionRef.current
    if (!heroEl || !actionEl) return

    if (motion.reduceEffects) {
      tl.fromTo(heroEl, { y: 20, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'power2.out' })
      tl.fromTo(actionEl, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, '-=0.1')
    } else {
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
    }

    const container = particleContainerRef.current
    let particleTimer
    const shapes = sprite.particleShapes || ['diamond', 'circle', 'star']
    const spawnParticle = () => {
      const p = document.createElement('div')
      const shapeName = shapes[Math.floor(Math.random() * shapes.length)]
      const shapeFn = PARTICLE_SHAPES[shapeName] || PARTICLE_SHAPES.circle
      const scale = 0.8 + Math.random() * 1.2
      const svgDoc = new DOMParser().parseFromString(shapeFn(sprite.color), 'image/svg+xml')
      p.appendChild(svgDoc.documentElement)
      p.style.cssText = `position:absolute;pointer-events:none;transform:scale(${scale});filter:drop-shadow(0 0 4px ${sprite.color}88);`
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
    if (!motion.reduceEffects && container) {
      const burstIntervalMs = Math.max(320, Math.round(320 / Math.max(0.4, motion.particleScale)))
      const idleIntervalMs = Math.max(1600, Math.round(1800 / Math.max(0.4, motion.particleScale)))
      particleTimer = setInterval(spawnParticle, burstIntervalMs)
      setTimeout(() => { clearInterval(particleTimer); particleTimer = setInterval(spawnParticle, idleIntervalMs) }, 3000)
    }

    return () => {
      tl.kill()
      gsap.killTweensOf(heroEl)
      if (container) gsap.killTweensOf(container.children)
      clearInterval(particleTimer)
    }
  }, [hero, storySegments.length, sprite.moves, sprite.particleShapes, sprite.color, motion.reduceEffects, motion.particleScale])

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
  }, [hero, prefetchedImages, segmentImages, sessionId, storySegments])

  const narrateSegment = useCallback(async (segIndex) => {
    const text = storySegments[segIndex]
    if (!text) return
    setNarrationError('')
    setNarrationLoading(true)
    try {
      const res = await generateTTS(text, 'Kore', storyVoiceId)
      if (!narrationOnRef.current) { setNarrationLoading(false); return }
      if (res && res.audio) {
        stopBrowserNarration()
        onEndedCallback = () => {
          setNarrationPlaying(false)
        }
        await playBase64Audio(res.audio, res.mime || 'audio/mpeg')
        setNarrationPlaying(true)
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        stopCurrentAudio()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.95
        utterance.pitch = 1.0
        utterance.onstart = () => setNarrationPlaying(true)
        utterance.onend = () => setNarrationPlaying(false)
        utterance.onerror = () => {
          setNarrationPlaying(false)
          setNarrationOn(false)
          narrationOnRef.current = false
          setNarrationError('Narrator unavailable right now.')
        }
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      } else {
        setNarrationOn(false)
        narrationOnRef.current = false
        setNarrationPlaying(false)
        setNarrationError('Narrator unavailable right now.')
      }
    } catch (e) {
      console.warn('Narration failed:', e)
      setNarrationOn(false)
      narrationOnRef.current = false
      setNarrationPlaying(false)
      setNarrationError('Narrator unavailable right now.')
    } finally {
      setNarrationLoading(false)
    }
  }, [storySegments, storyVoiceId])

  const handleNarratorClick = () => {
    unlockAudioForIOS()
    if (narrationOn) {
      stopCurrentAudio()
      setNarrationPlaying(false)
      setNarrationOn(false)
      setNarrationError('')
      narrationOnRef.current = false
      return
    }
    setNarrationOn(true)
    setNarrationError('')
    narrationOnRef.current = true
    narrateSegment(activeSegment)
  }

  useEffect(() => {
    if (narrationOn && !narrationPlaying && !narrationLoading) {
      narrateSegment(activeSegment)
    }
  }, [activeSegment, narrateSegment, narrationLoading, narrationOn, narrationPlaying])

  useEffect(() => {
    return () => {
      narrationOnRef.current = false
      stopCurrentAudio()
      onEndedCallback = null
    }
  }, [])

  const handleMiniGameComplete = useCallback((bonusCoins) => {
    setCompletedMiniGames(prev => ({ ...prev, [currentMiniGameIdx]: true }))
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
          <span style={{ display: 'none', fontSize: '20px', fontFamily: "'Orbitron', sans-serif", fontWeight: 800, color: sprite.color }}>{hero}</span>
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            {narrationOn ? (
              <>
                <path d="M3 9v6h4l5 5V4L7 9H3z" fill="#fff"/>
                <path d="M16 8.5a4 4 0 010 7M19 5.5a8 8 0 010 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </>
            ) : (
              <>
                <path d="M3 9v6h4l5 5V4L7 9H3z" fill="#888"/>
                <path d="M16 9L22 15M22 9L16 15" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
              </>
            )}
          </svg>
          {narrationOn ? (narrationPlaying ? 'Narrator ON' : narrationLoading ? 'Loading...' : 'Narrator ON') : (narrationError ? 'Narrator Unavailable' : 'Read Aloud')}
        </button>
        {narrationError && (
          <div style={{
            marginTop: '8px',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '12px',
            color: '#fca5a5',
            fontWeight: 600,
          }}>
            {narrationError}
          </div>
        )}
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
                reduceEffects={motion.reduceEffects}
              />
              {i === activeSegment && showMiniGame && games[currentMiniGameIdx] && (
                <MiniGame
                  game={games[currentMiniGameIdx]}
                  hero={hero}
                  heroColor={sprite.color}
                  session={session}
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
              {activeSegment < storySegments.length - 1 ? 'Next Part' : 'Finish!'}
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
                Quest Complete! +50 Gold!
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="4" y="2" width="16" height="20" rx="2" stroke="#fbbf24" strokeWidth="2" fill="none"/>
                    <path d="M8 6H16M8 10H16M8 14H13" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Parent Activity
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
                    <AccessibleMath
                      expression={mathProblem}
                      ariaLabel="Submitted math problem"
                      style={{ fontSize: '18px', color: '#fff', fontWeight: 600 }}
                    />
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
