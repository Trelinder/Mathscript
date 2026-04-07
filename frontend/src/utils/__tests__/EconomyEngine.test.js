import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  MILESTONE_LEVELS,
  FLOORS,
  INIT_BUS,
  INIT_COMPILER,
  FLOOR_TIER_CONFIG,
  FLOOR_COST_MULTIPLIER,
  milestoneMult,
  floorRCPS,
  calculateNextCost,
  levelCost,
  getFloorTier,
  floorTierMult,
  workerCount,
  getBulkCost,
  getMaxQty,
  calculateMultiCost,
  calculateMaxAffordable,
  calculateOfflineProgress,
  INFRA_DEF,
  infraCapacity,
  isUpgradeBlocked,
  HERO_FLOOR_BONUS,
  heroFloorMult,
  QUEST_LEVEL_BONUS_PER_10,
  QUEST_LEVEL_MAX_BONUS,
  questLevelMult,
  HERO_UNLOCK_THRESHOLDS,
  getTycoonUnlockedHeroes,
} from '../EconomyEngine.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const SPELL_LAB  = FLOORS[0]  // baseCost: 8,       rcps: 0.5
const SPEED_DESK = FLOORS[3]  // baseCost: 5000,    rcps: 60
const SHADOW_DEN = FLOORS[6]  // baseCost: 7000000, rcps: 20000

