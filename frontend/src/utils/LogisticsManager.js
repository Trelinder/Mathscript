/**
 * LogisticsManager.js — Sub-currency tracking for the multi-step production chain.
 *
 * The production chain has two tiers:
 *   T1 floors  →  produce Raw Materials (RM) into this pool
 *   T2 floors  →  consume RM from this pool each cycle, then output RC
 *
 * This module is a plain stateful object — no React, no Phaser.
 * GamePlayerPage creates one instance via `createLogisticsManager()` and holds
 * it in a ref.  The BehaviorTree reads `ctx.rawMaterialPool` (a number reference
 * injected by the scene) so NPCs can pause without importing this module.
 *
 * Public API
 * ──────────
 *   manager.add(amount)        — T1 floor deposits RM into the pool.
 *   manager.consume(amount)    — T2 floor tries to withdraw RM.
 *                                Returns true when successful (pool had enough),
 *                                false when the pool was empty (T2 cycle blocked).
 *   manager.get()              — Returns current pool value (read-only snapshot).
 *   manager.reset()            — Resets pool to 0 (used on Prime Refactor prestige).
 */

/**
 * Maximum raw materials that can accumulate in the pool.
 * Prevents unbounded growth when T1 floors run far ahead of T2 consumption.
 * Set to 10× the T2 count so a healthy run can buffer ~10 full T2 cycles.
 */
export const RM_POOL_MAX = 40

/**
 * Create a new LogisticsManager instance.
 *
 * @returns {{ add: (n:number)=>void, consume: (n:number)=>boolean, get: ()=>number, reset: ()=>void }}
 */
export function createLogisticsManager() {
  let _pool = 0

  return {
    /**
     * Add Raw Materials to the pool (T1 production output).
     * @param {number} amount — must be ≥ 0
     */
    add(amount) {
      if (amount <= 0) return
      _pool = Math.min(_pool + amount, RM_POOL_MAX)
    },

    /**
     * Attempt to withdraw Raw Materials from the pool (T2 consumption).
     * @param {number} amount — units required (typically RM_COST_PER_CYCLE)
     * @returns {boolean} true when the pool had enough and was debited, false otherwise
     */
    consume(amount) {
      if (amount <= 0) return true   // zero-cost consume always succeeds
      if (_pool < amount) return false
      _pool = parseFloat((_pool - amount).toFixed(4))
      return true
    },

    /**
     * Read current pool value.
     * @returns {number}
     */
    get() {
      return _pool
    },

    /**
     * Reset the pool to zero (called on prestige / hard reset).
     */
    reset() {
      _pool = 0
    },
  }
}
