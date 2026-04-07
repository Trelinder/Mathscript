/**
 * ReputationManager.test.js
 *
 * Unit tests for the luxury asset catalogue, score computation, and contract
 * tier lookup functions.
 */
import { describe, it, expect } from 'vitest'
import {
  LUXURY_ASSETS,
  LUXURY_ASSETS_MAP,
  REPUTATION_TIERS,
  computeReputation,
  getContractTier,
} from '../ReputationManager.js'

// ─── LUXURY_ASSETS catalogue ──────────────────────────────────────────────────

describe('LUXURY_ASSETS', () => {
  it('contains at least 3 assets', () => {
    expect(LUXURY_ASSETS.length).toBeGreaterThanOrEqual(3)
  })

  it('each asset has required fields with correct types', () => {
    for (const asset of LUXURY_ASSETS) {
      expect(typeof asset.id).toBe('string')
      expect(asset.id.length).toBeGreaterThan(0)
      expect(typeof asset.name).toBe('string')
      expect(typeof asset.emoji).toBe('string')
      expect(typeof asset.description).toBe('string')
      expect(typeof asset.cost).toBe('number')
      expect(typeof asset.reputation).toBe('number')
    }
  })

  it('all reputation bonuses are positive', () => {
    for (const asset of LUXURY_ASSETS) {
      expect(asset.reputation).toBeGreaterThan(0)
    }
  })

  it('all costs are positive', () => {
    for (const asset of LUXURY_ASSETS) {
      expect(asset.cost).toBeGreaterThan(0)
    }
  })

  it('all IDs are unique', () => {
    const ids = LUXURY_ASSETS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sports_car is present with expected values', () => {
    const car = LUXURY_ASSETS.find(a => a.id === 'sports_car')
    expect(car).toBeDefined()
    expect(car.reputation).toBe(50)
    expect(car.cost).toBe(5_000)
  })

  it('luxury_sedan is present with expected values', () => {
    const sedan = LUXURY_ASSETS.find(a => a.id === 'luxury_sedan')
    expect(sedan).toBeDefined()
    expect(sedan.reputation).toBe(100)
    expect(sedan.cost).toBe(15_000)
  })

  it('supercar is present with expected values', () => {
    const hypercar = LUXURY_ASSETS.find(a => a.id === 'hypercar')
    expect(hypercar).toBeDefined()
    expect(hypercar.reputation).toBe(200)
    expect(hypercar.cost).toBe(50_000)
  })
})

// ─── LUXURY_ASSETS_MAP ────────────────────────────────────────────────────────

describe('LUXURY_ASSETS_MAP', () => {
  it('contains all LUXURY_ASSETS ids', () => {
    for (const asset of LUXURY_ASSETS) {
      expect(LUXURY_ASSETS_MAP.has(asset.id)).toBe(true)
    }
  })

  it('maps to the correct objects', () => {
    for (const asset of LUXURY_ASSETS) {
      expect(LUXURY_ASSETS_MAP.get(asset.id)).toBe(asset)
    }
  })

  it('has exactly as many entries as LUXURY_ASSETS', () => {
    expect(LUXURY_ASSETS_MAP.size).toBe(LUXURY_ASSETS.length)
  })
})

// ─── REPUTATION_TIERS ─────────────────────────────────────────────────────────

describe('REPUTATION_TIERS', () => {
  it('includes base, s-tier, and sss-tier', () => {
    const ids = REPUTATION_TIERS.map(t => t.id)
    expect(ids).toContain('base')
    expect(ids).toContain('s-tier')
    expect(ids).toContain('sss-tier')
  })

  it('base tier has minReputation 0 (always available)', () => {
    const base = REPUTATION_TIERS.find(t => t.id === 'base')
    expect(base.minReputation).toBe(0)
  })

  it('s-tier has minReputation 100', () => {
    const s = REPUTATION_TIERS.find(t => t.id === 's-tier')
    expect(s.minReputation).toBe(100)
  })

  it('sss-tier has minReputation 300', () => {
    const sss = REPUTATION_TIERS.find(t => t.id === 'sss-tier')
    expect(sss.minReputation).toBe(300)
  })

  it('multipliers increase with tier (base < s < sss)', () => {
    const base = REPUTATION_TIERS.find(t => t.id === 'base')
    const s    = REPUTATION_TIERS.find(t => t.id === 's-tier')
    const sss  = REPUTATION_TIERS.find(t => t.id === 'sss-tier')
    expect(base.multiplier).toBeLessThan(s.multiplier)
    expect(s.multiplier).toBeLessThan(sss.multiplier)
  })

  it('base tier has multiplier 2.0', () => {
    const base = REPUTATION_TIERS.find(t => t.id === 'base')
    expect(base.multiplier).toBe(2.0)
  })

  it('s-tier has multiplier 3.0', () => {
    const s = REPUTATION_TIERS.find(t => t.id === 's-tier')
    expect(s.multiplier).toBe(3.0)
  })

  it('sss-tier has multiplier 5.0', () => {
    const sss = REPUTATION_TIERS.find(t => t.id === 'sss-tier')
    expect(sss.multiplier).toBe(5.0)
  })
})

