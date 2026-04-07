/**
 * LogisticsManager.test.js
 *
 * Unit tests for the Raw Materials sub-currency tracker.
 * Verifies add/consume/get/reset semantics, pool cap, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createLogisticsManager, RM_POOL_MAX } from '../LogisticsManager.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMgr() { return createLogisticsManager() }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createLogisticsManager — initial state', () => {
  it('starts with pool = 0', () => {
    const m = makeMgr()
    expect(m.get()).toBe(0)
  })
})

describe('add', () => {
  it('increases the pool by the given amount', () => {
    const m = makeMgr()
    m.add(5)
    expect(m.get()).toBe(5)
  })

  it('accumulates multiple add calls', () => {
    const m = makeMgr()
    m.add(3)
    m.add(2.5)
    expect(m.get()).toBeCloseTo(5.5)
  })

  it('ignores zero and negative amounts', () => {
    const m = makeMgr()
    m.add(0)
    m.add(-10)
    expect(m.get()).toBe(0)
  })

  it(`caps the pool at RM_POOL_MAX (${RM_POOL_MAX})`, () => {
    const m = makeMgr()
    m.add(RM_POOL_MAX + 999)
    expect(m.get()).toBe(RM_POOL_MAX)
  })

  it('does not exceed cap after many small adds', () => {
    const m = makeMgr()
    for (let i = 0; i < 100; i++) m.add(2)
    expect(m.get()).toBeLessThanOrEqual(RM_POOL_MAX)
  })
})

describe('consume', () => {
  it('returns true and debits the pool when sufficient balance exists', () => {
    const m = makeMgr()
    m.add(10)
    const ok = m.consume(3)
    expect(ok).toBe(true)
    expect(m.get()).toBeCloseTo(7)
  })

  it('returns false and leaves the pool unchanged when balance is insufficient', () => {
    const m = makeMgr()
    m.add(2)
    const ok = m.consume(5)
    expect(ok).toBe(false)
    expect(m.get()).toBeCloseTo(2)
  })

  it('returns false when the pool is exactly 0', () => {
    const m = makeMgr()
    expect(m.consume(1)).toBe(false)
  })

  it('returns true when cost is 0 (zero-cost consume)', () => {
    const m = makeMgr()
    expect(m.consume(0)).toBe(true)
    expect(m.get()).toBe(0)
  })

  it('allows consuming the exact pool balance', () => {
    const m = makeMgr()
    m.add(7)
    const ok = m.consume(7)
    expect(ok).toBe(true)
    expect(m.get()).toBeCloseTo(0)
  })

  it('multiple sequential consumes deplete the pool correctly', () => {
    const m = makeMgr()
    m.add(10)
    m.consume(3)
    m.consume(3)
    m.consume(3)
    expect(m.get()).toBeCloseTo(1)
    expect(m.consume(3)).toBe(false)  // 1 < 3 → blocked
  })
})

describe('reset', () => {
  it('resets pool to 0 after adds', () => {
    const m = makeMgr()
    m.add(RM_POOL_MAX)
    m.reset()
    expect(m.get()).toBe(0)
  })

  it('allows re-filling after reset', () => {
    const m = makeMgr()
    m.add(10)
    m.reset()
    m.add(5)
    expect(m.get()).toBe(5)
  })
})

describe('interplay — T1/T2 simulation', () => {
  it('T2 worker is blocked until T1 fills the pool', () => {
    const m = makeMgr()
    // Initially empty — T2 blocked
    expect(m.consume(1)).toBe(false)
    // T1 adds materials
    m.add(3)
    // T2 can now consume
    expect(m.consume(1)).toBe(true)
    expect(m.consume(1)).toBe(true)
    expect(m.consume(1)).toBe(true)
    // Pool exhausted — T2 blocked again
    expect(m.consume(1)).toBe(false)
  })

  it('multiple instances are independent (no shared state)', () => {
    const a = makeMgr()
    const b = makeMgr()
    a.add(10)
    expect(b.get()).toBe(0)
  })
})
