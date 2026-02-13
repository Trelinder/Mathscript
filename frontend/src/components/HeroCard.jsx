import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const HERO_DATA = {
  Wizard: { img: '/images/hero-wizard.png', color: '#a855f7', desc: 'Magic & Spellbooks' },
  Goku: { img: '/images/hero-goku.png', color: '#f97316', desc: 'Super Saiyan Power' },
  Ninja: { img: '/images/hero-ninja.png', color: '#64748b', desc: 'Stealth & Shadow Clones' },
  Princess: { img: '/images/hero-princess.png', color: '#ec4899', desc: 'Royal Magic' },
  Hulk: { img: '/images/hero-hulk.png', color: '#22c55e', desc: 'Super Strength' },
  'Spider-Man': { img: '/images/hero-spiderman.png', color: '#ef4444', desc: 'Web-Slinging' },
  'Miles Morales': { img: '/images/hero-miles.png', color: '#dc2626', desc: 'Venom Blast' },
  Storm: { img: '/images/hero-storm.png', color: '#3b82f6', desc: 'Weather Control' },
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
      className="hero-card"
      onClick={onClick}
      onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.06, duration: 0.2 })}
      onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })}
      style={{
        background: selected
          ? `linear-gradient(135deg, ${data.color}30, ${data.color}10)`
          : 'rgba(255,255,255,0.03)',
        border: `2px solid ${selected ? data.color : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '16px',
        padding: '16px 12px 12px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
        boxShadow: selected ? `0 0 25px ${data.color}33, inset 0 0 20px ${data.color}08` : 'none',
        minWidth: '130px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="hero-avatar" style={{
        width: '90px',
        height: '90px',
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${selected ? data.color : 'rgba(255,255,255,0.1)'}`,
        boxShadow: selected ? `0 0 20px ${data.color}44` : '0 4px 12px rgba(0,0,0,0.4)',
        background: `radial-gradient(circle, ${data.color}20, transparent)`,
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
      <div className="hero-name" style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '13px',
        fontWeight: 700,
        color: selected ? data.color : '#c0c0d0',
        marginTop: '4px',
        lineHeight: '1.3',
        letterSpacing: '0.5px',
      }}>{name}</div>
      <div className="hero-desc" style={{
        fontSize: '11px',
        fontWeight: 500,
        color: '#777',
        fontFamily: "'Rajdhani', sans-serif",
      }}>{data.desc}</div>
    </div>
  )
}
