/**
 * HRManager.test.js
 *
 * Unit tests for the NPC HR management data model.
 * Covers WORKER_DEFS catalogue invariants, computeMoodMultiplier edge cases,
 * getMoodDecayRate combinations, and computeSalaryRaiseCost lookups.
 */
import { describe, it, expect } from 'vitest'
import {
  WORKER_DEFS,
  WORKER_DEFS_MAP,
  MOOD_DECAY_BASE,
  MOOD_DECAY_OVERTIME,
  MOOD_DECAY_NEGLECT,
  computeMoodMultiplier,
  getMoodDecayRate,
  computeSalaryRaiseCost,
} from '../HRManager.js'
import { FLOORS } from '../EconomyEngine.js'

// ─── WORKER_DEFS catalogue ────────────────────────────────────────────────────

describe('WORKER_DEFS catalogue', () => {
  it('has exactly one entry per FLOORS entry', () => {
    expect(WORKER_DEFS).toHaveLength(FLOORS.length)
  })

  it('every entry has the required fields', () => {
    for (const def of WORKER_DEFS) {
      expect(typeof def.wsId).toBe('string')
      expect(typeof def.heroName).toBe('string')
      expect(typeof def.skillLevel).toBe('number')
      expect(typeof def.expectedSalary).toBe('number')
    }
  })

  it('wsId values match the corresponding FLOORS id', () => {
    WORKER_DEFS.forEach((def, i) => {
      expect(def.wsId).toBe(FLOORS[i].id)
    })
  })

  it('heroName values match the corresponding FLOORS hero', () => {
    WORKER_DEFS.forEach((def, i) => {
      expect(def.heroName).toBe(FLOORS[i].hero)
    })
  })

  it('skillLevel starts at 0.5 for floor 0', () => {
    expect(WORKER_DEFS[0].skillLevel).toBe(0.5)
  })

  it('skillLevel ends at 1.2 for the last floor', () => {
    expect(WORKER_DEFS[WORKER_DEFS.length - 1].skillLevel).toBe(1.2)
  })

  it('skillLevel is strictly increasing across floors', () => {
    for (let i = 1; i < WORKER_DEFS.length; i++) {
      expect(WORKER_DEFS[i].skillLevel).toBeGreaterThan(WORKER_DEFS[i - 1].skillLevel)
    }
  })

  it('expectedSalary is a positive number for every entry', () => {
    for (const def of WORKER_DEFS) {
      expect(def.expectedSalary).toBeGreaterThan(0)
    }
  })

  it('expectedSalary is strictly increasing across floors (late-game raises are expensive)', () => {
    for (let i = 1; i < WORKER_DEFS.length; i++) {
      expect(WORKER_DEFS[i].expectedSalary).toBeGreaterThan(WORKER_DEFS[i - 1].expectedSalary)
    }
  })

  it('first floor raise cost is affordable early-game (≤ 1000)', () => {
    expect(WORKER_DEFS[0].expectedSalary).toBeLessThanOrEqual(1000)
  })

  it('last floor raise cost is expensive late-game (≥ 1_000_000)', () => {
    expect(WORKER_DEFS[WORKER_DEFS.length - 1].expectedSalary).toBeGreaterThanOrEqual(1_000_000)
  })
})

// ─── WORKER_DEFS_MAP ──────────────────────────────────────────────────────────

describe('WORKER_DEFS_MAP', () => {
  it('has the same number of entries as WORKER_DEFS', () => {
    expect(WORKER_DEFS_MAP.size).toBe(WORKER_DEFS.length)
  })

  it('returns the correct entry for a known wsId', () => {
    const first = WORKER_DEFS[0]
    expect(WORKER_DEFS_MAP.get(first.wsId)).toEqual(first)
  })

  it('returns undefined for an unknown wsId', () => {
    expect(WORKER_DEFS_MAP.get('unknown-floor')).toBeUndefined()
  })

  it('all wsId keys in the map match FLOORS ids', () => {
    const floorIds = new Set(FLOORS.map(f => f.id))
    for (const key of WORKER_DEFS_MAP.keys()) {
      expect(floorIds.has(key)).toBe(true)
    }
  })
})

// ─── computeMoodMultiplier ────────────────────────────────────────────────────

