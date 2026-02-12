import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const HERO_DATA = {
  Wizard: { emoji: '🧙‍♂️', color: '#7B1FA2', desc: 'Magic & Spellbooks' },
  Goku: { emoji: '💥', color: '#FF6F00', desc: 'Super Saiyan Power' },
  Ninja: { emoji: '🥷', color: '#37474F', desc: 'Stealth & Shadow Clones' },
  Princess: { emoji: '👑', color: '#E91E63', desc: 'Royal Magic' },
  Hulk: { emoji: '💪', color: '#2E7D32', desc: 'Super Strength' },
  'Spider-Man': { emoji: '🕷️', color: '#D32F2F', desc: 'Web-Slinging' },
}

export default function HeroCard({ name, selected, onClick, index }) {
  const ref = useRef(null)
  const data = HERO_DATA[name] || { emoji: '❓', color: '#666', desc: '' }

  useEffect(() => {
    gsap.from(ref.current, {
      y: 60, opacity: 0, scale: 0.8, duration: 0.5,
      delay: index * 0.1, ease: 'back.out(1.7)'
    })
  }, [])

  return (
    <div
      ref={ref}
      onClick={onClick}
      onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.08, duration: 0.2 })}
      onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })}
      style={{
        background: selected
          ? `linear-gradient(135deg, ${data.color}44, ${data.color}22)`
          : 'rgba(255,255,255,0.05)',
        border: `3px solid ${selected ? data.color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '16px',
        padding: '20px 16px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.3s, background 0.3s',
        boxShadow: selected ? `0 0 25px ${data.color}44` : 'none',
        minWidth: '120px',
      }}
    >
      <div style={{ fontSize: '48px', marginBottom: '8px' }}>{data.emoji}</div>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '10px',
        color: selected ? data.color : '#aaa',
        marginBottom: '6px',
      }}>{name}</div>
      <div style={{ fontSize: '12px', color: '#888' }}>{data.desc}</div>
    </div>
  )
}
