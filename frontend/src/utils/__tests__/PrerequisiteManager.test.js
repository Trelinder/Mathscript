/**
 * PrerequisiteManager.test.js
 *
 * Unit tests for the upgrade visibility filter layer.
 * Verifies that each unlock condition triggers at exactly the right threshold.
 */
import { describe, it, expect } from 'vitest'
import {
  PREREQUISITE_MAP,
  evaluatePrerequisites,
  isUpgradeUnlocked,
  getNewlyUnlocked,
} from '../PrerequisiteManager.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal gameState with all fields defaulting to 0 / empty. */
function makeState({ busCapLv = 0, busSpdLv = 0, floorLevels = [], reputation = 0 } = {}) {
  return {
    bus: { capacityLevel: busCapLv, speedLevel: busSpdLv, loadingLevel: 0 },
    floors: floorLevels.map(level => ({ level })),
    reputation,
  }
}

/** T1 floor indices: 0, 1, 2 / T2 floor indices: 3, 4, 5, 6 */
const T1_FLOORS_AT_LEVEL = (lv) => Array(7).fill(0).map((_, i) => i <= 2 ? lv : 0)
const T2_FLOORS_AT_LEVEL = (lv) => Array(7).fill(0).map((_, i) => i >= 3 ? lv : 0)

// ─── PREREQUISITE_MAP shape ───────────────────────────────────────────────────

describe('PREREQUISITE_MAP', () => {
  it('contains exactly the expected keys', () => {
    const keys = Object.keys(PREREQUISITE_MAP).sort()
    expect(keys).toEqual([
      'bus:capacity',
      'bus:loadingSpeed',
      'bus:speed',
      'compiler:batch',
      'compiler:conv',
      'compiler:proc',
      'contract:s-tier',
      'contract:sss-tier',
    ])
  })

  it('all values are functions', () => {
    for (const fn of Object.values(PREREQUISITE_MAP)) {
      expect(typeof fn).toBe('function')
    }
  })
})

// ─── Always-unlocked starters ─────────────────────────────────────────────────

describe('bus:capacity — always unlocked', () => {
  it('is true at default state', () => {
    expect(PREREQUISITE_MAP['bus:capacity'](makeState())).toBe(true)
  })
  it('is true regardless of any conditions', () => {
    expect(PREREQUISITE_MAP['bus:capacity'](makeState({ busCapLv: 999 }))).toBe(true)
  })
})

describe('compiler:batch — always unlocked', () => {
  it('is true at default state', () => {
    expect(PREREQUISITE_MAP['compiler:batch'](makeState())).toBe(true)
  })
})

// ─── bus:speed ────────────────────────────────────────────────────────────────

describe('bus:speed', () => {
  it('is false when capacityLevel < 5', () => {
    for (let lv = 0; lv <= 4; lv++) {
      expect(PREREQUISITE_MAP['bus:speed'](makeState({ busCapLv: lv }))).toBe(false)
    }
  })

  it('is true when capacityLevel === 5', () => {
    expect(PREREQUISITE_MAP['bus:speed'](makeState({ busCapLv: 5 }))).toBe(true)
  })

  it('is true when capacityLevel > 5', () => {
    expect(PREREQUISITE_MAP['bus:speed'](makeState({ busCapLv: 100 }))).toBe(true)
  })

  it('handles missing bus field gracefully (treats as 0)', () => {
    expect(PREREQUISITE_MAP['bus:speed']({})).toBe(false)
  })
})

// ─── bus:loadingSpeed ─────────────────────────────────────────────────────────

describe('bus:loadingSpeed', () => {
  it('is false when speedLevel < 5', () => {
    for (let lv = 0; lv <= 4; lv++) {
      expect(PREREQUISITE_MAP['bus:loadingSpeed'](makeState({ busSpdLv: lv }))).toBe(false)
    }
  })

  it('is true when speedLevel === 5', () => {
    expect(PREREQUISITE_MAP['bus:loadingSpeed'](makeState({ busSpdLv: 5 }))).toBe(true)
  })

  it('is true when speedLevel > 5', () => {
    expect(PREREQUISITE_MAP['bus:loadingSpeed'](makeState({ busSpdLv: 50 }))).toBe(true)
  })

  it('handles missing bus field gracefully', () => {
    expect(PREREQUISITE_MAP['bus:loadingSpeed']({})).toBe(false)
  })
})