// ─── computeReputation ────────────────────────────────────────────────────────

describe('computeReputation', () => {
  it('returns 0 for an empty array', () => {
    expect(computeReputation([])).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(computeReputation(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(computeReputation(undefined)).toBe(0)
  })

  it('returns 50 for sports_car only', () => {
    expect(computeReputation(['sports_car'])).toBe(50)
  })

  it('returns 100 for luxury_sedan only', () => {
    expect(computeReputation(['luxury_sedan'])).toBe(100)
  })

  it('returns 200 for supercar only', () => {
    expect(computeReputation(['hypercar'])).toBe(200)
  })

  it('adds scores correctly for two assets', () => {
    expect(computeReputation(['sports_car', 'luxury_sedan'])).toBe(150)
  })

  it('adds scores correctly for all three assets', () => {
    expect(computeReputation(['sports_car', 'luxury_sedan', 'hypercar'])).toBe(350)
  })

  it('is commutative — order does not matter', () => {
    const a = computeReputation(['sports_car', 'luxury_sedan', 'hypercar'])
    const b = computeReputation(['hypercar', 'sports_car', 'luxury_sedan'])
    expect(a).toBe(b)
  })

  it('ignores unknown asset IDs silently', () => {
    expect(computeReputation(['unknown_car'])).toBe(0)
    expect(computeReputation(['sports_car', 'unknown_car'])).toBe(50)
  })

  it('returns 0 when all IDs are unknown', () => {
    expect(computeReputation(['a', 'b', 'c'])).toBe(0)
  })

  it("stacks duplicate IDs (ownership dedup is the UI's responsibility)", () => {
    expect(computeReputation(['sports_car', 'sports_car'])).toBe(100)
  })
})

// ─── getContractTier ──────────────────────────────────────────────────────────

describe('getContractTier', () => {
  it('returns base tier for score 0', () => {
    expect(getContractTier(0).id).toBe('base')
  })

  it('returns base tier for score 99 (below s-tier threshold)', () => {
    expect(getContractTier(99).id).toBe('base')
  })

  it('returns s-tier for score exactly 100', () => {
    expect(getContractTier(100).id).toBe('s-tier')
  })

  it('returns s-tier for score 150', () => {
    expect(getContractTier(150).id).toBe('s-tier')
  })

  it('returns s-tier for score 299 (below sss-tier threshold)', () => {
    expect(getContractTier(299).id).toBe('s-tier')
  })

  it('returns sss-tier for score exactly 300', () => {
    expect(getContractTier(300).id).toBe('sss-tier')
  })

  it('returns sss-tier for score above 300', () => {
    expect(getContractTier(999).id).toBe('sss-tier')
  })

  it('returns base tier for null (treats as 0)', () => {
    expect(getContractTier(null).id).toBe('base')
  })

  it('returns base tier for undefined (treats as 0)', () => {
    expect(getContractTier(undefined).id).toBe('base')
  })

  it('returns correct multiplier at each threshold', () => {
    expect(getContractTier(0).multiplier).toBe(2.0)
    expect(getContractTier(100).multiplier).toBe(3.0)
    expect(getContractTier(300).multiplier).toBe(5.0)
  })

  it('computed reputation of all assets yields sss-tier', () => {
    const score = computeReputation(['sports_car', 'luxury_sedan', 'hypercar'])  // 350
    expect(getContractTier(score).id).toBe('sss-tier')
  })

  it('computed reputation of first two assets yields s-tier', () => {
    const score = computeReputation(['sports_car', 'luxury_sedan'])  // 150
    expect(getContractTier(score).id).toBe('s-tier')
  })

  it('computed reputation of only sports_car yields base tier', () => {
    const score = computeReputation(['sports_car'])  // 50
    expect(getContractTier(score).id).toBe('base')
  })
})
