/**
 * upgradeMath.js
 *
 * Pure mathematical helpers for the idle-game upgrade curves used by the
 * decoupled GameEngine.  No React, no DOM, no side effects — everything here
 * is safe to call from a `requestAnimationFrame` tick, a Web Worker, or
 * a headless Node test runner.
 *
 * All exports are pure functions of their arguments.  That means two calls
 * with the same inputs always return the same output, which is what lets the
 * engine's delta-time loop stay deterministic across background-tab throttling
 * and across save/load.
 *
 * ─── Curves implemented ──────────────────────────────────────────────────────
 *  • `upgradeCost(base, level, rate = 1.15)`
 *      Exponential cost curve  `Cost = BaseCost × (rate ^ level)`.
 *      Rate of 1.15 is the genre-standard 15 %-per-level growth used by most
 *      AdVenture-Capitalist-style games.  Data-Bus loading uses rate=1.3 to
 *      stay consistent with the existing `INIT_BUS.loadingCost` tuning.
 *
 *  • `cumulativeUpgradeCost(base, fromLevel, qty, rate = 1.15)`
 *      Sum of `upgradeCost` for `qty` consecutive levels — used for "buy 10 /
 *      buy max" bulk-upgrade buttons.  Handled via closed-form geometric
 *      series when `rate ≠ 1` so "buy max" never melts the UI even at level
 *      thousands.
 *
 *  • `milestoneMultiplier(level, tiers = DEFAULT_MILESTONES)`
 *      Returns the *highest-tier* multiplier the level has crossed.  The
 *      default tiers match the persona spec:
 *          Lv  10 →  ×2
 *          Lv  25 →  ×5
 *          Lv  50 →  ×10
 *          Lv 100 →  ×50
 *      Unlike the legacy `milestoneMult` in GamePlayerPage (which *sums* a
 *      +1 per crossed tier for the existing UI tooltips), this returns the
 *      *peak* multiplier the player has earned.  The two live side-by-side so
 *      legacy balance is not disturbed; the new GameEngine uses the curve
 *      defined here.
 *
 *  • `effectiveThroughput(base, level, rate, tiers)`
 *      Convenience: `level × base × milestoneMultiplier(level)`, matching the
 *      existing `floorRCPS` formula but pulling the milestone curve from this
 *      module.
 *
 *  • `nextMilestone(level, tiers)` / `levelsUntilNextMilestone(level, tiers)`
 *      UI helpers for "next milestone" tooltips in observer components.
 */

/**
 * Default milestone tiers from the persona spec.
 *
 * Each entry is `{ at: <level threshold>, mult: <throughput multiplier> }`.
 * The list must be sorted ascending by `at`; `milestoneMultiplier` relies on
 * that invariant for its linear scan.
 *
 * @type {ReadonlyArray<{ at:number, mult:number }>}
 */
export const DEFAULT_MILESTONES = Object.freeze([
  { at: 10, mult: 2 },
  { at: 25, mult: 5 },
  { at: 50, mult: 10 },
  { at: 100, mult: 50 },
])

/**
 * Default exponential growth rate for upgrade costs.
 * 1.15 = +15 % per level (AdCap-style compound growth).
 */
export const DEFAULT_GROWTH_RATE = 1.15

/**
 * Exponential upgrade-cost curve.
 *
 *   `cost = ceil(base × rate^level)`
 *
 * Matches the legacy `calculateNextCost(baseCost, growthRate, currentLevel)`
 * exactly when `growthRate === rate`.
 *
 * @param {number} base   The Lv-0 base cost in the target currency.
 * @param {number} level  Current level (0-indexed).  Cost returned is for the
 *                        transition `level → level+1`.
 * @param {number} [rate] Compound-growth factor.  Defaults to 1.15.
 * @returns {number} Integer cost ≥ `base`.  Returns `Infinity` for non-finite
 *                   inputs so callers can guard against corrupt save data
 *                   without crashing the RAF loop.
 */
export function upgradeCost(base, level, rate = DEFAULT_GROWTH_RATE) {
  if (!Number.isFinite(base) || !Number.isFinite(level) || !Number.isFinite(rate)) {
    return Infinity
  }
  if (base <= 0) return 0
  const lvl = Math.max(0, Math.floor(level))
  return Math.ceil(base * Math.pow(rate, lvl))
}