// ─── compiler:proc ────────────────────────────────────────────────────────────

describe('compiler:proc', () => {
  it('is false when all floors are below level 10', () => {
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: T1_FLOORS_AT_LEVEL(9) }))).toBe(false)
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: T1_FLOORS_AT_LEVEL(0) }))).toBe(false)
  })

  it('is true when a T1 floor (index 0) reaches level 10', () => {
    const floors = [10, 0, 0, 0, 0, 0, 0]
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: floors }))).toBe(true)
  })

  it('is true when a T1 floor (index 1) reaches level 10', () => {
    const floors = [0, 10, 0, 0, 0, 0, 0]
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: floors }))).toBe(true)
  })

  it('is true when a T1 floor (index 2) reaches level 10', () => {
    const floors = [0, 0, 10, 0, 0, 0, 0]
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: floors }))).toBe(true)
  })

  it('is false when only a T2 floor reaches level 10 (index 3+)', () => {
    const floors = [0, 0, 0, 10, 10, 10, 10]
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: floors }))).toBe(false)
  })

  it('handles empty floors array gracefully', () => {
    expect(PREREQUISITE_MAP['compiler:proc'](makeState({ floorLevels: [] }))).toBe(false)
    expect(PREREQUISITE_MAP['compiler:proc']({})).toBe(false)
  })
})

// ─── compiler:conv ────────────────────────────────────────────────────────────

describe('compiler:conv', () => {
  it('is false when all T2 floors are below level 10', () => {
    expect(PREREQUISITE_MAP['compiler:conv'](makeState({ floorLevels: T2_FLOORS_AT_LEVEL(9) }))).toBe(false)
  })

  it('is true when a T2 floor (index 3) reaches level 10', () => {
    const floors = [0, 0, 0, 10, 0, 0, 0]
    expect(PREREQUISITE_MAP['compiler:conv'](makeState({ floorLevels: floors }))).toBe(true)
  })

  it('is true when a T2 floor (index 6) reaches level 10', () => {
    const floors = [0, 0, 0, 0, 0, 0, 10]
    expect(PREREQUISITE_MAP['compiler:conv'](makeState({ floorLevels: floors }))).toBe(true)
  })

  it('is false when only T1 floors are at level 10 (indices 0–2)', () => {
    const floors = [10, 10, 10, 0, 0, 0, 0]
    expect(PREREQUISITE_MAP['compiler:conv'](makeState({ floorLevels: floors }))).toBe(false)
  })

  it('handles empty floors array gracefully', () => {
    expect(PREREQUISITE_MAP['compiler:conv'](makeState({ floorLevels: [] }))).toBe(false)
    expect(PREREQUISITE_MAP['compiler:conv']({})).toBe(false)
  })
})

// ─── evaluatePrerequisites ────────────────────────────────────────────────────

describe('evaluatePrerequisites', () => {
  it('returns an object with all 8 keys', () => {
    const result = evaluatePrerequisites(makeState())
    expect(Object.keys(result).sort()).toEqual([
      'bus:capacity', 'bus:loadingSpeed', 'bus:speed',
      'compiler:batch', 'compiler:conv', 'compiler:proc',
      'contract:s-tier', 'contract:sss-tier',
    ])
  })

  it('only always-unlocked keys are true at blank state', () => {
    const result = evaluatePrerequisites(makeState())
    expect(result['bus:capacity']).toBe(true)
    expect(result['compiler:batch']).toBe(true)
    expect(result['bus:speed']).toBe(false)
    expect(result['bus:loadingSpeed']).toBe(false)
    expect(result['compiler:proc']).toBe(false)
    expect(result['compiler:conv']).toBe(false)
    expect(result['contract:s-tier']).toBe(false)
    expect(result['contract:sss-tier']).toBe(false)
  })

  it('reflects conditions correctly in a mixed state', () => {
    const state = {
      bus:    { capacityLevel: 5, speedLevel: 3 },
      floors: [10, 0, 0, 0, 0, 0, 0].map(level => ({ level })),
    }
    const result = evaluatePrerequisites(state)
    expect(result['bus:speed']).toBe(true)         // cap ≥ 5
    expect(result['bus:loadingSpeed']).toBe(false)  // speed < 5
    expect(result['compiler:proc']).toBe(true)      // T1 floor[0] = 10
    expect(result['compiler:conv']).toBe(false)     // no T2 floor ≥ 10
  })
})

