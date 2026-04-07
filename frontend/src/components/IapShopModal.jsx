/**
 * IapShopModal.jsx — In-App Purchase shop modal.
 *
 * Three products, each backed by purchaseIAP(productId):
 *   starter_pack_99c  — $0.99  → 50 Prime Tokens + instant Speed Boost
 *   no_ads            — $2.99  → permanently suppress ad-offer banners
 *   prime_coins_500   — $4.99  → 500 Prime Tokens
 *
 * Props
 * ─────
 *   open            — bool; controls visibility
 *   onClose()       — called when the player closes the modal
 *   onPurchase({ productId, purchased }) — called after each IAP attempt
 *   noAdsPurchased  — bool; grey out the "No Ads" product if already owned
 */

import React, { useState, useCallback } from 'react'
import { purchaseIAP } from '../utils/MonetizationHooks'

const IAP_PRODUCTS = [
  {
    id:       'starter_pack_99c',
    icon:     '🚀',
    name:     'Starter Pack',
    price:    '$0.99',
    desc:     '50 Prime Tokens  + instant 2× Speed Boost',
    color:    '#f59e0b',
    highlight: true,
    badge:    'BEST VALUE',
  },
  {
    id:       'no_ads',
    icon:     '🚫',
    name:     'Remove Ads',
    price:    '$2.99',
    desc:     'Disable commercial-contract ad offers permanently',
    color:    '#ef4444',
    highlight: false,
  },
  {
    id:       'prime_coins_500',
    icon:     '💎',
    name:     'Prime Pack',
    price:    '$4.99',
    desc:     '500 Prime Tokens — each gives +10% passive income',
    color:    '#a855f7',
    highlight: false,
    badge:    'MOST TOKENS',
  },
]

export default function IapShopModal({ open, onClose, onPurchase, noAdsPurchased = false }) {
  const [busy, setBusy] = useState(null)   // productId currently being purchased

  const handleBuy = useCallback(async (productId) => {
    if (busy) return
    const prod = IAP_PRODUCTS.find(p => p.id === productId)
    if (!prod) return
    // no_ads is greyed out if already owned
    if (productId === 'no_ads' && noAdsPurchased) return

    setBusy(productId)
    try {
      const { purchased } = await purchaseIAP(productId)
      onPurchase?.({ productId, purchased })
    } finally {
      setBusy(null)
    }
  }, [busy, noAdsPurchased, onPurchase])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="IAP Shop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9100,
        background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Modal card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(360px, calc(100vw - 24px))',
          background: 'linear-gradient(160deg,#0d1520 0%,#111c2e 100%)',
          border: '2px solid #312e81',
          borderRadius: 20,
          padding: '20px 18px 22px',
          boxShadow: '0 0 40px rgba(129,140,248,.25), 0 16px 48px rgba(0,0,0,.7)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          aria-label="Close shop"
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28,
            background: 'rgba(255,255,255,.07)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 7, color: '#94a3b8', fontSize: 14, cursor: 'pointer',
          }}
        >✕</button>

        {/* Header */}
        <div style={{
          fontFamily: "'Orbitron',monospace", fontSize: 15, fontWeight: 900,
          color: '#818cf8', letterSpacing: '2px', textAlign: 'center', marginBottom: 4,
        }}>
          💎 IAP SHOP
        </div>
        <div style={{
          fontFamily: "'Rajdhani',sans-serif", fontSize: 11, color: '#64748b',
          textAlign: 'center', marginBottom: 18,
        }}>
          One-time purchases — no subscriptions
        </div>

        {/* Product cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {IAP_PRODUCTS.map(prod => {
            const isOwned   = prod.id === 'no_ads' && noAdsPurchased
            const isBuying  = busy === prod.id
            const isDisabled = isOwned || !!busy

            return (
              <div
                key={prod.id}
                style={{
                  background: prod.highlight
                    ? `linear-gradient(135deg,${prod.color}18,${prod.color}0a)`
                    : 'rgba(255,255,255,.03)',
                  border: `2px solid ${isOwned ? '#334155' : prod.highlight ? prod.color : `${prod.color}55`}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  opacity: isOwned ? 0.45 : 1,
                  position: 'relative',
                }}
              >
                {/* Badge */}
                {prod.badge && !isOwned && (
                  <div style={{
                    position: 'absolute', top: -9, left: 12,
                    background: prod.color, borderRadius: 6,
                    padding: '1px 7px',
                    fontFamily: "'Orbitron',monospace", fontSize: 7, fontWeight: 900,
                    color: '#fff', letterSpacing: '.8px',
                  }}>{prod.badge}</div>
                )}

                {/* Icon */}
                <span style={{ fontSize: 28, flexShrink: 0, lineHeight: 1 }}>{prod.icon}</span>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'Fredoka One',sans-serif", fontSize: 14,
                    color: isOwned ? '#475569' : prod.color, lineHeight: 1.1, marginBottom: 3,
                  }}>{prod.name}</div>
                  <div style={{
                    fontFamily: "'Rajdhani',sans-serif", fontSize: 11,
                    color: '#94a3b8', lineHeight: 1.3,
                  }}>{isOwned ? '✓ Already purchased' : prod.desc}</div>
                </div>

                {/* Buy button */}
                <button
                  aria-label={`Buy ${prod.name}`}
                  onClick={() => handleBuy(prod.id)}
                  disabled={isDisabled}
                  style={{
                    flexShrink: 0,
                    padding: '7px 10px',
                    background: isOwned
                      ? '#1e293b'
                      : `linear-gradient(135deg,${prod.color}cc,${prod.color})`,
                    border: 'none',
                    borderRadius: 10,
                    boxShadow: isOwned ? 'none' : `0 3px 0 ${prod.color}88`,
                    color: '#fff',
                    fontFamily: "'Fredoka One',sans-serif",
                    fontSize: 12, fontWeight: 900,
                    cursor: isDisabled ? 'default' : 'pointer',
                    minWidth: 54,
                    opacity: isBuying ? 0.7 : 1,
                    transition: 'opacity 120ms',
                  }}
                >
                  {isOwned ? '✓' : isBuying ? '...' : prod.price}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: 16, paddingTop: 12, borderTop: '1px solid #1e3a5f',
          fontFamily: "'Rajdhani',sans-serif", fontSize: 10,
          color: '#475569', textAlign: 'center', lineHeight: 1.5,
        }}>
          All purchases are one-time and permanent.{'\n'}
          Prices shown are illustrative — final prices set by your platform store.
        </div>
      </div>
    </div>
  )
}
