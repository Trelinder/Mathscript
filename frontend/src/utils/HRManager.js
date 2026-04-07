/**
 * HRManager.js
 *
 * HR data model for the NPC management meta-layer.
 *
 * Each isometric worker NPC has three individual attributes:
 *
 *   skillLevel       — float multiplier applied to the mood-multiplier range,
 *                      so that high-skill NPCs still produce more even at low
 *                      mood.  Range 0.5–1.2 across the seven floors.
 *
 *   expectedSalary   — one-time dollar cost to perform a salary raise action
 *                      that instantly restores the NPC's mood to 1.0.  Scales
 *                      with floor complexity so late-game raises are expensive.
 *
 *   mood             — float 0–1 tracked per-NPC in GamePlayerPage state.
 *                      1.0 = fully happy, 0.0 = completely demoralized.
 *                      Never stored in WORKER_DEFS — it is live runtime state
 *                      held in the React npcMoods map.
 *
 * ─── Mood decay triggers ─────────────────────────────────────────────────────
 *
 *   MOOD_DECAY_BASE          — constant background decay (per second).
 *   MOOD_DECAY_OVERTIME      — extra decay added when the floor's manager is
 *                              hired (auto-production = non-stop overtime).
 *   MOOD_DECAY_NEGLECT       — extra decay added when the HR infrastructure
 *                              room has not been upgraded above level 1
 *                              (no usable amenity rooms → needs never restored).
 *
 * Decay runs exclusively inside the React master tick (100 ms / 10 TPS) and
 * is therefore tied to delta-time — it is fully independent of the Phaser
 * visual rendering loop.
 *
 * ─── Output multiplier ───────────────────────────────────────────────────────
 *
 *   computeMoodMultiplier(mood) maps mood ∈ [0, 1] → [0.5, 1.0] linearly:
 *
 *     multiplier = 0.5 + mood * 0.5
 *
 *   A fully demoralized NPC still contributes 50 % of their normal output,
 *   keeping the floor economically viable while creating a meaningful
 *   incentive to raise salaries.
 *
 * ─── Animation speed ─────────────────────────────────────────────────────────
 *
 *   IsoTycoonScene subscribes to the `npc:mood` GameEventBus event emitted
 *   by GamePlayerPage whenever any mood value changes, and sets:
 *
 *     sprite.anims.timeScale = computeMoodMultiplier(mood)
 *
 *   so that slow, slouchy animations visually signal worker unhappiness.
 */

import { FLOORS } from './EconomyEngine.js'

// ─── Mood-decay constants (per second) ───────────────────────────────────────

/** Background mood decay every second while the building is open. */
export const MOOD_DECAY_BASE = 0.003

/**
 * Extra decay when the floor's manager is hired (auto-production = overtime).
 * Combined with MOOD_DECAY_BASE gives ~0.007/s → full decay in ~143 s.
 */
export const MOOD_DECAY_OVERTIME = 0.004

/**
 * Extra decay when the HR infrastructure room is at level 1 (no amenities
 * upgraded → worker needs are never properly serviced).
 * Combined with base+overtime gives ~0.013/s → full decay in ~77 s.
 */
export const MOOD_DECAY_NEGLECT = 0.006

/** The HR room must be upgraded above this level to avoid the neglect penalty. */
export const AMENITY_LEVEL_THRESHOLD = 1

// ─── WORKER_DEFS ─────────────────────────────────────────────────────────────

/**
 * One entry per FLOORS index (floor 0–6).
 *
 * Fields:
 *   wsId            — workstation identifier (mirrors FLOORS[i].id)
 *   heroName        — NPC display name (mirrors FLOORS[i].hero)
 *   skillLevel      — float 0.5–1.2; higher floors get more skilled workers
 *   expectedSalary  — one-time dollar cost to restore this NPC's mood to 1.0
 */
export const WORKER_DEFS = FLOORS.map((floor, i) => {
  // Skill levels scale linearly across the 7 floors: 0.5, 0.6 … 1.2
  const skillLevel = parseFloat((0.5 + i * (0.7 / (FLOORS.length - 1))).toFixed(2))

  // Salary raise costs increase exponentially to match each floor's economy
  const RAISE_COSTS = [100, 500, 2_500, 15_000, 100_000, 750_000, 5_000_000]

  return {
    wsId:           floor.id,
    heroName:       floor.hero,
    skillLevel,
    expectedSalary: RAISE_COSTS[i] ?? 100,
  }
})

/**
 * O(1) lookup map: wsId → WORKER_DEF entry.
 * @type {Map<string, {wsId:string, heroName:string, skillLevel:number, expectedSalary:number}>}
 */
export const WORKER_DEFS_MAP = new Map(WORKER_DEFS.map(d => [d.wsId, d]))

// ─── Pure helper functions ────────────────────────────────────────────────────

/**
 * Maps a mood value in [0, 1] to an output/animation multiplier in [0.5, 1.0].
 *
 * Formula:  multiplier = 0.5 + clamp(mood, 0, 1) * 0.5
 *
 * Examples:
 *   computeMoodMultiplier(1.0) → 1.00  (happy)
 *   computeMoodMultiplier(0.5) → 0.75  (neutral)
 *   computeMoodMultiplier(0.0) → 0.50  (demoralized)
 *
 * @param {number} mood  Current mood float (0–1).
 * @returns {number}     Output multiplier (0.5–1.0).
 */
export function computeMoodMultiplier(mood) {
  const clamped = Math.max(0, Math.min(1, mood))
  return 0.5 + clamped * 0.5
}

/**
 * Calculates the per-second mood decay rate for a specific NPC based on their
 * current working conditions.
 *
 * @param {{ isOvertime: boolean, hasNeglectedAmenities: boolean }} conditions
 * @returns {number}  Total mood decay per second.
 */
export function getMoodDecayRate({ isOvertime = false, hasNeglectedAmenities = false } = {}) {
  return MOOD_DECAY_BASE
    + (isOvertime          ? MOOD_DECAY_OVERTIME : 0)
    + (hasNeglectedAmenities ? MOOD_DECAY_NEGLECT  : 0)
}

/**
 * Returns the dollar cost for a salary raise action for the given workstation.
 * Returns 0 for unknown wsIds (safe fallback).
 *
 * @param {string} wsId  Workstation identifier.
 * @returns {number}
 */
export function computeSalaryRaiseCost(wsId) {
  return WORKER_DEFS_MAP.get(wsId)?.expectedSalary ?? 0
}
