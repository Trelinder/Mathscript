/**
 * useManagerCooldown.js
 *
 * Custom hook and pure utility for Super Manager active-skill cooldown tracking.
 *
 * Encapsulates the state derived from a manager record's `skillActiveUntil`
 * and `skillCooldownUntil` timestamps so that any button component can
 * react to active / cooling / ready transitions without duplicating the
 * timestamp arithmetic.
 *
 * The hook subscribes to a 500 ms heartbeat tick so the UI remains
 * accurate without running on every animation frame.
 *
 * ─── Usage (hook form — standalone component) ────────────────────────────────
 *
 *   const { active, cooling, ready, cdRemMs, cdPct } =
 *     useManagerCooldown(mgr, MANAGER_SKILL_COOLDOWN_MS)
 *
 * ─── Usage (pure function — inside an already-ticking parent) ────────────────
 *
 *   // Call when the parent already re-renders on a 500 ms heartbeat.
 *   const cdState = computeManagerCooldown(mgr, MANAGER_SKILL_COOLDOWN_MS, nowMs)
 *
 * ─── Return values ────────────────────────────────────────────────────────────
 *
 *   active   — true while the skill window is open (skillActiveUntil > now)
 *   cooling  — true after the skill expires but before the cooldown ends
 *   ready    — true when neither active nor cooling (skill can be triggered)
 *   cdRemMs  — ms remaining in the cooldown (0 while active or ready)
 *   cdPct    — cooldown remaining as a 0–100 percentage (for progress bars)
 */

import { useState, useEffect } from 'react'

/**
 * computeManagerCooldown(mgr, cooldownMs, nowMs?)
 *
 * Pure function — can be called inside any render path without hooks.
 * Use this when the parent component already drives re-renders on a timer
 * (e.g. via a `skillTick` state in the parent).
 *
 * @param {object|null|undefined} mgr         — Manager record.
 * @param {number}                cooldownMs  — Total cooldown duration in ms.
 * @param {number}               [nowMs]      — Current timestamp (defaults to Date.now()).
 * @returns {{ active: boolean, cooling: boolean, ready: boolean, cdRemMs: number, cdPct: number }}
 */
export function computeManagerCooldown(mgr, cooldownMs, nowMs = Date.now()) {
  if (!mgr?.isHired) {
    return { active: false, cooling: false, ready: false, cdRemMs: 0, cdPct: 0 }
  }
  const active  = nowMs < (mgr.skillActiveUntil  ?? 0)
  const cooling = !active && nowMs < (mgr.skillCooldownUntil ?? 0)
  const cdRemMs = cooling ? Math.max(0, (mgr.skillCooldownUntil ?? 0) - nowMs) : 0
  const cdPct   = cooling && cooldownMs > 0 ? (cdRemMs / cooldownMs) * 100 : 0
  const ready   = !active && !cooling
  return { active, cooling, ready, cdRemMs, cdPct }
}

/**
 * useManagerCooldown(mgr, cooldownMs)
 *
 * React hook — drives its own 500 ms heartbeat tick so it works in any
 * standalone component without requiring a parent-level ticker.
 *
 * @param {object|null|undefined} mgr         — Manager record from game state.
 * @param {number}                cooldownMs  — Total cooldown duration in ms.
 * @returns {{ active: boolean, cooling: boolean, ready: boolean, cdRemMs: number, cdPct: number }}
 */
export function useManagerCooldown(mgr, cooldownMs) {
  // Heartbeat tick — updates every 500 ms so cooldown countdowns stay live.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  // Suppress lint warning: `tick` is intentionally only consumed to force
  // re-evaluation of Date.now() every 500 ms.
  void tick

  return computeManagerCooldown(mgr, cooldownMs)
}
