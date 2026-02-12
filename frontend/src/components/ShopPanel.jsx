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
      background: 'rgba(26,26,46,0.95)',
      border: '3px solid #f0e68c',
      borderRadius: '16px',
      padding: '24px',
      margin: '20px 0',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '16px', color: '#f0e68c' }}>
          Hero Shop
        </div>
        <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '14px', color: '#ffd700' }}>
          🪙 {session.coins} Gold
        </div>
      </div>
      {error && <div style={{ color: '#e94560', fontFamily: "'Press Start 2P', monospace", fontSize: '10px', marginBottom: '12px' }}>{error}</div>}
      <div className="shop-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
        {items.map(item => {
          const owned = session.inventory?.includes(item.name)
          const canAfford = session.coins >= item.price
          return (
            <div key={item.id} className="shop-item" style={{
              background: owned ? 'rgba(78,204,163,0.15)' : 'rgba(255,255,255,0.05)',
              border: `2px solid ${owned ? '#4ecca3' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '12px',
              padding: '16px',
              textAlign: 'center',
            }}>
              <div className="item-emoji" style={{ fontSize: '32px', marginBottom: '8px' }}>{item.emoji}</div>
              <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px', color: '#eee', marginBottom: '8px' }}>{item.name}</div>
              {owned ? (
                <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '8px', color: '#4ecca3' }}>OWNED</div>
              ) : (
                <button
                  onClick={() => handleBuy(item)}
                  disabled={!canAfford || buying === item.id}
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '8px',
                    padding: '8px 12px',
                    background: canAfford ? 'linear-gradient(180deg, #ffd700, #b8860b)' : '#555',
                    color: canAfford ? '#1a1a2e' : '#888',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
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
        fontFamily: "'Press Start 2P', monospace",
        fontSize: '10px',
        color: '#888',
        background: 'none',
        border: '1px solid #555',
        borderRadius: '6px',
        padding: '8px 16px',
        cursor: 'pointer',
        marginTop: '16px',
      }}>Close Shop</button>
    </div>
  )
}
