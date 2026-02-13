import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { fetchShop, buyItem } from '../api/client'

export default function ShopPanel({ sessionId, session, refreshSession, onClose }) {
  const [items, setItems] = useState([])
  const [buying, setBuying] = useState(null)
  const [error, setError] = useState('')
  const panelRef = useRef(null)

  useEffect(() => {
    fetchShop().then(setItems).catch(() => {})
    gsap.from(panelRef.current, { y: 50, opacity: 0, duration: 0.4, ease: 'back.out(1.5)' })
  }, [])

  const handleBuy = async (item) => {
    setBuying(item.id)
    setError('')
    try {
      await buyItem(item.id, sessionId)
      await refreshSession()
    } catch (e) {
      setError(e.message)
    }
    setBuying(null)
  }

  return (
    <div ref={panelRef} style={{
      background: 'rgba(17,24,39,0.95)',
      border: '1px solid rgba(251,191,36,0.3)',
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fbbf24', letterSpacing: '2px' }}>
          HERO SHOP
        </div>
        <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '16px', fontWeight: 700, color: '#fbbf24' }}>
          🪙 {session.coins} Gold
        </div>
      </div>
      {error && <div style={{ color: '#ef4444', fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>{error}</div>}
      <div className="shop-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
        {items.map(item => {
          const owned = session.inventory?.includes(item.name)
          const canAfford = session.coins >= item.price
          return (
            <div key={item.id} className="shop-item" style={{
              background: owned ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${owned ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: '14px',
              padding: '16px',
              textAlign: 'center',
              transition: 'border-color 0.3s',
            }}>
              <div className="item-emoji" style={{ fontSize: '32px', marginBottom: '8px' }}>{item.emoji}</div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '13px', fontWeight: 700, color: '#e8e8f0', marginBottom: '8px' }}>{item.name}</div>
              {owned ? (
                <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '12px', fontWeight: 700, color: '#00d4ff', letterSpacing: '1px' }}>OWNED</div>
              ) : (
                <button
                  onClick={() => handleBuy(item)}
                  disabled={!canAfford || buying === item.id}
                  style={{
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '8px 14px',
                    background: canAfford ? 'linear-gradient(135deg, #fbbf24, #d97706)' : '#333',
                    color: canAfford ? '#0a0e1a' : '#666',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                  }}
                >
                  {buying === item.id ? '...' : `🪙 ${item.price}`}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button onClick={onClose} style={{
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: '13px',
        fontWeight: 600,
        color: '#9ca3af',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '8px 18px',
        cursor: 'pointer',
        marginTop: '16px',
        transition: 'all 0.2s',
      }}>Close Shop</button>
    </div>
  )
}
