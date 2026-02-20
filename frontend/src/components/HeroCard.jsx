import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'

const HERO_DATA = {
  Arcanos: { img: '/images/hero-arcanos.png', color: '#a855f7', desc: 'Arcane Sorcery' },
  Blaze: { img: '/images/hero-blaze.png', color: '#f97316', desc: 'Fire Martial Arts' },
  Shadow: { img: '/images/hero-shadow.png', color: '#64748b', desc: 'Stealth & Daggers' },
  Luna: { img: '/images/hero-luna.png', color: '#ec4899', desc: 'Moon Enchantress' },
  Titan: { img: '/images/hero-titan.png', color: '#22c55e', desc: 'Colossal Strength' },
  Webweaver: { img: '/images/hero-webweaver.png', color: '#ef4444', desc: 'Acrobatic Webs' },
  Volt: { img: '/images/hero-volt.png', color: '#dc2626', desc: 'Electric Blasts' },
  Tempest: { img: '/images/hero-tempest.png', color: '#3b82f6', desc: 'Weather Control' },
  Zenith: { img: '/images/hero-zenith.png', color: '#FFD700', desc: 'Cosmic Power' },
}

const FREE_HEROES = ['Arcanos', 'Blaze', 'Shadow', 'Luna']

export default function HeroCard({ name, selected, onClick, index, isPremiumUser }) {
  const ref = useRef(null)
  const data = HERO_DATA[name] || { img: '', color: '#666', desc: '' }
  const isLocked = !FREE_HEROES.includes(name) && !isPremiumUser

  useEffect(() => {
    gsap.from(ref.current, {
      y: 60, opacity: 0, scale: 0.8, duration: 0.5,
      delay: index * 0.1, ease: 'back.out(1.7)'
    })
  }, [])

  const handleClick = () => {
    if (isLocked) {
      onClick(name, true)
    } else {
      onClick(name, false)
    }
  }

  return (
    <div
      ref={ref}
      className="hero-card"
      onClick={handleClick}
      onMouseEnter={e => gsap.to(e.currentTarget, { scale: 1.06, duration: 0.2 })}
      onMouseLeave={e => gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })}
      style={{
        background: selected
          ? `linear-gradient(135deg, ${data.color}30, ${data.color}10)`
          : isLocked
            ? 'rgba(0,0,0,0.3)'
            : 'rgba(255,255,255,0.03)',
        border: `2px solid ${selected ? data.color : isLocked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'}`,
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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {isLocked && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          borderRadius: '14px',
          gap: '4px',
        }}>
          <span style={{ fontSize: '24px' }}>🔒</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#FFD700',
            fontFamily: "'Rajdhani', sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '1px',
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>Premium</span>
        </div>
      )}
      <div className="hero-avatar" style={{
        width: '90px',
        height: '90px',
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${selected ? data.color : isLocked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: selected ? `0 0 20px ${data.color}44` : '0 4px 12px rgba(0,0,0,0.4)',
        background: `radial-gradient(circle, ${data.color}20, transparent)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.3s, box-shadow 0.3s',
        filter: isLocked ? 'grayscale(60%) brightness(0.6)' : 'none',
      }}>
        <img
          src={data.img}
          alt={name}
          loading="lazy"
          decoding="async"
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
        color: isLocked ? '#666' : selected ? data.color : '#c0c0d0',
        marginTop: '4px',
        lineHeight: '1.3',
        letterSpacing: '0.5px',
      }}>{name}</div>
      <div className="hero-desc" style={{
        fontSize: '11px',
        fontWeight: 500,
        color: isLocked ? '#555' : '#777',
        fontFamily: "'Rajdhani', sans-serif",
      }}>{data.desc}</div>
    </div>
  )
}