/**
 * Sum of upgrade costs for the next `qty` consecutive levels.
 *
 * Uses the geometric-series closed form when `rate !== 1`:
 *
 *   Σ base × rate^(fromLevel + i)  for i in [0, qty)
 *       = base × rate^fromLevel × (rate^qty − 1) / (rate − 1)
 *
 * which keeps "buy max" O(1) even at level 10 000.
 *
 * @param {number} base       Lv-0 base cost.
 * @param {number} fromLevel  Current level (the first upgrade being priced is
 *                            `fromLevel → fromLevel+1`).
 * @param {number} qty        Number of upgrades to price.  Clamped to ≥ 0.
 * @param {number} [rate]     Compound-growth factor.  Defaults to 1.15.
 * @returns {number}          Integer total cost.
 */
export function cumulativeUpgradeCost(base, fromLevel, qty, rate = DEFAULT_GROWTH_RATE) {
  const n = Math.max(0, Math.floor(qty))
  if (n === 0) return 0
  if (!Number.isFinite(base) || !Number.isFinite(fromLevel) || !Number.isFinite(rate)) {
    return Infinity
  }
  const lvl = Math.max(0, Math.floor(fromLevel))
  if (rate === 1) return Math.ceil(base * n)
  const first = base * Math.pow(rate, lvl)
  const sum = first * (Math.pow(rate, n) - 1) / (rate - 1)
  return Math.ceil(sum)
}

/**
 * Returns the multiplier for the *highest* milestone tier that `level` has
 * crossed, or `1` if none have been crossed yet.
 *
 * Example with the default tiers:
 *
 *   level=  0 →  1
 *   level=  9 →  1
 *   level= 10 →  2
 *   level= 24 →  2
 *   level= 25 →  5
 *   level= 49 →  5
 *   level= 50 → 10
 *   level= 99 → 10
 *   level=100 → 50
 *   level=999 → 50   // no tier above 100 in the default curve
 *
 * @param {number} level
 * @param {ReadonlyArray<{at:number,mult:number}>} [tiers]
 *        Sorted-ascending milestone tiers.  Defaults to `DEFAULT_MILESTONES`.
 * @returns {number} The peak multiplier ≥ 1.
 */
export function milestoneMultiplier(level, tiers = DEFAULT_MILESTONES) {
  if (!Number.isFinite(level) || level < 0) return 1
  let mult = 1
  for (let i = 0; i < tiers.length; i++) {
    if (level >= tiers[i].at) mult = tiers[i].mult
    else break
  }
  return mult
}

/**
 * Effective per-level throughput including the milestone multiplier.
 *
 *   `effective = level × base × milestoneMultiplier(level, tiers)`
 *
 * Returns `0` for level 0 so unpurchased nodes contribute nothing.
 *
 * @param {number} base   Base throughput per level (e.g. RC/s per level).
 * @param {number} level  Current level.
 * @param {ReadonlyArray<{at:number,mult:number}>} [tiers]
 * @returns {number}
 */
export function effectiveThroughput(base, level, tiers = DEFAULT_MILESTONES) {
  const lvl = Math.max(0, Math.floor(level))
  if (lvl === 0) return 0
  return lvl * base * milestoneMultiplier(lvl, tiers)
}

/**
 * Returns the next milestone-tier threshold above `level`, or `null` if the
 * player has already crossed the final tier in `tiers`.
 *
 * @param {number} level
 * @param {ReadonlyArray<{at:number,mult:number}>} [tiers]
 * @returns {{ at:number, mult:number } | null}
 */
export function nextMilestone(level, tiers = DEFAULT_MILESTONES) {
  for (let i = 0; i < tiers.length; i++) {
    if (level < tiers[i].at) return tiers[i]
  }
  return null
}

/**
 * How many more levels until the next milestone tier, or `null` if there is
 * no higher tier left.  Useful for "⟶ 3 levels to ×10!" tooltips.
 *
 * @param {number} level
 * @param {ReadonlyArray<{at:number,mult:number}>} [tiers]
 * @returns {number | null}
 */
export function levelsUntilNextMilestone(level, tiers = DEFAULT_MILESTONES) {
  const m = nextMilestone(level, tiers)
  return m ? Math.max(0, m.at - level) : null
}
