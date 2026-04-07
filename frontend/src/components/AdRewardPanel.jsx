/**
 * AdRewardPanel.jsx — Right-side collapsible panel with rewarded-ad slots
 *                     and an IAP shop trigger.
 *
 * Slots
 * ─────
 *   📺 2× INCOME   — delegates to the existing commercial-contract flow via
 *                     the onContractAd callback; hidden while a contract is
 *                     already active or a cooldown is running.
 *   ⚡ SPEED BOOST  — 2× production speed for SPEED_BOOST_DURATION_MS; own
 *                     per-session cooldown tracked internally.
 *   📦 SUPPLY DROP  — instantly fills the Raw Materials pool; own per-session
 *                     cooldown tracked internally.
 *
 * Props
 * ─────
 *   onContractAd()        — called when the player clicks the 2× Income slot;
 *                           the caller handles showRewardedAd() internally.
 *   onSpeedBoostAd()      — called when the player clicks the Speed Boost slot;
 *                           the caller handles showRewardedAd() internally.
 *   onSupplyDropAd()      — called when the player clicks the Supply Drop slot;
 *                           the caller handles showRewardedAd() internally.
 *   onOpenShop()          — called when the player clicks the 💎 SHOP button.
 *   contractSlotHidden    — bool; hide the 2× slot (contract already active /
 *                           cooldown running).
 *   speedBoostActive      — bool; true while a speed boost is already running.
 *   speedBoostSecsLeft    — int; seconds remaining on the speed boost.
 *   isMobile              — bool
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { showRewardedAd } from '../utils/MonetizationHooks'

// Per-slot cooldowns (ms)
const SPEED_BOOST_SLOT_CD_MS  = 5 * 60 * 1000   // 5 min
const SUPPLY_DROP_SLOT_CD_MS  = 4 * 60 * 1000   // 4 min

// ─── small helpers ──────────────────────────────────────────────────────────
function fmtSecs(ms) {
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60 ? `${s % 60}s` : ''}`
}

function useCountdown(endsAt) {
  const [secsLeft, setSecsLeft] = useState(0)
  useEffect(() => {
    function tick() {
      const rem = endsAt - Date.now()
      setSecsLeft(rem > 0 ? Math.ceil(rem / 1000) : 0)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [endsAt])
  return secsLeft
}

// ─── single reward slot ─────────────────────────────────────────────────────
function RewardSlot({
  icon, label, sublabel,
  cooldownEndsAt,     // timestamp ms; 0 = ready
  activeEndsAt,       // timestamp ms; 0 = not active
  activeLabel,        // text shown while active (e.g. "2:30 left")
  disabled,           // bool — e.g. hide the slot entirely
  onWatch,
  cdTotalMs,          // total cooldown ms (for the fill bar)
}) {
  const cdSecsLeft     = useCountdown(cooldownEndsAt)
  const activeSecsLeft = useCountdown(activeEndsAt)
  const isOnCd     = cdSecsLeft > 0
  const isActive   = activeSecsLeft > 0
  const cdFraction = isOnCd ? Math.min(1, (cooldownEndsAt - Date.now()) / cdTotalMs) : 0
  const [pressing, setPressing] = useState(false)

  if (disabled) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      width: '100%',
    }}>
      {/* Active indicator */}
      {isActive && (
        <div style={{
          fontFamily: "'Orbitron',monospace", fontSize: 7, color: '#4ade80',
          letterSpacing: '.5px', textAlign: 'center', lineHeight: 1.2,
          animation: 'adpanel-pulse 1.2s ease-in-out infinite',
        }}>
          {activeLabel ?? `${activeSecsLeft}s`}
        </div>
      )}

      {/* Main watch button */}
      <button
        aria-label={`Watch ad: ${label}`}
        onClick={isOnCd || isActive ? undefined : onWatch}
        onMouseDown={() => !isOnCd && !isActive && setPressing(true)}
        onMouseUp={() => setPressing(false)}
        onMouseLeave={() => setPressing(false)}
        style={{
          width: 46, height: 46,
          background: isActive
            ? 'linear-gradient(135deg,#14532d,#16a34a)'
            : isOnCd
              ? 'linear-gradient(135deg,#1e293b,#1e293b)'
              : 'linear-gradient(135deg,#1e3a5f,#1a3050)',
          border: `2px solid ${isActive ? '#22c55e' : isOnCd ? '#334155' : '#3b82f6'}`,
          borderRadius: 12,
          cursor: isOnCd || isActive ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 1,
          boxShadow: isActive
            ? '0 0 12px rgba(34,197,94,.45)'
            : isOnCd ? 'none'
            : '0 0 10px rgba(59,130,246,.25)',
          transform: pressing ? 'translateY(2px) scale(0.95)' : 'none',
          transition: 'transform 80ms',
          opacity: isOnCd ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        {isOnCd && (
          <span style={{
            fontFamily: "'Orbitron',monospace", fontSize: 6, color: '#64748b',
            letterSpacing: '.3px',
          }}>{fmtSecs(cdSecsLeft * 1000)}</span>
        )}
        {!isOnCd && !isActive && (
          <span style={{
            fontFamily: "'Orbitron',monospace", fontSize: 5.5, color: '#93c5fd',
            letterSpacing: '.3px',
          }}>WATCH</span>
        )}
      </button>

      {/* Cooldown fill bar */}
      {isOnCd && (
        <div style={{
          width: 40, height: 3, background: '#1e293b', borderRadius: 3, overflow: 'hidden',
        }}>
          <div style={{
            width: `${(1 - cdFraction) * 100}%`,
            height: '100%',
            background: '#3b82f6',
            borderRadius: 3,
            transition: 'width .5s linear',
          }} />
        </div>
      )}

      {/* Label */}
      <div style={{
        fontFamily: "'Orbitron',monospace", fontSize: 6, color: '#94a3b8',
        letterSpacing: '.3px', textAlign: 'center', lineHeight: 1.3,
        whiteSpace: 'pre-line',
      }}>{sublabel ?? label}</div>
    </div>
  )
}

