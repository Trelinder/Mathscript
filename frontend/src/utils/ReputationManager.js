/**
 * ReputationManager.js — Late-game meta-economy: luxury assets and Reputation score.
 *
 * This module is a **pure data layer** — no Phaser imports, no React imports,
 * no side-effects.  It answers three questions:
 *
 *   1. What luxury assets exist and how much Reputation does each grant?
 *   2. Given a set of owned asset IDs, what is the player's Reputation score?
 *   3. Given a Reputation score, what is the highest unlocked contract tier?
 *
 * ─── Design goals ────────────────────────────────────────────────────────────
 *
 *  • Cleanly separated — the score can be recomputed from scratch at any time
 *    by passing the array of owned asset IDs to `computeReputation()`.
 *
 *  • Stackable — owning more assets permanently raises the score.  Removing
 *    an asset (e.g. after a prestige reset) lowers it correctly without
 *    needing explicit delta tracking.
 *
 *  • Extensible — add new entries to LUXURY_ASSETS to extend the catalogue.
 *    Threshold gates in REPUTATION_TIERS automatically update to reflect new
 *    assets without changes to GamePlayerPage.
 *
 * ─── Luxury Asset Data ───────────────────────────────────────────────────────
 *
 * Each entry in LUXURY_ASSETS has the following shape:
 *
 *   id          — unique key used in the save array (ownedLuxuryAssets)
 *   name        — display name shown in the Garage shop
 *   emoji       — icon used as a quick visual identifier
 *   description — short flavour text
 *   cost        — coin cost to purchase (informational — not enforced here)
 *   reputation  — permanent Reputation points granted on purchase
 *
 * ─── Contract Tiers ──────────────────────────────────────────────────────────
 *
 * Three contract tiers exist.  Higher tiers are hidden by the PrerequisiteManager
 * until the player's Reputation score reaches the required threshold:
 *
 *   base  — always available, 2× income for 2 minutes (existing contract)
 *   s     — requires reputation ≥ 100, 3× income for 2 minutes
 *   sss   — requires reputation ≥ 300, 5× income for 2 minutes
 */

/**
 * Catalogue of purchasable luxury assets.
 * Add new entries here to extend the Garage shop.
 *
 * @type {Array<{id:string, name:string, emoji:string, description:string, cost:number, reputation:number}>}
 */
export const LUXURY_ASSETS = [
  {
    id:          'sports_car',
    name:        'Sports Car',
    emoji:       '🏎️',
    description: 'A sleek, low-slung roadster that turns heads at every stoplight.',
    cost:        5_000,
    reputation:  50,
  },
  {
    id:          'luxury_sedan',
    name:        'Luxury Sedan',
    emoji:       '🚗',
    description: 'Hand-stitched leather, adaptive suspension, and a name that opens doors.',
    cost:        15_000,
    reputation:  100,
  },
  {
    id:          'hypercar',
    name:        'Hypercar',
    emoji:       '🚀',
    description: 'Carbon-fiber monocoque, 1,000+ hp, and a waiting list measured in years.',
    cost:        50_000,
    reputation:  200,
  },
]

/**
 * O(1) lookup map: assetId → LUXURY_ASSETS entry.
 * @type {Map<string, typeof LUXURY_ASSETS[0]>}
 */
export const LUXURY_ASSETS_MAP = new Map(LUXURY_ASSETS.map(a => [a.id, a]))

/**
 * Contract tier definitions ordered from highest to lowest.
 * The highest tier whose `minReputation` ≤ player score is the active tier.
 *
 * @type {Array<{id:'base'|'s-tier'|'sss-tier', label:string, minReputation:number, multiplier:number, prereqKey:string|null}>}
 */
export const REPUTATION_TIERS = [
  {
    id:            'sss-tier',
    label:         'SSS-TIER CONTRACT',
    minReputation: 300,
    multiplier:    5.0,
    prereqKey:     'contract:sss-tier',
  },
  {
    id:            's-tier',
    label:         'S-TIER CONTRACT',
    minReputation: 100,
    multiplier:    3.0,
    prereqKey:     'contract:s-tier',
  },
  {
    id:            'base',
    label:         'COMMERCIAL CONTRACT',
    minReputation: 0,
    multiplier:    2.0,
    prereqKey:     null,      // base tier is always available
  },
]

/**
 * Compute the player's Reputation score from their owned asset IDs.
 *
 * Unknown IDs are silently ignored — future-proof against assets removed from
 * the catalogue.  The score equals the sum of `reputation` values for all
 * recognised owned assets.
 *
 * @param {string[]} ownedAssetIds — array of asset IDs the player has purchased
 * @returns {number} — integer reputation score ≥ 0
 *
 * @example
 * computeReputation([])                                   // → 0
 * computeReputation(['sports_car'])                       // → 50
 * computeReputation(['sports_car', 'luxury_sedan'])       // → 150
 * computeReputation(['sports_car', 'luxury_sedan', 'supercar']) // → 350
 */
export function computeReputation(ownedAssetIds) {
  if (!ownedAssetIds || ownedAssetIds.length === 0) return 0
  return ownedAssetIds.reduce((acc, id) => {
    const asset = LUXURY_ASSETS_MAP.get(id)
    return asset ? acc + asset.reputation : acc
  }, 0)
}

/**
 * Get the highest contract tier unlocked at the given Reputation score.
 *
 * REPUTATION_TIERS is ordered highest → lowest, so the first match is always
 * the best available tier.  The base tier always matches (minReputation = 0).
 *
 * @param {number} reputationScore — player's current Reputation score
 * @returns {typeof REPUTATION_TIERS[0]} — tier object with id, label, multiplier, prereqKey
 *
 * @example
 * getContractTier(0).id    // → 'base'     (2×)
 * getContractTier(99).id   // → 'base'     (2×)
 * getContractTier(100).id  // → 's-tier'   (3×)
 * getContractTier(299).id  // → 's-tier'   (3×)
 * getContractTier(300).id  // → 'sss-tier' (5×)
 */
export function getContractTier(reputationScore) {
  const score = reputationScore ?? 0
  return REPUTATION_TIERS.find(t => score >= t.minReputation) ?? REPUTATION_TIERS[REPUTATION_TIERS.length - 1]
}
