/**
 * PrerequisiteManager.js — Visibility filter layer for gated upgrade contracts.
 *
 * This module is a **pure visibility filter** — it never mutates costs, multipliers,
 * or any economy value.  It answers a single question per upgrade key:
 * "Has the player met the conditions required to see this upgrade?"
 *
 * ─── Upgrade Keys ────────────────────────────────────────────────────────────
 *
 *   Data Bus upgrades
 *     'bus:capacity'      — always unlocked (starter upgrade, always visible)
 *     'bus:speed'         — unlocked once bus carry-capacity level ≥ 5
 *     'bus:loadingSpeed'  — unlocked once bus speed level ≥ 5
 *
 *   Sales Office (Compiler) upgrades
 *     'compiler:batch'    — always unlocked (starter upgrade, always visible)
 *     'compiler:proc'     — unlocked once any T1 floor (indices 0–2) reaches level 10
 *     'compiler:conv'     — unlocked once any T2 floor (indices 3–6) reaches level 10
 *
 * ─── Game State snapshot ─────────────────────────────────────────────────────
 *
 * `evaluatePrerequisites(gameState)` accepts a plain snapshot object:
 *
 *   gameState.bus        — { capacityLevel: number, speedLevel: number, loadingLevel: number }
 *   gameState.floors     — Array<{ level: number }>   (same order as EconomyEngine.FLOORS)
 *   gameState.claimedTokens — number  (prime refactor tokens; reserved for future conditions)
 *
 * Returns a plain object (Record<upgradeKey, boolean>) mapping each key to
 * whether it should be visible in the UI.  Keys that are always visible return
 * `true` unconditionally so the rendering layer never needs special-cases.
 */

/**
 * The full prerequisite map.
 * Each entry is a function (gameState) => boolean.
 * Return true  → upgrade row visible.
 * Return false → upgrade row hidden (prerequisite not yet met).
 */
export const PREREQUISITE_MAP = {
  // ── Data Bus ──────────────────────────────────────────────────────────────
  /** Always visible — first upgrade players encounter. */
  'bus:capacity': () => true,

  /**
   * MOVEMENT SPEED
   * Rationale: players should level their carry capacity a few times before
   * worrying about trip frequency, so the speed knob appears at cap-level 5.
   */
  'bus:speed': ({ bus }) => (bus?.capacityLevel ?? 0) >= 5,

  /**
   * LOADING SPEED
   * Rationale: loading delay only meaningfully matters once the bus is already
   * making frequent trips, so reveal it after speed has been upgraded 5 times.
   */
  'bus:loadingSpeed': ({ bus }) => (bus?.speedLevel ?? 0) >= 5,

  // ── Sales Office (Compiler) ───────────────────────────────────────────────
  /** Always visible — first upgrade players encounter in the compiler panel. */
  'compiler:batch': () => true,

  /**
   * PROCESSING SPEED
   * Rationale: finer batch timing only rewards players who have built up a
   * meaningful T1 supply chain.  Reveal when the first T1 floor (spell-lab,
   * battle-dojo, or moon-studio; indices 0–2) has been levelled to 10.
   */
  'compiler:proc': ({ floors }) => {
    const T1_MAX_IDX = 2   // indices 0, 1, 2 are T1 floors
    return (floors ?? []).some((f, i) => i <= T1_MAX_IDX && (f.level ?? 0) >= 10)
  },

  /**
   * CONVERSION RATE
   * Rationale: the conversion multiplier is a "late game" lever that rewards
   * players who have unlocked and levelled a T2 processing floor (indices 3–6)
   * up to level 10, confirming they understand the full production chain.
   */
  'compiler:conv': ({ floors }) => {
    const T2_MIN_IDX = 3   // indices 3, 4, 5, 6 are T2 floors
    return (floors ?? []).some((f, i) => i >= T2_MIN_IDX && (f.level ?? 0) >= 10)
  },
}

/**
 * Evaluate all prerequisites against the current game state.
 *
 * @param {{ bus: object, floors: Array, claimedTokens?: number }} gameState
 * @returns {Record<string, boolean>} — map of upgradeKey → isUnlocked
 */
export function evaluatePrerequisites(gameState) {
  const result = {}
  for (const [key, condFn] of Object.entries(PREREQUISITE_MAP)) {
    result[key] = condFn(gameState)
  }
  return result
}

/**
 * Check whether a single upgrade key is unlocked for the given game state.
 * Useful for ad-hoc checks outside the full evaluate cycle.
 *
 * @param {string} key — one of the keys in PREREQUISITE_MAP
 * @param {{ bus: object, floors: Array }} gameState
 * @returns {boolean}
 */
export function isUpgradeUnlocked(key, gameState) {
  const condFn = PREREQUISITE_MAP[key]
  if (!condFn) return true   // unknown keys are treated as unlocked (future-proof)
  return condFn(gameState)
}

/**
 * Returns the array of upgrade keys that changed from locked → unlocked
 * between two evaluation results.  Used to drive "New Upgrade Available!" toasts.
 *
 * @param {Record<string,boolean>} prev — previous evaluation result
 * @param {Record<string,boolean>} next — current evaluation result
 * @returns {string[]} — keys that are newly unlocked
 */
export function getNewlyUnlocked(prev, next) {
  return Object.keys(next).filter(k => !prev[k] && next[k])
}