// ─── isUpgradeUnlocked ────────────────────────────────────────────────────────

describe('isUpgradeUnlocked', () => {
  it('returns true for an always-unlocked key', () => {
    expect(isUpgradeUnlocked('bus:capacity', makeState())).toBe(true)
  })

  it('returns false for a locked key when condition not met', () => {
    expect(isUpgradeUnlocked('bus:speed', makeState({ busCapLv: 0 }))).toBe(false)
  })

  it('returns true for an unknown key (future-proof pass-through)', () => {
    expect(isUpgradeUnlocked('future:unknown', makeState())).toBe(true)
  })
})

// ─── getNewlyUnlocked ─────────────────────────────────────────────────────────

describe('getNewlyUnlocked', () => {
  it('returns empty array when nothing changed', () => {
    const s = evaluatePrerequisites(makeState())
    expect(getNewlyUnlocked(s, s)).toEqual([])
  })

  it('returns the keys that flipped false → true', () => {
    const prev = evaluatePrerequisites(makeState({ busCapLv: 4 }))
    const next = evaluatePrerequisites(makeState({ busCapLv: 5 }))
    const newly = getNewlyUnlocked(prev, next)
    expect(newly).toContain('bus:speed')
    expect(newly).not.toContain('bus:capacity')  // was already true
  })

  it('does not include keys that were already true in prev', () => {
    const prev = { 'bus:capacity': true, 'bus:speed': false }
    const next = { 'bus:capacity': true, 'bus:speed': true }
    expect(getNewlyUnlocked(prev, next)).toEqual(['bus:speed'])
  })

  it('does not report true → false transitions (not a "new unlock")', () => {
    const prev = { 'bus:speed': true }
    const next = { 'bus:speed': false }
    expect(getNewlyUnlocked(prev, next)).toEqual([])
  })
})

// ─── Reputation-gated contract tiers ─────────────────────────────────────────

describe('contract:s-tier prerequisite', () => {
  it('is false when reputation is 0 (default)', () => {
    const result = evaluatePrerequisites(makeState())
    expect(result['contract:s-tier']).toBe(false)
  })

  it('is false when reputation is 99', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 99 }))
    expect(result['contract:s-tier']).toBe(false)
  })

  it('is true when reputation is exactly 100', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 100 }))
    expect(result['contract:s-tier']).toBe(true)
  })

  it('is true when reputation is above 100', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 250 }))
    expect(result['contract:s-tier']).toBe(true)
  })

  it('is true at maximum reputation', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 999 }))
    expect(result['contract:s-tier']).toBe(true)
  })
})

describe('contract:sss-tier prerequisite', () => {
  it('is false when reputation is 0', () => {
    const result = evaluatePrerequisites(makeState())
    expect(result['contract:sss-tier']).toBe(false)
  })

  it('is false when reputation is 100 (s-tier threshold, below sss)', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 100 }))
    expect(result['contract:sss-tier']).toBe(false)
  })

  it('is false when reputation is 299', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 299 }))
    expect(result['contract:sss-tier']).toBe(false)
  })

  it('is true when reputation is exactly 300', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 300 }))
    expect(result['contract:sss-tier']).toBe(true)
  })

  it('is true when reputation is above 300', () => {
    const result = evaluatePrerequisites(makeState({ reputation: 350 }))
    expect(result['contract:sss-tier']).toBe(true)
  })
})