describe('computeMoodMultiplier', () => {
  it('returns 1.0 when mood is 1 (fully happy)', () => {
    expect(computeMoodMultiplier(1)).toBe(1.0)
  })

  it('returns 0.5 when mood is 0 (fully demoralized)', () => {
    expect(computeMoodMultiplier(0)).toBe(0.5)
  })

  it('returns 0.75 at mood = 0.5 (midpoint)', () => {
    expect(computeMoodMultiplier(0.5)).toBeCloseTo(0.75)
  })

  it('returns 0.625 at mood = 0.25', () => {
    expect(computeMoodMultiplier(0.25)).toBeCloseTo(0.625)
  })

  it('returns 0.875 at mood = 0.75', () => {
    expect(computeMoodMultiplier(0.75)).toBeCloseTo(0.875)
  })

  it('clamps to 0.5 for negative mood values', () => {
    expect(computeMoodMultiplier(-0.5)).toBe(0.5)
    expect(computeMoodMultiplier(-100)).toBe(0.5)
  })

  it('clamps to 1.0 for mood values above 1', () => {
    expect(computeMoodMultiplier(1.1)).toBe(1.0)
    expect(computeMoodMultiplier(100)).toBe(1.0)
  })

  it('is always within [0.5, 1.0] for any finite input', () => {
    const testValues = [-10, -1, -0.01, 0, 0.01, 0.5, 0.99, 1, 1.01, 10]
    for (const v of testValues) {
      const m = computeMoodMultiplier(v)
      expect(m).toBeGreaterThanOrEqual(0.5)
      expect(m).toBeLessThanOrEqual(1.0)
    }
  })

  it('is strictly monotone — higher mood always gives higher or equal multiplier', () => {
    const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    for (let i = 1; i < steps.length; i++) {
      expect(computeMoodMultiplier(steps[i])).toBeGreaterThanOrEqual(computeMoodMultiplier(steps[i - 1]))
    }
  })
})

// ─── getMoodDecayRate ─────────────────────────────────────────────────────────

describe('getMoodDecayRate', () => {
  it('returns MOOD_DECAY_BASE with no conditions active', () => {
    expect(getMoodDecayRate()).toBe(MOOD_DECAY_BASE)
  })

  it('returns MOOD_DECAY_BASE with both flags explicitly false', () => {
    expect(getMoodDecayRate({ isOvertime: false, hasNeglectedAmenities: false })).toBe(MOOD_DECAY_BASE)
  })

  it('adds MOOD_DECAY_OVERTIME when isOvertime is true', () => {
    const rate = getMoodDecayRate({ isOvertime: true, hasNeglectedAmenities: false })
    expect(rate).toBeCloseTo(MOOD_DECAY_BASE + MOOD_DECAY_OVERTIME)
  })

  it('adds MOOD_DECAY_NEGLECT when hasNeglectedAmenities is true', () => {
    const rate = getMoodDecayRate({ isOvertime: false, hasNeglectedAmenities: true })
    expect(rate).toBeCloseTo(MOOD_DECAY_BASE + MOOD_DECAY_NEGLECT)
  })

  it('adds both penalties when both flags are true (worst case)', () => {
    const rate = getMoodDecayRate({ isOvertime: true, hasNeglectedAmenities: true })
    expect(rate).toBeCloseTo(MOOD_DECAY_BASE + MOOD_DECAY_OVERTIME + MOOD_DECAY_NEGLECT)
  })

  it('worst-case rate exceeds base rate by both penalties', () => {
    const base    = getMoodDecayRate()
    const worst   = getMoodDecayRate({ isOvertime: true, hasNeglectedAmenities: true })
    const overtime = getMoodDecayRate({ isOvertime: true })
    const neglect  = getMoodDecayRate({ hasNeglectedAmenities: true })
    expect(worst).toBeGreaterThan(overtime)
    expect(worst).toBeGreaterThan(neglect)
    expect(worst).toBeGreaterThan(base)
  })

  it('returns a positive number in all cases', () => {
    const cases = [
      {},
      { isOvertime: true },
      { hasNeglectedAmenities: true },
      { isOvertime: true, hasNeglectedAmenities: true },
    ]
    for (const c of cases) {
      expect(getMoodDecayRate(c)).toBeGreaterThan(0)
    }
  })

  it('base decay alone takes at least 2 minutes to reach zero from 1.0', () => {
    // 1.0 / MOOD_DECAY_BASE (per sec) > 120 s
    expect(1.0 / MOOD_DECAY_BASE).toBeGreaterThan(120)
  })
})

// ─── computeSalaryRaiseCost ───────────────────────────────────────────────────

describe('computeSalaryRaiseCost', () => {
  it('returns the correct cost for each known wsId', () => {
    for (const def of WORKER_DEFS) {
      expect(computeSalaryRaiseCost(def.wsId)).toBe(def.expectedSalary)
    }
  })

  it('returns 0 for an unknown wsId (safe fallback)', () => {
    expect(computeSalaryRaiseCost('not-a-real-floor')).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    expect(computeSalaryRaiseCost('')).toBe(0)
  })

  it('is consistent with WORKER_DEFS_MAP lookup', () => {
    for (const def of WORKER_DEFS) {
      expect(computeSalaryRaiseCost(def.wsId)).toBe(WORKER_DEFS_MAP.get(def.wsId)?.expectedSalary)
    }
  })
})
