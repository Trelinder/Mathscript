import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { claimDailyChest } from '../api/client'
import { formatLocalizedNumber } from '../utils/locale'

const FALLBACK_WORLDS = [
  { id: 'sky', name: 'Sky Citadel', unlock_quests: 0, emoji: '☁️', boss: 'Cloud Coder' },
  { id: 'jungle', name: 'Jungle of Numbers', unlock_quests: 3, emoji: '🌴', boss: 'Vine Vortex' },
  { id: 'volcano', name: 'Volcano Forge', unlock_quests: 7, emoji: '🌋', boss: 'Magma Max' },
  { id: 'cosmic', name: 'Cosmic Arena', unlock_quests: 12, emoji: '🌌', boss: 'Nova Null' },
]

const AGE_LABELS = {
  '5-7': 'Rookie Explorer',
  '8-10': 'Quest Adventurer',
  '11-13': 'Elite Strategist',
}

export default function WorldMap({ sessionId, session, profile, refreshSession, onStartQuest, onEditProfile }) {
  const panelRef = useRef(null)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (panelRef.current) {
      gsap.from(panelRef.current, { y: 26, opacity: 0, duration: 0.45, ease: 'power2.out' })
    }
  }, [])

  const questsCompleted = session?.progression?.quests_completed ?? session?.quests_completed ?? session?.history?.length ?? 0
  const streakCount = session?.streak_count || session?.progression?.streak_count || 1
  const worlds = useMemo(() => {
    if (session?.progression?.worlds?.length) return session.progression.worlds
    return FALLBACK_WORLDS.map((w) => ({ ...w, unlocked: questsCompleted >= w.unlock_quests }))
  }, [session?.progression?.worlds, questsCompleted])
  const learningPlan = session?.learning_plan || session?.progression?.learning_plan || null

  const badges = session?.badge_details || []
  const language = profile?.preferred_language || 'en'
  const today = new Date().toISOString().slice(0, 10)
  const chestClaimedToday = session?.daily_chest_last_claim === today

  const handleClaimChest = async () => {
    setClaiming(true)
    setMessage('')
    try {
      const res = await claimDailyChest(sessionId)
      setMessage(res?.message || (res?.claimed ? 'Chest opened!' : 'Chest already opened'))
      await refreshSession()
    } catch (err) {
      setMessage(err.message || 'Could not open chest right now')
    }
    setClaiming(false)
  }

  return (
    <div ref={panelRef} style={{
      minHeight: '100vh',
      maxWidth: '900px',
      margin: '0 auto',
      padding: '24px 20px 12px',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(37,99,235,0.12))',
        border: '1px solid rgba(124,58,237,0.35)',
        borderRadius: '16px',
        padding: '18px 18px 16px',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 'clamp(15px, 2.8vw, 22px)',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '1px',
            }}>
              Welcome, {profile?.player_name || 'Hero'}!
            </div>
            <div style={{
              marginTop: '6px',
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '14px',
              color: '#b9c4dd',
              fontWeight: 600,
            }}>
              Mode: {AGE_LABELS[profile?.age_group] || 'Quest Adventurer'} • Realm: {profile?.selected_realm || 'Sky Citadel'} • {(profile?.preferred_language || 'en').toUpperCase()}
            </div>
          </div>
          <button
            onClick={onEditProfile}
            className="mobile-secondary-btn"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              color: '#00d4ff',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.2)',
              borderRadius: '10px',
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            Edit Hero Setup
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '10px',
        marginBottom: '16px',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>QUESTS</div>
          <div style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(questsCompleted, language)}</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>STREAK</div>
          <div style={{ color: '#22c55e', fontSize: '24px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(streakCount, language)} 🔥</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>BADGES</div>
          <div style={{ color: '#a78bfa', fontSize: '24px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(badges.length, language)}</div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#7c8aa8', fontFamily: "'Orbitron', sans-serif", letterSpacing: '1px' }}>GOLD</div>
          <div style={{ color: '#fbbf24', fontSize: '24px', fontWeight: 800, fontFamily: "'Orbitron', sans-serif" }}>{formatLocalizedNumber(session?.coins || 0, language)}</div>
        </div>
      </div>

      {learningPlan && (
        <div style={{
          background: 'rgba(17,24,39,0.72)',
          border: '1px solid rgba(59,130,246,0.28)',
          borderRadius: '14px',
          padding: '14px',
          marginBottom: '14px',
        }}>
          <div style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '12px',
            letterSpacing: '1px',
            color: '#93c5fd',
            marginBottom: '8px',
          }}>
            PRACTICE PLAN
          </div>
          <div style={{
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '14px',
            color: '#dbeafe',
            fontWeight: 700,
            marginBottom: '8px',
          }}>
            Average mastery: {learningPlan.average_mastery || 0}%
          </div>
          {Array.isArray(learningPlan.recommended_rotation) && learningPlan.recommended_rotation.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '10px',
                color: '#60a5fa',
                letterSpacing: '1px',
                marginBottom: '4px',
              }}>
                NEXT SKILL ROTATION
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {learningPlan.recommended_rotation.map((item) => (
                  <div key={item.skill} style={{
                    padding: '4px 8px',
                    borderRadius: '999px',
                    border: '1px solid rgba(96,165,250,0.35)',
                    background: 'rgba(96,165,250,0.08)',
                    color: '#bfdbfe',
                    fontFamily: "'Rajdhani', sans-serif",
                    fontSize: '12px',
                    fontWeight: 700,
                  }}>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(learningPlan.due_review) && learningPlan.due_review.length > 0 && (
            <div style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: '13px',
              color: '#cbd5e1',
              fontWeight: 600,
            }}>
              Due for review: {learningPlan.due_review.map((item) => item.label).join(', ')}
            </div>
          )}
        </div>
      )}

      <div style={{
        background: 'rgba(17,24,39,0.7)',
        border: '1px solid rgba(124,58,237,0.25)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '14px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '13px',
          letterSpacing: '1.5px',
          color: '#00d4ff',
          marginBottom: '12px',
        }}>
          WORLD MAP
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {worlds.map((world) => (
            <div key={world.id} style={{
              border: `1px solid ${world.unlocked ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.12)'}`,
              background: world.unlocked ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
              borderRadius: '12px',
              padding: '10px 12px',
              opacity: world.unlocked ? 1 : 0.68,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ fontSize: '22px' }}>{world.emoji}</div>
                <div style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: '9px',
                  color: world.unlocked ? '#22c55e' : '#6b7280',
                  letterSpacing: '1px',
                }}>
                  {world.unlocked ? 'UNLOCKED' : `UNLOCK @ ${world.unlock_quests}`}
                </div>
              </div>
              <div style={{
                marginTop: '6px',
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '15px',
                color: '#e5e7eb',
                fontWeight: 700,
              }}>
                {world.name}
              </div>
              <div style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontSize: '12px',
                color: '#94a3b8',
                marginTop: '2px',
              }}>
                Boss: {world.boss}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: 'rgba(17,24,39,0.55)',
        border: '1px solid rgba(251,191,36,0.25)',
        borderRadius: '14px',
        padding: '14px',
        marginBottom: '16px',
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '12px',
          letterSpacing: '1px',
          color: '#fbbf24',
          marginBottom: '8px',
        }}>
          DAILY TREASURE CHEST
        </div>
        <div style={{
          fontFamily: "'Rajdhani', sans-serif",
          color: '#cbd5e1',
          fontSize: '14px',
          marginBottom: '10px',
        }}>
          Open your daily chest for bonus gold and keep your adventure streak alive.
        </div>
        <button
          onClick={handleClaimChest}
          disabled={claiming || chestClaimedToday}
          className="worldmap-chest-btn mobile-secondary-btn"
          style={{
            fontFamily: "'Orbitron', sans-serif",
            fontSize: '12px',
            fontWeight: 700,
            color: '#111827',
            background: chestClaimedToday ? '#6b7280' : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 18px',
            cursor: claiming || chestClaimedToday ? 'default' : 'pointer',
            letterSpacing: '1px',
          }}
        >
          {claiming ? 'OPENING...' : chestClaimedToday ? 'CHEST OPENED TODAY' : 'OPEN CHEST'}
        </button>
        {message && (
          <div role="status" aria-live="polite" style={{
            marginTop: '8px',
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: '13px',
            color: '#e2e8f0',
            fontWeight: 600,
          }}>
            {message}
          </div>
        )}
      </div>

      {badges.length > 0 && (
        <div style={{
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          {badges.map((badge) => (
            <div key={badge.id} style={{
              padding: '6px 10px',
              borderRadius: '999px',
              border: '1px solid rgba(167,139,250,0.35)',
              background: 'rgba(167,139,250,0.12)',
              color: '#ddd6fe',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Rajdhani', sans-serif",
            }}>
              {badge.emoji} {badge.name}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onStartQuest}
        className="worldmap-primary-btn mobile-primary-btn"
        style={{
          fontFamily: "'Orbitron', sans-serif",
          fontSize: '14px',
          fontWeight: 800,
          color: '#fff',
          background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
          border: 'none',
          borderRadius: '12px',
          padding: '14px 28px',
          cursor: 'pointer',
          letterSpacing: '1px',
          boxShadow: '0 6px 20px rgba(124,58,237,0.35)',
        }}
      >
        START NEXT QUEST
      </button>
    </div>
  )
}
