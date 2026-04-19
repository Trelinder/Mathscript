/**
 * GameEngineHud.jsx
 *
 * Additive, opt-in overlay that surfaces the vanilla `GameEngine` state
 * (Bank, ProduceNode, TransferBus, CompileServer) and exposes Upgrade
 * buttons that dispatch central mutations into `gameEngine`.
 *
 * Why "additive / opt-in"?
 * ------------------------
 * The existing React UI (`pages/GamePlayerPage.jsx`) still owns the
 * production game and renders its own Bank / floor / bus / compiler
 * widgets.  Per the Phase-3 scope lock we must NOT alter that layout or
 * CSS, so this HUD is gated on a URL query parameter (`?engineHud=1`)
 * and renders nothing by default.  Enabling the flag lets QA / devs
 * watch the decoupled engine tick alongside the legacy game and verify
 * the React ↔ Phaser bridge without disturbing the shipped UX.
 *
 * Subscription contract
 * ---------------------
 * Each slice is selected with `useGameEngine(selector, shallowEqual)` so
 * the component re-renders strictly when the selected subtree changes
 * (see `hooks/useGameEngine.js`).  The Bank value ticking every frame
 * does trigger a render — that's the point of the HUD — but it does NOT
 * force sibling React components to reconcile because `useGameEngine`
 * only walks the subscriber list for components that selected a slice
 * whose identity actually changed.
 */

import { useMemo } from 'react'

import { gameEngine, NODE_IDS } from '../game/GameEngine.js'
import { shallowEqual, useGameEngine } from '../hooks/useGameEngine.js'

/**
 * Read `?engineHud=1` from the current URL.  Returns `false` on the
 * server or if `window.location` is unavailable.
 */
function isHudEnabled() {
  if (typeof window === 'undefined' || !window.location) return false
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('engineHud') === '1'
  } catch {
    return false
  }
}

/** Fixed-position container so the HUD overlays existing UI without layout shifts. */
const HUD_STYLE = {
  position: 'fixed',
  right: 12,
  bottom: 12,
  zIndex: 9999,
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(10, 14, 26, 0.92)',
  border: '1px solid rgba(124, 58, 237, 0.45)',
  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
  color: '#e8e8f0',
  fontFamily: "'Rajdhani', 'Inter', sans-serif",
  fontSize: 12,
  minWidth: 240,
  pointerEvents: 'auto',
}

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '4px 0',
}

const BTN_STYLE = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(0, 212, 255, 0.45)',
  background: 'rgba(0, 212, 255, 0.12)',
  color: '#8dd8f8',
  fontFamily: 'inherit',
  fontSize: 11,
  cursor: 'pointer',
}

const BTN_DISABLED_STYLE = {
  ...BTN_STYLE,
  borderColor: 'rgba(148, 163, 184, 0.35)',
  background: 'rgba(148, 163, 184, 0.08)',
  color: '#64748b',
  cursor: 'not-allowed',
}

/** Compact money formatter — intentionally local to avoid pulling the
 *  heavyweight `formatBigNumber` util into this dev overlay. */
function fmtCoins(n) {
  const v = Number(n) || 0
  if (v < 1000) return v.toFixed(0)
  if (v < 1e6)  return (v / 1e3).toFixed(2) + 'K'
  if (v < 1e9)  return (v / 1e6).toFixed(2) + 'M'
  return (v / 1e9).toFixed(2) + 'B'
}

/**
 * Render one row with a node's level + Upgrade button.  The button is
 * disabled (not just styled) when the bank can't cover the next level
 * so keyboard activation respects affordability too.
 */
function NodeRow({ label, nodeId, bankCoins }) {
  // Select only `level` so typing in the Bank doesn't re-render this row.
  const level = useGameEngine(
    (s) => s[nodeId]?.level ?? 0,
  )
  // The component re-renders whenever `level` changes (selector above),
  // so a direct call is cheap and memoisation would be redundant.
  const cost = gameEngine.getUpgradeCost(nodeId)
  const canAfford = bankCoins >= cost

  return (
    <div style={ROW_STYLE}>
      <span>
        <strong>{label}</strong> · Lv {level}
      </span>
      <button
        type="button"
        style={canAfford ? BTN_STYLE : BTN_DISABLED_STYLE}
        disabled={!canAfford}
        onClick={() => gameEngine.dispatch({ type: 'UPGRADE', node: nodeId })}
      >
        Upgrade · ${fmtCoins(cost)}
      </button>
    </div>
  )
}

/**
 * The top-level HUD.  Renders `null` unless `?engineHud=1` is present
 * in the URL, so this component is a no-op in production URLs.
 */
export default function GameEngineHud() {
  const enabled = useMemo(() => isHudEnabled(), [])
  // Subscribe to the bank slice with `shallowEqual` so non-coin changes
  // (e.g. `lastUpdateTs` stamped every frame) don't trigger extra renders
  // — only movement in `coins` or `lifetime` does.
  const bank = useGameEngine(
    (s) => ({ coins: s.bank.coins, lifetime: s.bank.lifetime }),
    shallowEqual,
  )

  if (!enabled) return null

  return (
    <div style={HUD_STYLE} data-testid="game-engine-hud">
      <div style={{ ...ROW_STYLE, borderBottom: '1px solid rgba(124,58,237,0.25)', paddingBottom: 6, marginBottom: 4 }}>
        <strong style={{ letterSpacing: 1 }}>GAME ENGINE</strong>
        <span style={{ color: '#8dd8f8' }}>${fmtCoins(bank.coins)}</span>
      </div>
      <NodeRow label="Produce" nodeId={NODE_IDS.PRODUCE} bankCoins={bank.coins} />
      <NodeRow label="Bus"     nodeId={NODE_IDS.BUS}     bankCoins={bank.coins} />
      <NodeRow label="Compile" nodeId={NODE_IDS.COMPILE} bankCoins={bank.coins} />
      <div style={{ ...ROW_STYLE, paddingTop: 6, color: '#94a3b8' }}>
        <span>Lifetime</span>
        <span>${fmtCoins(bank.lifetime)}</span>
      </div>
      <div style={ROW_STYLE}>
        <button
          type="button"
          style={BTN_STYLE}
          onClick={() => gameEngine.dispatch({ type: 'TAP_PRODUCE', amount: 1 })}
        >
          Tap Produce
        </button>
        <button
          type="button"
          style={BTN_DISABLED_STYLE}
          onClick={() => gameEngine.dispatch({ type: 'RESET' })}
        >
          Reset
        </button>
      </div>
    </div>
  )
}