// ─── panel component ─────────────────────────────────────────────────────────
export default function AdRewardPanel({
  onContractAd,
  onSpeedBoostAd,
  onSupplyDropAd,
  onOpenShop,
  contractSlotHidden = false,
  speedBoostActive = false,
  speedBoostSecsLeft = 0,
  isMobile = false,
}) {
  const [expanded, setExpanded]       = useState(!isMobile)
  const [speedCdEndsAt, setSpeedCdEndsAt] = useState(0)
  const [dropCdEndsAt,  setDropCdEndsAt]  = useState(0)
  // Speed boost active timer tracked here too for the slot active bar
  const [speedActiveEndsAt, setSpeedActiveEndsAt] = useState(0)

  // Keep speedActiveEndsAt in sync when caller says boost became active
  const prevSpeedActive = useRef(false)
  useEffect(() => {
    if (speedBoostActive && !prevSpeedActive.current) {
      setSpeedActiveEndsAt(Date.now() + speedBoostSecsLeft * 1000)
    }
    if (!speedBoostActive) {
      setSpeedActiveEndsAt(0)
    }
    prevSpeedActive.current = speedBoostActive
  }, [speedBoostActive, speedBoostSecsLeft])

  const handleSpeedWatch = useCallback(async () => {
    const { rewarded } = await showRewardedAd()
    if (!rewarded) return
    setSpeedCdEndsAt(Date.now() + SPEED_BOOST_SLOT_CD_MS)
    onSpeedBoostAd?.()
  }, [onSpeedBoostAd])

  const handleDropWatch = useCallback(async () => {
    const { rewarded } = await showRewardedAd()
    if (!rewarded) return
    setDropCdEndsAt(Date.now() + SUPPLY_DROP_SLOT_CD_MS)
    onSupplyDropAd?.()
  }, [onSupplyDropAd])

  const handleContractWatch = useCallback(async () => {
    // The parent manages showRewardedAd internally for the contract flow
    onContractAd?.()
  }, [onContractAd])

  const panelW = expanded ? 62 : 22

  return (
    <div
      style={{
        position: 'fixed',
        right: 0,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 7500,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'auto',
      }}
    >
      {/* Collapse / expand tab */}
      <button
        aria-label={expanded ? 'Collapse ad panel' : 'Expand ad panel'}
        onClick={() => setExpanded(v => !v)}
        style={{
          width: 16,
          height: 56,
          background: 'linear-gradient(180deg,#1e3a5f,#0d1520)',
          border: '2px solid #2563eb',
          borderRight: 'none',
          borderRadius: '8px 0 0 8px',
          color: '#60a5fa',
          fontSize: 9,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '-4px 0 16px rgba(37,99,235,.2)',
        }}
      >
        {expanded ? '▶' : '◀'}
      </button>

      {/* Panel body */}
      <div style={{
        width: panelW,
        overflow: 'hidden',
        transition: 'width 220ms ease',
        background: 'linear-gradient(180deg,#0d1520 0%,#111c2e 100%)',
        border: '2px solid #1e3a5f',
        borderLeft: 'none',
        borderRadius: '0 12px 12px 0',
        boxShadow: '4px 0 24px rgba(0,0,0,.55)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 10,
        padding: expanded ? '10px 7px' : '0',
        opacity: expanded ? 1 : 0,
        pointerEvents: expanded ? 'auto' : 'none',
      }}>
        {/* Header */}
        <div style={{
          fontFamily: "'Orbitron',monospace", fontSize: 6, fontWeight: 900,
          color: '#3b82f6', letterSpacing: '1px', textAlign: 'center', whiteSpace: 'nowrap',
          borderBottom: '1px solid #1e3a5f', paddingBottom: 6, width: '100%',
        }}>
          📡 BOOSTS
        </div>

        {/* Slot 1 — 2× Income contract */}
        <RewardSlot
          icon="📺"
          label="2× INCOME"
          sublabel={'2×\nINCOME'}
          cooldownEndsAt={0}
          activeEndsAt={0}
          disabled={contractSlotHidden}
          onWatch={handleContractWatch}
          cdTotalMs={5 * 60 * 1000}
        />

        {/* Slot 2 — Speed Boost */}
        <RewardSlot
          icon="⚡"
          label="SPEED BOOST"
          sublabel={'SPEED\nBOOST'}
          cooldownEndsAt={speedCdEndsAt}
          activeEndsAt={speedActiveEndsAt}
          activeLabel={`${speedBoostSecsLeft}s`}
          disabled={false}
          onWatch={handleSpeedWatch}
          cdTotalMs={SPEED_BOOST_SLOT_CD_MS}
        />

        {/* Slot 3 — Supply Drop */}
        <RewardSlot
          icon="📦"
          label="SUPPLY DROP"
          sublabel={'SUPPLY\nDROP'}
          cooldownEndsAt={dropCdEndsAt}
          activeEndsAt={0}
          disabled={false}
          onWatch={handleDropWatch}
          cdTotalMs={SUPPLY_DROP_SLOT_CD_MS}
        />

        {/* Divider */}
        <div style={{ width: '80%', height: 1, background: '#1e3a5f' }} />

        {/* IAP shop button */}
        <button
          aria-label="Open IAP shop"
          onClick={onOpenShop}
          style={{
            width: 46, height: 46,
            background: 'linear-gradient(135deg,#312e81,#4338ca)',
            border: '2px solid #818cf8',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 2,
            boxShadow: '0 0 12px rgba(129,140,248,.35)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>💎</span>
          <span style={{
            fontFamily: "'Orbitron',monospace", fontSize: 5.5, color: '#c7d2fe',
            letterSpacing: '.3px',
          }}>SHOP</span>
        </button>
      </div>

      {/* CSS keyframes injected inline so the component is self-contained */}
      <style>{`
        @keyframes adpanel-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
      `}</style>
    </div>
  )
}
