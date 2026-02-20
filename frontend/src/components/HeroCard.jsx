import { useRef, useEffect, useMemo } from 'react'
import { gsap } from 'gsap'
import { computeMotionSettings } from '../utils/motion'

const HERO_DATA = {
  Arcanos: { img: '/images/hero-arcanos.png', color: '#a855f7', desc: 'Arcane Sorcery' },
  Blaze: { img: '/images/hero-blaze.png', color: '#f97316', desc: 'Fire Martial Arts' },
  Shadow: { img: '/images/hero-shadow.png', color: '#64748b', desc: 'Stealth & Daggers' },
  Luna: { img: '/images/hero-luna.png', color: '#ec4899', desc: 'Moon Enchantress' },
  Titan: { img: '/images/hero-titan.png', color: '#22c55e', desc: 'Colossal Strength' },
  Webweaver: { img: '/images/hero-webweaver.png', color: '#ef4444', desc: 'Acrobatic Webs' },
  Volt: { img: '/images/hero-volt.png', color: '#dc2626', desc: 'Electric Blasts' },
  Tempest: { img: '/images/hero-tempest.png', color: '#3b82f6', desc: 'Weather Control' },
  Zenith: { img: '/images/hero-zenith.svg', color: '#f59e0b', desc: 'Black Super Saiyan' },
}

export default function HeroCard({ name, selected, onClick, index, locked = false, lockLabel = '' }) {
  const ref = useRef(null)
  const data = HERO_DATA[name] || { img: '', color: '#666', desc: '' }
  const motion = useMemo(() => computeMotionSettings(), [])

  useEffect(() => {
    if (!ref.current) return
    if (motion.reduceEffects) {
      gsap.set(ref.current, { opacity: 1, y: 0, scale: 1 })
      return
    }
    gsap.from(ref.current, {
      y: 60, opacity: 0, scale: 0.8, duration: 0.5,
      delay: index * 0.1, ease: 'back.out(1.7)'
    })
  }, [index, motion.reduceEffects])

  return (
    <div
      ref={ref}
      className="hero-card"
      onClick={onClick}
      onMouseEnter={motion.canHover ? (e => gsap.to(e.currentTarget, { scale: 1.06, duration: 0.2 })) : undefined}
      onMouseLeave={motion.canHover ? (e => gsap.to(e.currentTarget, { scale: 1, duration: 0.2 })) : undefined}
      style={{
        background: selected
          ? `linear-gradient(135deg, ${data.color}30, ${data.color}10)`
          : 'rgba(255,255,255,0.03)',
        border: `2px solid ${locked ? 'rgba(148,163,184,0.25)' : (selected ? data.color : 'rgba(255,255,255,0.08)')}`,
        borderRadius: '16px',
        padding: '16px 12px 12px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
        boxShadow: locked
          ? 'inset 0 0 20px rgba(15,23,42,0.35)'
          : (selected ? `0 0 25px ${data.color}33, inset 0 0 20px ${data.color}08` : 'none'),
        minWidth: '130px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        backdropFilter: motion.reduceEffects ? 'none' : 'blur(8px)',
        opacity: locked ? 0.72 : 1,
        filter: locked ? 'saturate(0.45)' : 'none',
        position: 'relative',
      }}
    >
      {locked && (
        <div style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          fontSize: '10px',
          fontWeight: 800,
          color: '#e2e8f0',
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(148,163,184,0.35)',
          borderRadius: '999px',
          padding: '2px 7px',
          letterSpacing: '0.4px',
        }}>
          🔒
        </div>
      )}
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
      {locked && (
        <div style={{
          fontSize: '10px',
          fontWeight: 700,
          color: '#cbd5e1',
          fontFamily: "'Rajdhani', sans-serif",
          marginTop: '2px',
        }}>
          {lockLabel || 'Premium'}
        </div>
      )}
    </div>
  )
}