/** Build a minimal savedData object for calculateOfflineProgress tests. */
function makeSavedData({
  lastSavedTimestamp = Date.now() - 3600 * 1000,   // 1 hour ago by default
  elevatorHired      = true,
  salesHired         = true,
  floors             = FLOORS.map(() => ({ level: 1 })),
  bus                = {},
  compiler           = {},
} = {}) {
  return {
    lastSavedTimestamp,
    managers: {
      elevator: { isHired: elevatorHired },
      sales:    { isHired: salesHired },
    },
    floors,
    bus:      { ...INIT_BUS, ...bus },
    compiler: { ...INIT_COMPILER, ...compiler },
    hasCompletedTutorial: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// milestoneMult
// ─────────────────────────────────────────────────────────────────────────────
describe('milestoneMult', () => {
  it('returns 1 when level is 0 (no milestones reached)', () => {
    expect(milestoneMult(0)).toBe(1)
  })

  it('returns 1 when level is below the first milestone (9)', () => {
    expect(milestoneMult(9)).toBe(1)
  })

  it('returns 2 at the first milestone threshold (10)', () => {
    expect(milestoneMult(10)).toBe(2)
  })

  it('returns 3 at the second milestone threshold (25)', () => {
    expect(milestoneMult(25)).toBe(3)
  })

  it('increments by 1 at each subsequent milestone threshold', () => {
    const expected = [4, 5, 6, 7, 8, 9]
    ;[50, 100, 200, 300, 400, 500].forEach((threshold, i) => {
      expect(milestoneMult(threshold)).toBe(expected[i])
    })
  })

  it('returns 9 (max) when level exceeds the highest milestone (500)', () => {
    expect(milestoneMult(501)).toBe(9)
    expect(milestoneMult(10000)).toBe(9)
  })

  it('does not change between milestone thresholds', () => {
    // Between 10 and 24 the multiplier stays at 2
    for (let l = 10; l < 25; l++) {
      expect(milestoneMult(l)).toBe(2)
    }
  })

  it('MILESTONE_LEVELS array has 8 entries', () => {
    expect(MILESTONE_LEVELS).toHaveLength(8)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// floorRCPS
// ─────────────────────────────────────────────────────────────────────────────
describe('floorRCPS', () => {
  it('returns 0 when level is 0', () => {
    expect(floorRCPS(SPELL_LAB, 0)).toBe(0)
  })

  it('returns def.rcps at level 1 with no milestone bonus', () => {
    // level 1, milestoneMult(1) = 1 → 1 * 0.5 * 1 = 0.5
    expect(floorRCPS(SPELL_LAB, 1)).toBe(0.5)
  })

  it('scales linearly with level (before first milestone)', () => {
    // level 5, milestoneMult(5) = 1 → 5 * 0.5 = 2.5
    expect(floorRCPS(SPELL_LAB, 5)).toBeCloseTo(2.5)
  })

  it('includes milestone multiplier at level 10', () => {
    // milestoneMult(10) = 2 → 10 * 0.5 * 2 = 10
    expect(floorRCPS(SPELL_LAB, 10)).toBeCloseTo(10)
  })

  it('includes milestone multiplier at level 25', () => {
    // milestoneMult(25) = 3 → 25 * 0.5 * 3 = 37.5
    expect(floorRCPS(SPELL_LAB, 25)).toBeCloseTo(37.5)
  })

  it('works correctly for the highest-rcps floor (Shadow Den, rcps=20000)', () => {
    // level 1, milestoneMult = 1 → 1 * 20000 * 1 = 20000
    expect(floorRCPS(SHADOW_DEN, 1)).toBe(20000)
  })

  it('works correctly for a mid-tier floor (Speed Desk, rcps=60)', () => {
    // level 100, milestoneMult(100) = 5 → 100 * 60 * 5 = 30000
    expect(floorRCPS(SPEED_DESK, 100)).toBeCloseTo(30000)
  })

  it('formula: level * def.rcps * milestoneMult(level) holds for all 7 floors at level 1', () => {
    FLOORS.forEach(def => {
      expect(floorRCPS(def, 1)).toBeCloseTo(def.rcps * milestoneMult(1))
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateNextCost / levelCost
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateNextCost', () => {
  it('returns ceil(baseCost) at level 0 (growth^0 = 1)', () => {
    expect(calculateNextCost(100, 1.15, 0)).toBe(100)
  })

  it('returns ceil(baseCost * growthRate) at level 1', () => {
    expect(calculateNextCost(100, 1.15, 1)).toBe(Math.ceil(100 * 1.15))
  })

  it('applies ceiling rounding', () => {
    // 7 * 1.15 = 8.05 → ceiled to 9
    expect(calculateNextCost(7, 1.15, 1)).toBe(9)
  })

  it('compounds correctly over 5 levels', () => {
    const expected = Math.ceil(100 * Math.pow(1.15, 5))
    expect(calculateNextCost(100, 1.15, 5)).toBe(expected)
  })
})

describe('levelCost', () => {
  it('uses FLOOR_COST_MULTIPLIER (1.15) and the def baseCost', () => {
    const expected = Math.ceil(SPELL_LAB.baseCost * Math.pow(FLOOR_COST_MULTIPLIER, 0))
    expect(levelCost(SPELL_LAB, 0)).toBe(expected)
  })

  it('increases with level', () => {
    expect(levelCost(SPELL_LAB, 5)).toBeGreaterThan(levelCost(SPELL_LAB, 0))
    expect(levelCost(SPELL_LAB, 10)).toBeGreaterThan(levelCost(SPELL_LAB, 5))
  })

  it('matches FLOOR_COST_MULTIPLIER constant (1.15)', () => {
    expect(FLOOR_COST_MULTIPLIER).toBe(1.15)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getFloorTier / floorTierMult
// ─────────────────────────────────────────────────────────────────────────────
describe('getFloorTier', () => {
  it('returns 0 (Garage) for floors 1–4', () => {
    for (let f = 1; f <= 4; f++) expect(getFloorTier(f)).toBe(0)
  })

  it('returns 1 (Startup) for floors 5–9', () => {
    for (let f = 5; f <= 9; f++) expect(getFloorTier(f)).toBe(1)
  })

  it('returns 2 (Corporate) for floors 10–14', () => {
    for (let f = 10; f <= 14; f++) expect(getFloorTier(f)).toBe(2)
  })

  it('returns 3 (CyberHub) for floors 15 and above', () => {
    for (let f = 15; f <= 20; f++) expect(getFloorTier(f)).toBe(3)
  })
})

describe('floorTierMult', () => {
  it('returns 1 for array index 0 (floor 1, Garage tier)', () => {
    expect(floorTierMult(0)).toBe(1)
  })

  it('returns 2 for array index 4 (floor 5, Startup tier)', () => {
    expect(floorTierMult(4)).toBe(2)
  })

  it('returns 5 for array index 9 (floor 10, Corporate tier)', () => {
    expect(floorTierMult(9)).toBe(5)
  })

  it('returns 12 for array index 14 (floor 15, CyberHub tier)', () => {
    expect(floorTierMult(14)).toBe(12)
  })

  it('FLOOR_TIER_CONFIG has exactly 4 tiers', () => {
    expect(FLOOR_TIER_CONFIG).toHaveLength(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// workerCount
// ─────────────────────────────────────────────────────────────────────────────
describe('workerCount', () => {
  it('returns 0 for level 0', () => {
    expect(workerCount(0)).toBe(0)
  })

  it('returns 1 for level 1', () => {
    expect(workerCount(1)).toBe(1)
  })

  it('caps at 4 workers for very high levels', () => {
    expect(workerCount(9999)).toBe(4)
  })

  it('grows logarithmically', () => {
    const w1  = workerCount(1)
    const w10 = workerCount(10)
    const w100 = workerCount(100)
    expect(w10).toBeGreaterThanOrEqual(w1)
    expect(w100).toBeGreaterThanOrEqual(w10)
  })

  it('never exceeds 4', () => {
    for (let l = 0; l <= 1000; l += 50) {
      expect(workerCount(l)).toBeLessThanOrEqual(4)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getBulkCost
// ─────────────────────────────────────────────────────────────────────────────
describe('getBulkCost', () => {
  it('returns 0 for qty 0', () => {
    expect(getBulkCost(SPELL_LAB, 1, 0)).toBe(0)
  })

  it('equals levelCost for qty 1', () => {
    expect(getBulkCost(SPELL_LAB, 1, 1)).toBe(levelCost(SPELL_LAB, 1))
  })

  it('sums costs across consecutive levels for qty > 1', () => {
    const expected = levelCost(SPELL_LAB, 0) + levelCost(SPELL_LAB, 1) + levelCost(SPELL_LAB, 2)
    expect(getBulkCost(SPELL_LAB, 0, 3)).toBe(expected)
  })

  it('result is always a whole number (Math.ceil applied)', () => {
    const result = getBulkCost(SPELL_LAB, 0, 5)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('increases monotonically with qty', () => {
    const c1 = getBulkCost(SPEED_DESK, 0, 5)
    const c2 = getBulkCost(SPEED_DESK, 0, 10)
    expect(c2).toBeGreaterThan(c1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getMaxQty
// ─────────────────────────────────────────────────────────────────────────────
describe('getMaxQty', () => {
  it('returns { qty:0, cost:0 } when budget is 0', () => {
    expect(getMaxQty(SPELL_LAB, 0, 0)).toEqual({ qty: 0, cost: 0 })
  })

  it('returns 1 when budget equals exactly the cost of one level', () => {
    const cost1 = levelCost(SPELL_LAB, 0)
    const { qty } = getMaxQty(SPELL_LAB, 0, cost1)
    expect(qty).toBe(1)
  })

  it('does not exceed budget', () => {
    const budget = 100
    const { qty, cost } = getMaxQty(SPELL_LAB, 0, budget)
    expect(cost).toBeLessThanOrEqual(budget)
    if (qty > 0) {
      // one more level would exceed budget
      const withOneMore = getBulkCost(SPELL_LAB, 0, qty + 1)
      expect(withOneMore).toBeGreaterThan(budget)
    }
  })

  it('qty increases with budget', () => {
    const { qty: q1 } = getMaxQty(SPELL_LAB, 0, 50)
    const { qty: q2 } = getMaxQty(SPELL_LAB, 0, 500)
    expect(q2).toBeGreaterThanOrEqual(q1)
  })

  it('returned cost equals getBulkCost(def, startLevel, qty)', () => {
    const { qty, cost } = getMaxQty(SPELL_LAB, 0, 1000)
    expect(cost).toBe(getBulkCost(SPELL_LAB, 0, qty))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateMultiCost
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateMultiCost', () => {
  it('returns baseCost * multiplier^currentLevel when n=1', () => {
    const base = 100, level = 0, mult = 1.15
    expect(calculateMultiCost(base, level, mult, 1)).toBeCloseTo(base * Math.pow(mult, level))
  })

  it('handles multiplier=1 degenerate path (linear cost)', () => {
    // When multiplier=1, every level costs the same: baseCost * n
    expect(calculateMultiCost(10, 0, 1, 5)).toBeCloseTo(50)
    expect(calculateMultiCost(10, 3, 1, 5)).toBeCloseTo(50)
  })

  it('uses geometric series formula for multiplier != 1', () => {
    const base = 100, level = 0, mult = 1.15, n = 5
    const expected = base * ((Math.pow(mult, n) - 1) / (mult - 1))
    expect(calculateMultiCost(base, level, mult, n)).toBeCloseTo(expected)
  })

  it('result for n=10 is greater than result for n=5 (same params)', () => {
    expect(calculateMultiCost(100, 0, 1.15, 10)).toBeGreaterThan(calculateMultiCost(100, 0, 1.15, 5))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateMaxAffordable
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateMaxAffordable', () => {
  it('returns 0 when currentCash is 0', () => {
    expect(calculateMaxAffordable(100, 0, 1.15, 0)).toBe(0)
  })

  it('returns 0 when cash is less than the cost of the first level', () => {
    // cost at level 0 = 100 * 1 = 100; cash = 99
    expect(calculateMaxAffordable(100, 0, 1.15, 99)).toBe(0)
  })

  it('returns a positive integer when cash >= first level cost', () => {
    const result = calculateMaxAffordable(100, 0, 1.15, 1000)
    expect(result).toBeGreaterThan(0)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('handles multiplier=1 degenerate path (simple division)', () => {
    // cost per level = 10, cash = 100 → can buy 10 levels
    expect(calculateMaxAffordable(10, 0, 1, 100)).toBe(10)
  })

  it('increases with more cash', () => {
    const q1 = calculateMaxAffordable(100, 0, 1.15, 500)
    const q2 = calculateMaxAffordable(100, 0, 1.15, 5000)
    expect(q2).toBeGreaterThan(q1)
  })

  it('never allows buying more than actually affordable', () => {
    const base = 100, level = 0, mult = 1.15, cash = 999
    const qty = calculateMaxAffordable(base, level, mult, cash)
    const totalCost = calculateMultiCost(base, level, mult, qty)
    expect(totalCost).toBeLessThanOrEqual(cash)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// calculateOfflineProgress
// ─────────────────────────────────────────────────────────────────────────────
describe('calculateOfflineProgress', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns { earned:0, seconds:0 } when lastSavedTimestamp is missing', () => {
    expect(calculateOfflineProgress({})).toEqual({ earned: 0, seconds: 0 })
    expect(calculateOfflineProgress(null)).toEqual({ earned: 0, seconds: 0 })
  })

  it('returns { earned:0, seconds:0 } when gap is less than 60 seconds', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const data = makeSavedData({ lastSavedTimestamp: now - 30_000 })   // 30 s ago
    expect(calculateOfflineProgress(data)).toEqual({ earned: 0, seconds: 0 })
  })

  it('returns { earned:0, seconds:0 } when elevator manager is not hired', () => {
    const data = makeSavedData({ elevatorHired: false, salesHired: true })
    expect(calculateOfflineProgress(data)).toEqual({ earned: 0, seconds: 0 })
  })

  it('returns { earned:0, seconds:0 } when sales manager is not hired', () => {
    const data = makeSavedData({ elevatorHired: true, salesHired: false })
    expect(calculateOfflineProgress(data)).toEqual({ earned: 0, seconds: 0 })
  })

  it('returns { earned:0, seconds:0 } when neither manager is hired', () => {
    const data = makeSavedData({ elevatorHired: false, salesHired: false })
    expect(calculateOfflineProgress(data)).toEqual({ earned: 0, seconds: 0 })
  })

  it('caps offline time at 8 hours (28800 seconds)', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    // Save from 24 hours ago — should be capped at 8 h
    const data = makeSavedData({ lastSavedTimestamp: now - 24 * 3600 * 1000 })
    const { seconds } = calculateOfflineProgress(data)
    expect(seconds).toBe(8 * 3600)
  })

  it('earned is proportional to seconds (linear pipeline)', () => {
    // Use a very low-throughput scenario so bus/compiler are the bottleneck
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const twoHourAgo  = makeSavedData({ lastSavedTimestamp: now - 2 * 3600 * 1000 })
    const fourHourAgo = makeSavedData({ lastSavedTimestamp: now - 4 * 3600 * 1000 })

    const { earned: e2 } = calculateOfflineProgress(twoHourAgo)
    const { earned: e4 } = calculateOfflineProgress(fourHourAgo)
    // 4-hour session should earn approximately 2× a 2-hour session
    expect(e4).toBeCloseTo(e2 * 2, 0)
  })

  it('pipeline bottleneck: earned cannot exceed bus throughput per second × seconds', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    // Use max-level production but default (low) bus capacity to force bus bottleneck
    const data = makeSavedData({
      lastSavedTimestamp: now - 3600 * 1000,  // 1 hour
      floors:    FLOORS.map(() => ({ level: 500 })),   // very high production
      bus:       { capacity: 1, speed: 1 },             // 1 RC/s bottleneck
      compiler:  { batchSize: 999999, procTime: 1, convRate: 1 },
    })
    const { earned, seconds } = calculateOfflineProgress(data)
    // Bus RCPS = 1 * 1 = 1; convRate = 1; effective $/s ≤ 1
    expect(earned).toBeLessThanOrEqual(seconds + 1)   // ±1 for rounding
  })

  it('returns seconds as a rounded integer', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const data = makeSavedData({ lastSavedTimestamp: now - 90_000 })   // 90 s
    const { seconds } = calculateOfflineProgress(data)
    expect(Number.isInteger(seconds)).toBe(true)
    expect(seconds).toBe(90)
  })

  it('earned is rounded to 2 decimal places', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const data = makeSavedData({ lastSavedTimestamp: now - 3600 * 1000 })
    const { earned } = calculateOfflineProgress(data)
    // Check that rounding to 2 dp is applied (parseFloat(n.toFixed(2)) === n)
    expect(earned).toBe(parseFloat(earned.toFixed(2)))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FLOORS constant integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('FLOORS constant', () => {
  it('has exactly 7 floor definitions', () => {
    expect(FLOORS).toHaveLength(7)
  })

  it('each floor has required fields: id, baseCost, rcps', () => {
    FLOORS.forEach(f => {
      expect(f).toHaveProperty('id')
      expect(f).toHaveProperty('baseCost')
      expect(f).toHaveProperty('rcps')
      expect(f.baseCost).toBeGreaterThan(0)
      expect(f.rcps).toBeGreaterThan(0)
    })
  })

  it('baseCost increases monotonically across floors', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i].baseCost).toBeGreaterThan(FLOORS[i - 1].baseCost)
    }
  })

  it('rcps increases monotonically across floors', () => {
    for (let i = 1; i < FLOORS.length; i++) {
      expect(FLOORS[i].rcps).toBeGreaterThan(FLOORS[i - 1].rcps)
    }
  })

  it('shadow-den (floor 6) is the highest-cost floor', () => {
    const maxCost = Math.max(...FLOORS.map(f => f.baseCost))
    expect(FLOORS[6].baseCost).toBe(maxCost)
  })
})

// ─── INFRA_DEF constant ───────────────────────────────────────────────────────

describe('INFRA_DEF', () => {
  it('has a string id', () => {
    expect(typeof INFRA_DEF.id).toBe('string')
    expect(INFRA_DEF.id.length).toBeGreaterThan(0)
  })

  it('has a positive capacityPerLevel', () => {
    expect(INFRA_DEF.capacityPerLevel).toBeGreaterThan(0)
  })
})

// ─── infraCapacity ───────────────────────────────────────────────────────────

describe('infraCapacity', () => {
  it('returns 0 when infraLevel is 0 (emergency lockout)', () => {
    expect(infraCapacity(0)).toBe(0)
  })

  it('returns capacityPerLevel * infraLevel at level 1', () => {
    expect(infraCapacity(1)).toBe(INFRA_DEF.capacityPerLevel)
  })

  it('scales linearly with infra level', () => {
    expect(infraCapacity(3)).toBe(INFRA_DEF.capacityPerLevel * 3)
    expect(infraCapacity(5)).toBe(INFRA_DEF.capacityPerLevel * 5)
  })

  it('doubles when infraLevel doubles', () => {
    expect(infraCapacity(4)).toBe(infraCapacity(2) * 2)
  })

  it('infraLevel 1 covers at least 7 workstations at level 1 (initial game state)', () => {
    expect(infraCapacity(1)).toBeGreaterThanOrEqual(FLOORS.length)
  })
})

// ─── isUpgradeBlocked ─────────────────────────────────────────────────────────

describe('isUpgradeBlocked', () => {
  it('returns false when total + 1 does not exceed capacity', () => {
    const capacity = infraCapacity(1)
    expect(isUpgradeBlocked(capacity - 2, 1)).toBe(false)
  })

  it('returns false when total + 1 exactly equals capacity', () => {
    const capacity = infraCapacity(1)
    expect(isUpgradeBlocked(capacity - 1, 1)).toBe(false)
  })

  it('returns true when total + 1 exceeds capacity by one', () => {
    const capacity = infraCapacity(1)
    expect(isUpgradeBlocked(capacity, 1)).toBe(true)
  })

  it('returns true when total is already above capacity', () => {
    const capacity = infraCapacity(1)
    expect(isUpgradeBlocked(capacity + 5, 1)).toBe(true)
  })

  it('returns true when infraLevel is 0 (no capacity at all)', () => {
    expect(isUpgradeBlocked(0, 0)).toBe(true)
  })

  it('unblocks when infraLevel is raised to cover the current total', () => {
    const capacity = infraCapacity(1)
    // At infraLevel 1 the upgrade is blocked …
    expect(isUpgradeBlocked(capacity, 1)).toBe(true)
    // … but after upgrading the infra room it is allowed.
    expect(isUpgradeBlocked(capacity, 2)).toBe(false)
  })

  it('does not alter levelCost (cost formulas are untouched)', () => {
    const before = levelCost(FLOORS[0], 0)
    isUpgradeBlocked(99, 1)
    expect(levelCost(FLOORS[0], 0)).toBe(before)
  })
})

// ─── heroFloorMult ────────────────────────────────────────────────────────────

describe('heroFloorMult', () => {
  it('returns HERO_FLOOR_BONUS (1.15) when hero names match exactly', () => {
    expect(heroFloorMult('Arcanos', 'Arcanos')).toBe(HERO_FLOOR_BONUS)
  })

  it('returns HERO_FLOOR_BONUS when hero names match case-insensitively', () => {
    expect(heroFloorMult('arcanos', 'ARCANOS')).toBe(HERO_FLOOR_BONUS)
    expect(heroFloorMult('Blaze', 'blaze')).toBe(HERO_FLOOR_BONUS)
    expect(heroFloorMult('SHADOW', 'Shadow')).toBe(HERO_FLOOR_BONUS)
  })

  it('returns 1.0 when hero names do not match', () => {
    expect(heroFloorMult('Arcanos', 'Blaze')).toBe(1.0)
    expect(heroFloorMult('Titan', 'Luna')).toBe(1.0)
  })

  it('returns 1.0 when floorHero is null', () => {
    expect(heroFloorMult(null, 'Arcanos')).toBe(1.0)
  })

  it('returns 1.0 when floorHero is undefined', () => {
    expect(heroFloorMult(undefined, 'Arcanos')).toBe(1.0)
  })

  it('returns 1.0 when questSelectedHero is null', () => {
    expect(heroFloorMult('Arcanos', null)).toBe(1.0)
  })

  it('returns 1.0 when questSelectedHero is undefined', () => {
    expect(heroFloorMult('Arcanos', undefined)).toBe(1.0)
  })

  it('returns 1.0 when both arguments are null', () => {
    expect(heroFloorMult(null, null)).toBe(1.0)
  })

  it('applies the correct bonus value to each FLOORS entry when matched', () => {
    FLOORS.forEach(floor => {
      expect(heroFloorMult(floor.hero, floor.hero)).toBe(HERO_FLOOR_BONUS)
    })
  })
})

// ─── questLevelMult ───────────────────────────────────────────────────────────

describe('questLevelMult', () => {
  it('returns 1.0 at level 0 (no bonus)', () => {
    expect(questLevelMult(0)).toBe(1.0)
  })

  it('returns 1.0 at level 9 (not yet a full 10-level increment)', () => {
    expect(questLevelMult(9)).toBe(1.0)
  })

  it(`adds ${QUEST_LEVEL_BONUS_PER_10} per 10 levels`, () => {
    expect(questLevelMult(10)).toBeCloseTo(1 + QUEST_LEVEL_BONUS_PER_10)
    expect(questLevelMult(20)).toBeCloseTo(1 + QUEST_LEVEL_BONUS_PER_10 * 2)
    expect(questLevelMult(50)).toBeCloseTo(1 + QUEST_LEVEL_BONUS_PER_10 * 5)
  })

  it('caps at 1 + QUEST_LEVEL_MAX_BONUS when level is at the cap (200)', () => {
    expect(questLevelMult(200)).toBeCloseTo(1 + QUEST_LEVEL_MAX_BONUS)
  })

  it('does not exceed the cap even at very high levels', () => {
    expect(questLevelMult(500)).toBeCloseTo(1 + QUEST_LEVEL_MAX_BONUS)
    expect(questLevelMult(9999)).toBeCloseTo(1 + QUEST_LEVEL_MAX_BONUS)
  })

  it('returns 1.0 for null input', () => {
    expect(questLevelMult(null)).toBe(1.0)
  })

  it('returns 1.0 for undefined input', () => {
    expect(questLevelMult(undefined)).toBe(1.0)
  })

  it('returns 1.0 for negative levels (treated as 0)', () => {
    expect(questLevelMult(-5)).toBe(1.0)
  })
})

// ─── getTycoonUnlockedHeroes ──────────────────────────────────────────────────

describe('getTycoonUnlockedHeroes', () => {
  it('returns an empty array when no floors meet any threshold', () => {
    const floors = FLOORS.map(() => ({ level: 0 }))
    expect(getTycoonUnlockedHeroes(floors)).toEqual([])
  })

  it('returns a hero when its floor level exactly meets its threshold', () => {
    const lunaThreshold = HERO_UNLOCK_THRESHOLDS['Luna']
    const lunaIdx = FLOORS.findIndex(f => f.hero === 'Luna')
    const floors = FLOORS.map((_, i) => ({ level: i === lunaIdx ? lunaThreshold : 0 }))
    expect(getTycoonUnlockedHeroes(floors)).toContain('Luna')
  })

  it('returns a hero when its floor level exceeds its threshold', () => {
    const titanThreshold = HERO_UNLOCK_THRESHOLDS['Titan']
    const titanIdx = FLOORS.findIndex(f => f.hero === 'Titan')
    const floors = FLOORS.map((_, i) => ({ level: i === titanIdx ? titanThreshold + 10 : 0 }))
    expect(getTycoonUnlockedHeroes(floors)).toContain('Titan')
  })

  it('does not return a hero when its floor level is one below the threshold', () => {
    const zenithThreshold = HERO_UNLOCK_THRESHOLDS['Zenith']
    const zenithIdx = FLOORS.findIndex(f => f.hero === 'Zenith')
    const floors = FLOORS.map((_, i) => ({ level: i === zenithIdx ? zenithThreshold - 1 : 0 }))
    expect(getTycoonUnlockedHeroes(floors)).not.toContain('Zenith')
  })

  it('returns all heroes when every floor exceeds its threshold', () => {
    const floors = FLOORS.map(f => ({ level: (HERO_UNLOCK_THRESHOLDS[f.hero] ?? 0) + 10 }))
    const unlocked = getTycoonUnlockedHeroes(floors)
    Object.keys(HERO_UNLOCK_THRESHOLDS).forEach(hero => {
      expect(unlocked).toContain(hero)
    })
  })

  it('returns an empty array when passed an empty array', () => {
    expect(getTycoonUnlockedHeroes([])).toEqual([])
  })

  it('returns an empty array when passed null', () => {
    expect(getTycoonUnlockedHeroes(null)).toEqual([])
  })

  it('only lists heroes that appear in HERO_UNLOCK_THRESHOLDS (not Arcanos or Blaze)', () => {
    const floors = FLOORS.map(() => ({ level: 9999 }))
    const unlocked = getTycoonUnlockedHeroes(floors)
    expect(unlocked).not.toContain('Arcanos')
    expect(unlocked).not.toContain('Blaze')
  })
})
