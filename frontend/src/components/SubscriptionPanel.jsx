import { useState, useEffect } from 'react'
import { fetchStripePrices, createCheckout, createPortalSession, redeemPromoCode } from '../api/client'

export default function SubscriptionPanel({ sessionId, subscription, onClose, onRefresh }) {
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(null)
  const [showPromo, setShowPromo] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoMsg, setPromoMsg] = useState(null)

  useEffect(() => {
    fetchStripePrices().then(p => {
      setPrices(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCheckout = async (priceId) => {
    setCheckoutLoading(priceId)
    try {
      const result = await createCheckout(sessionId, priceId)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (err) {
      alert(err.message || 'Could not start checkout')
    }
    setCheckoutLoading(null)
  }

  const handlePromoRedeem = async () => {
    if (!promoCode.trim()) return
    setPromoLoading(true)
    setPromoMsg(null)
    try {
      await redeemPromoCode(sessionId, promoCode.trim())
      setPromoMsg({ type: 'success', text: 'Premium activated! All heroes are now unlocked.' })
      setPromoCode('')
      if (onRefresh) onRefresh()
    } catch (err) {
      setPromoMsg({ type: 'error', text: err.message || 'Invalid or expired code' })
    }
    setPromoLoading(false)
  }

  const handleManage = async () => {
    try {
      const result = await createPortalSession(sessionId)
      if (result && result.url) {
        window.location.href = result.url
      }
    } catch {
      alert('Could not open subscription management')
    }
  }

  const isPremium = subscription?.is_premium

  return (
    <div style={{
      background: 'rgba(15, 20, 40, 0.95)',
      border: '1px solid rgba(124, 58, 237, 0.3)',
      borderRadius: '16px',
      padding: '28px',
      marginBottom: '20px',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '16px',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '2px',
        }}>
          {isPremium ? '⭐ PREMIUM ACTIVE' : '🚀 UPGRADE TO PREMIUM'}
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          color: '#9ca3af',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '13px',
        }}>Close</button>
      </div>

      {isPremium ? (
        <div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '16px',
            color: '#a5f3a6',
            marginBottom: '16px',
            padding: '16px',
            background: 'rgba(34, 197, 94, 0.08)',
            borderRadius: '12px',
            border: '1px solid rgba(34, 197, 94, 0.2)',
          }}>
            You have unlimited access to all math quests, AI stories, and voice narration!
          </div>
          <button onClick={handleManage} style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            fontWeight: 700,
            color: '#00d4ff',
            background: 'rgba(0, 212, 255, 0.08)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: '10px',
            padding: '10px 20px',
            cursor: 'pointer',
          }}>
            Manage Subscription
          </button>
        </div>
      ) : (
        <div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '15px',
            color: '#9ca3af',
            marginBottom: '20px',
            lineHeight: '1.6',
          }}>
            Free accounts get <span style={{ color: '#fbbf24', fontWeight: 700 }}>6 problems per day</span>.
            Upgrade to Premium for <span style={{ color: '#00d4ff', fontWeight: 700 }}>unlimited</span> math quests,
            AI-powered story explanations, and voice narration!
            <br /><span style={{ color: '#a5f3a6', fontWeight: 700 }}>Start with a free 3-day trial — no charge until it ends!</span>
          </div>

          {!subscription?.can_solve && (
            <div style={{
              padding: '14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              color: '#fca5a5',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              You've used all {subscription?.daily_limit} free problems today. Upgrade to keep learning!
            </div>
          )}

          {loading ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>Loading plans...</div>
          ) : prices.length === 0 ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>
              Premium plans coming soon!
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {prices.map(price => {
                const isYearly = price.interval === 'year'
                const monthlyEquiv = isYearly ? (price.unit_amount / 12 / 100).toFixed(2) : null
                return (
                  <div key={price.id} style={{
                    flex: '1 1 200px',
                    maxWidth: '280px',
                    background: isYearly ? 'rgba(251, 191, 36, 0.05)' : 'rgba(255,255,255,0.03)',
                    border: isYearly ? '2px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    textAlign: 'center',
                    position: 'relative',
                  }}>
                    {isYearly && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        color: '#000',
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '4px 14px',
                        borderRadius: '20px',
                        letterSpacing: '1px',
                      }}>BEST VALUE</div>
                    )}
                    <div style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: '12px',
                      fontWeight: 700,
                      color: isYearly ? '#fbbf24' : '#00d4ff',
                      marginBottom: '8px',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                    }}>
                      {isYearly ? 'Yearly' : 'Monthly'}
                    </div>
                    <div style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: '28px',
                      fontWeight: 800,
                      color: '#fff',
                      marginBottom: '4px',
                    }}>
                      ${(price.unit_amount / 100).toFixed(2)}
                    </div>
                    <div style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: '13px',
                      color: '#9ca3af',
                      marginBottom: isYearly ? '4px' : '16px',
                    }}>
                      per {price.interval}
                    </div>
                    {monthlyEquiv && (
                      <div style={{
                        fontFamily: "'Rajdhani', sans-serif",
                        fontSize: '12px',
                        color: '#a5f3a6',
                        marginBottom: '16px',
                      }}>
                        Just ${monthlyEquiv}/month — Save 33%!
                      </div>
                    )}
                    <button
                      onClick={() => handleCheckout(price.id)}
                      disabled={checkoutLoading === price.id}
                      style={{
                        width: '100%',
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                        background: checkoutLoading === price.id ? '#333' : (isYearly
                          ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                          : 'linear-gradient(135deg, #7c3aed, #6d28d9)'),
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 20px',
                        cursor: checkoutLoading === price.id ? 'wait' : 'pointer',
                        letterSpacing: '1px',
                        transition: 'all 0.2s',
                        boxShadow: isYearly ? '0 4px 15px rgba(251,191,36,0.3)' : '0 4px 15px rgba(124,58,237,0.3)',
                      }}
                    >
                      {checkoutLoading === price.id ? 'Loading...' : 'START FREE TRIAL'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{
            marginTop: '24px',
            textAlign: 'center',
          }}>
            {!showPromo ? (
              <button
                onClick={() => setShowPromo(true)}
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#a78bfa',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                Have a promo code?
              </button>
            ) : (
              <div style={{
                background: 'rgba(124, 58, 237, 0.06)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: '12px',
                padding: '16px',
              }}>
                <div style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#a78bfa',
                  marginBottom: '10px',
                  letterSpacing: '1px',
                }}>
                  ENTER PROMO CODE
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && handlePromoRedeem()}
                    placeholder="e.g. MATH-XXXX-XXXX"
                    maxLength={20}
                    style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#fff',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      width: '180px',
                      textAlign: 'center',
                      letterSpacing: '2px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={handlePromoRedeem}
                    disabled={promoLoading || !promoCode.trim()}
                    style={{
                      fontFamily: "'Orbitron', sans-serif",
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#fff',
                      background: promoLoading ? '#333' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 18px',
                      cursor: promoLoading ? 'wait' : 'pointer',
                      letterSpacing: '1px',
                    }}
                  >
                    {promoLoading ? '...' : 'REDEEM'}
                  </button>
                </div>
                {promoMsg && (
                  <div style={{
                    marginTop: '10px',
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: '13px',
                    fontWeight: 600,
                    color: promoMsg.type === 'success' ? '#a5f3a6' : '#fca5a5',
                    padding: '8px 12px',
                    background: promoMsg.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    borderRadius: '8px',
                    border: `1px solid ${promoMsg.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    {promoMsg.text}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{
            marginTop: '16px',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            color: '#6b7280',
            textAlign: 'center',
          }}>
            Cancel anytime. Powered by Stripe secure payments.
          </div>
        </div>
      )}
    </div>
  )
}
