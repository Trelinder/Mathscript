/**
 * MascotSystem.test.js
 *
 * Unit tests for the pet catalogue, multiplier math, and all utility functions.
 */
import { describe, it, expect } from 'vitest'
import { PET_DEFS, PET_DEFS_MAP, computePetMultiplier } from '../MascotSystem.js'

// ─── PET_DEFS catalogue ───────────────────────────────────────────────────────

describe('PET_DEFS', () => {
  it('contains at least 2 pets', () => {
    expect(PET_DEFS.length).toBeGreaterThanOrEqual(2)
  })

  it('each pet has required fields', () => {
    for (const pet of PET_DEFS) {
      expect(typeof pet.id).toBe('string')
      expect(pet.id.length).toBeGreaterThan(0)
      expect(typeof pet.name).toBe('string')
      expect(typeof pet.emoji).toBe('string')
      expect(typeof pet.tint).toBe('number')
      expect(typeof pet.multiplier).toBe('number')
      expect(typeof pet.cost).toBe('number')
    }
  })

  it('all multipliers are > 1.0 (passive bonus, not penalty)', () => {
    for (const pet of PET_DEFS) {
      expect(pet.multiplier).toBeGreaterThan(1.0)
    }
  })

  it('all costs are positive', () => {
    for (const pet of PET_DEFS) {
      expect(pet.cost).toBeGreaterThan(0)
    }
  })

  it('all IDs are unique', () => {
    const ids = PET_DEFS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('orange_cat is present with expected values', () => {
    const cat = PET_DEFS.find(p => p.id === 'orange_cat')
    expect(cat).toBeDefined()
    expect(cat.multiplier).toBeCloseTo(1.05, 4)
    expect(cat.cost).toBe(500)
  })

  it('dog is present with expected values', () => {
    const dog = PET_DEFS.find(p => p.id === 'dog')
    expect(dog).toBeDefined()
    expect(dog.multiplier).toBeCloseTo(1.08, 4)
    expect(dog.cost).toBe(1200)
  })
})

// ─── PET_DEFS_MAP ─────────────────────────────────────────────────────────────

describe('PET_DEFS_MAP', () => {
  it('contains all PET_DEFS ids', () => {
    for (const pet of PET_DEFS) {
      expect(PET_DEFS_MAP.has(pet.id)).toBe(true)
    }
  })

  it('maps to the correct objects', () => {
    for (const pet of PET_DEFS) {
      expect(PET_DEFS_MAP.get(pet.id)).toBe(pet)
    }
  })

  it('does not have extra keys beyond PET_DEFS', () => {
    expect(PET_DEFS_MAP.size).toBe(PET_DEFS.length)
  })
})

// ─── computePetMultiplier ─────────────────────────────────────────────────────

describe('computePetMultiplier', () => {
  it('returns exactly 1.0 for an empty array', () => {
    expect(computePetMultiplier([])).toBe(1.0)
  })

  it('returns exactly 1.0 for null/undefined input', () => {
    expect(computePetMultiplier(null)).toBe(1.0)
    expect(computePetMultiplier(undefined)).toBe(1.0)
  })

  it('returns the single pet multiplier when only one pet is active', () => {
    expect(computePetMultiplier(['orange_cat'])).toBeCloseTo(1.05, 5)
    expect(computePetMultiplier(['dog'])).toBeCloseTo(1.08, 5)
  })

  it('multiplies stacked pets multiplicatively', () => {
    // orange_cat × dog = 1.05 × 1.08 = 1.134
    const result = computePetMultiplier(['orange_cat', 'dog'])
    expect(result).toBeCloseTo(1.05 * 1.08, 6)
  })

  it('is commutative — order of pets does not affect result', () => {
    const ab = computePetMultiplier(['orange_cat', 'dog'])
    const ba = computePetMultiplier(['dog', 'orange_cat'])
    expect(ab).toBeCloseTo(ba, 10)
  })

  it('ignores unknown pet IDs silently', () => {
    expect(computePetMultiplier(['unknown_pet'])).toBe(1.0)
    expect(computePetMultiplier(['orange_cat', 'unknown_pet'])).toBeCloseTo(1.05, 5)
  })

  it('returns 1.0 when all IDs are unknown', () => {
    expect(computePetMultiplier(['a', 'b', 'c'])).toBe(1.0)
  })

  it('stacks three hypothetical pets correctly (single + double + triple)', () => {
    // If only orange_cat exists, same as single
    const singleResult = computePetMultiplier(['orange_cat', 'orange_cat'])
    // Duplicate IDs are allowed by the function — each entry multiplies once
    // (ownership dedup is the UI's responsibility, not the math layer's)
    expect(singleResult).toBeCloseTo(1.05 * 1.05, 6)
  })

  it('all PET_DEFS stacked = product of all multipliers', () => {
    const allIds     = PET_DEFS.map(p => p.id)
    const expected   = PET_DEFS.reduce((acc, p) => acc * p.multiplier, 1.0)
    expect(computePetMultiplier(allIds)).toBeCloseTo(expected, 6)
  })
})
