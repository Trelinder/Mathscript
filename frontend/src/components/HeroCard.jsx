import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const HERO_DATA = {
  Wizard: { img: '/images/hero-wizard.png', color: '#7B1FA2', desc: 'Magic & Spellbooks' },
  Goku: { img: '/images/hero-goku.png', color: '#FF6F00', desc: 'Super Saiyan Power' },
  Ninja: { img: '/images/hero-ninja.png', color: '#37474F', desc: 'Stealth & Shadow Clones' },
  Princess: { img: '/images/hero-princess.png', color: '#E91E63', desc: 'Royal Magic' },
  Hulk: { img: '/images/hero-hulk.png', color: '#2E7D32', desc: 'Super Strength' },
  'Spider-Man': { img: '/images/hero-spiderman.png', color: '#D32F2F', desc: 'Web-Slinging' },
  'Miles Morales': { img: '/images/hero-miles.png', color: '#B71C1C', desc: 'Venom Blast' },
  Storm: { img: '/images/hero-storm.png', color: '#1565C0', desc: 'Weather Control' },
}

export default function HeroCard({ name, selected, onClick, index }) {
  const ref = useRef(null)
  const data = HERO_DATA[name] || { img: '', color: '#666', desc: '' }

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
        padding: '16px 12px 12px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.3s, background 0.3s',
        boxShadow: selected ? `0 0 25px ${data.color}44` : 'none',
        minWidth: '130px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <div style={{
        width: '90px',
        height: '90px',
        borderRadius: '50%',
        overflow: 'hidden',
        border: `3px solid ${selected ? data.color : 'rgba(255,255,255,0.15)'}`,
        boxShadow: selected ? `0 0 15px ${data.color}66` : '0 2px 8px rgba(0,0,0,0.3)',
        background: `radial-gradient(circle, ${data.color}33, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}>
        <img
          src={data.img}
          alt={name}
          style={{
            width: '80px',
            height: '80px',
            objectFit: 'contain',
            imageRendering: 'auto',
          }}
        />
      </div>
      <div style={{
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '9px',
        color: selected ? data.color : '#ccc',
        marginTop: '4px',
        lineHeight: '1.4',
      }}>{name}</div>
      <div style={{ fontSize: '11px', color: '#999' }}>{data.desc}</div>
    </div>
  )
}
