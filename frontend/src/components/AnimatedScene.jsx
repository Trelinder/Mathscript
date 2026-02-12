import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

const HERO_SPRITES = {
  Wizard: { emoji: '🧙‍♂️', color: '#7B1FA2', particles: ['✨','⭐','🔮','💫','🌟'], action: 'casting a spell', moves: 'spell' },
  Goku: { emoji: '💥', color: '#FF6F00', particles: ['⚡','💥','🔥','💪','✊'], action: 'powering up', moves: 'punch' },
  Ninja: { emoji: '🥷', color: '#37474F', particles: ['💨','🌀','⚔️','🌙','💫'], action: 'throwing stars', moves: 'dash' },
  Princess: { emoji: '👑', color: '#E91E63', particles: ['👑','💎','🦋','🌸','✨'], action: 'casting royal magic', moves: 'magic' },
  Hulk: { emoji: '💪', color: '#2E7D32', particles: ['💥','💪','🪨','⚡','🔥'], action: 'smashing', moves: 'smash' },
  'Spider-Man': { emoji: '🕷️', color: '#D32F2F', particles: ['🕸️','🕷️','💫','⚡','🌀'], action: 'slinging webs', moves: 'swing' },
}

export default function AnimatedScene({ hero, story, onComplete }) {
  const sceneRef = useRef(null)
  const heroRef = useRef(null)
  const textRef = useRef(null)
  const particleContainerRef = useRef(null)
  const actionRef = useRef(null)
  const [displayedText, setDisplayedText] = useState('')
  const sprite = HERO_SPRITES[hero] || HERO_SPRITES.Wizard

  useEffect(() => {
    if (!story) return

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

    gsap.to(heroEl, {
      y: '+=12', duration: 2, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2
    })
    gsap.to(heroEl, {
      rotation: 5, duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2
    })

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
        {
          y: startY - 80 - Math.random() * 120,
          x: startX + (Math.random() - 0.5) * 200,
          opacity: 0, scale: 1.5, rotation: Math.random() * 360,
          duration: 1.5 + Math.random() * 1.5, ease: 'power2.out',
          onComplete: () => p.remove()
        }
      )
    }
    particleTimer = setInterval(spawnParticle, 250)
    setTimeout(() => {
      clearInterval(particleTimer)
      particleTimer = setInterval(spawnParticle, 1500)
    }, 4000)

    let idx = 0
    const chars = story.split('')
    let accum = ''
    const typeInterval = setInterval(() => {
      if (idx < chars.length) {
        const batch = Math.min(3, chars.length - idx)
        accum += chars.slice(idx, idx + batch).join('')
        setDisplayedText(accum)
        idx += batch
      } else {
        clearInterval(typeInterval)
        if (onComplete) onComplete()
      }
    }, 20)

    return () => {
      tl.kill()
      gsap.killTweensOf(heroEl)
      clearInterval(particleTimer)
      clearInterval(typeInterval)
    }
  }, [story, hero])

  return (
    <div ref={sceneRef} style={{
      background: `linear-gradient(135deg, ${sprite.color}22, ${sprite.color}44)`,
      border: `3px solid ${sprite.color}`,
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '350px',
    }}>
      <div ref={particleContainerRef} style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 1, overflow: 'hidden',
      }} />

      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div ref={heroRef} style={{
          fontSize: '80px', display: 'inline-block', willChange: 'transform',
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
        margin: '12px 0',
        textShadow: `0 0 10px ${sprite.color}88`,
        position: 'relative', zIndex: 2, opacity: 0,
      }}>
        {hero} is {sprite.action}!
      </div>

      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: '16px',
        lineHeight: '1.9',
        color: '#e0e0e0',
        padding: '20px',
        background: 'rgba(26,26,46,0.85)',
        borderRadius: '12px',
        marginTop: '16px',
        position: 'relative', zIndex: 2,
        borderLeft: `4px solid ${sprite.color}`,
        minHeight: '80px',
        backdropFilter: 'blur(4px)',
      }}>
        <div ref={textRef} style={{ whiteSpace: 'pre-wrap' }}>
          {displayedText}
          <span style={{
            display: 'inline-block', width: '2px', height: '18px',
            background: sprite.color, marginLeft: '2px', verticalAlign: 'text-bottom',
            animation: 'blink 0.7s step-end infinite',
          }} />
        </div>
      </div>

      <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  )
}
