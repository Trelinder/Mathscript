/**
 * MascotSystem.js — Passive income pet catalogue and multiplier math.
 *
 * This module is a **pure data layer** — zero Phaser imports, zero React
 * imports, zero side-effects.  It answers two questions:
 *
 *   1. What pets exist and what are their multipliers?
 *   2. Given a set of active pet IDs, what is the combined multiplier?
 *
 * The multiplier is cleanly separated so it can be safely removed or
 * stacked whenever multiple pets are active simultaneously.
 *
 * ─── Pet Data ────────────────────────────────────────────────────────────────
 *
 * Each entry in PET_DEFS has the following shape:
 *
 *   id         — unique key (used to activate/deactivate the pet)
 *   name       — display name shown in the shop / HUD
 *   emoji      — single emoji icon used as a simple sprite fallback
 *   tint       — Phaser integer tint applied to the hero_iso spritesheet
 *   multiplier — passive income factor (e.g. 1.05 = +5% all building income)
 *   cost       — coin cost to purchase (informational — not enforced here)
 *
 * ─── Multiplier formula ──────────────────────────────────────────────────────
 *
 * All active pets contribute multiplicatively:
 *
 *   combinedMultiplier = product of (pet.multiplier for each active pet)
 *
 * Example: Orange Cat (×1.05) + Dog (×1.08) = ×1.134 combined.
 *
 * An empty active set returns exactly 1.0 (identity — no change to income).
 */

/**
 * Catalogue of all purchasable pets.
 * Add new entries here to extend the system; the multiplier logic is automatic.
 *
 * @type {Array<{id:string, name:string, emoji:string, tint:number, multiplier:number, cost:number}>}
 */
export const PET_DEFS = [
  {
    id:         'orange_cat',
    name:       'Orange Cat',
    emoji:      '🐱',
    tint:       0xff8c00,   // deep orange — visible against the dark office palette
    multiplier: 1.05,       // +5% all building income
    cost:       500,
  },
  {
    id:         'dog',
    name:       'Office Dog',
    emoji:      '🐶',
    tint:       0xc8a97e,   // warm tan
    multiplier: 1.08,       // +8% all building income
    cost:       1200,
  },
]

/**
 * Lookup map for O(1) pet resolution.
 * @type {Map<string, typeof PET_DEFS[0]>}
 */
export const PET_DEFS_MAP = new Map(PET_DEFS.map(p => [p.id, p]))

/**
 * Compute the combined passive income multiplier for a set of active pets.
 *
 * All active pets stack multiplicatively.  Unknown IDs are silently ignored
 * (future-proof: a saved pet that was removed from PET_DEFS won't crash).
 *
 * @param {string[]} activePetIds — array of pet IDs currently active
 * @returns {number} — combined multiplier ≥ 1.0
 *
 * @example
 * computePetMultiplier([])                        // → 1.0
 * computePetMultiplier(['orange_cat'])             // → 1.05
 * computePetMultiplier(['orange_cat', 'dog'])      // → 1.134
 */
export function computePetMultiplier(activePetIds) {
  if (!activePetIds || activePetIds.length === 0) return 1.0
  return activePetIds.reduce((acc, id) => {
    const def = PET_DEFS_MAP.get(id)
    return def ? acc * def.multiplier : acc
  }, 1.0)
}
