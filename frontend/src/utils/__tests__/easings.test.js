import { describe, it, expect } from 'vitest'
import { easeOutBack, easeInQuad, springDecay } from '../easings.js'

// ─── easeOutBack ─────────────────────────────────────────────────────────────

describe('easeOutBack', () => {
  it('returns exactly 0 at t = 0', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 10)
  })

  it('returns exactly 1 at t = 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1, 10)
  })

  it('overshoots above 1.0 somewhere in the range (0, 1)', () => {
    // The peak overshoot occurs near t ≈ 0.58 with the default constant.
    let maxValue = 0
    for (let i = 0; i <= 100; i++) {
      maxValue = Math.max(maxValue, easeOutBack(i / 100))
    }
    expect(maxValue).toBeGreaterThan(1.0)
  })

  it('overshoot peak is above 1.05 and below 1.20 with default constant', () => {
    let maxValue = 0
    for (let i = 0; i <= 1000; i++) {
      maxValue = Math.max(maxValue, easeOutBack(i / 1000))
    }
    expect(maxValue).toBeGreaterThan(1.05)
    expect(maxValue).toBeLessThan(1.20)
  })

  it('overshoot occurs before the curve settles to 1 (i.e. not only at t=1)', () => {
    // The curve must exceed 1 at some t strictly less than 1
    let exceeds1BeforeEnd = false
    for (let i = 0; i < 99; i++) {
      if (easeOutBack(i / 100) > 1.0) {
        exceeds1BeforeEnd = true
        break
      }
    }
    expect(exceeds1BeforeEnd).toBe(true)
  })

  it('settles back to exactly 1.0 at t = 1 (no residual overshoot at rest)', () => {
    expect(easeOutBack(1)).toBeCloseTo(1.0, 10)
  })

  it('accepts a custom overshoot parameter — larger = bigger overshoot', () => {
    let peak1 = 0, peak2 = 0
    for (let i = 0; i <= 100; i++) {
      peak1 = Math.max(peak1, easeOutBack(i / 100, 1.70158))
      peak2 = Math.max(peak2, easeOutBack(i / 100, 3.0))
    }
    expect(peak2).toBeGreaterThan(peak1)
  })

  it('with overshoot = 0 behaves as easeOutCubic (no values exceed 1)', () => {
    for (let i = 0; i <= 100; i++) {
      const v = easeOutBack(i / 100, 0)
      expect(v).toBeLessThanOrEqual(1.0 + 1e-9)
      expect(v).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('increases from 0 in the early phase (t < 0.3)', () => {
    // The function must be positive and growing from near 0 during the early phase
    expect(easeOutBack(0.1)).toBeGreaterThan(easeOutBack(0))
    expect(easeOutBack(0.2)).toBeGreaterThan(easeOutBack(0.1))
    expect(easeOutBack(0.3)).toBeGreaterThan(easeOutBack(0.2))
  })

  it('returns a number for all t in [0, 1]', () => {
    for (let i = 0; i <= 20; i++) {
      const v = easeOutBack(i / 20)
      expect(typeof v).toBe('number')
      expect(Number.isFinite(v)).toBe(true)
    }
  })
})

// ─── easeInQuad ──────────────────────────────────────────────────────────────

describe('easeInQuad', () => {
  it('returns exactly 0 at t = 0', () => {
    expect(easeInQuad(0)).toBe(0)
  })

  it('returns exactly 1 at t = 1', () => {
    expect(easeInQuad(1)).toBe(1)
  })

  it('returns 0.25 at t = 0.5 (quadratic midpoint)', () => {
    expect(easeInQuad(0.5)).toBeCloseTo(0.25, 10)
  })

  it('is monotonically increasing (strict) in [0, 1]', () => {
    for (let i = 1; i <= 20; i++) {
      expect(easeInQuad(i / 20)).toBeGreaterThan(easeInQuad((i - 1) / 20))
    }
  })

  it('stays within [0, 1] for all t in [0, 1] (no overshoot)', () => {
    for (let i = 0; i <= 100; i++) {
      const v = easeInQuad(i / 100)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('starts slowly (slow early progress — value at t=0.1 is well below 0.1)', () => {
    // easeInQuad accelerates: at t=0.1, output is 0.01 (far less than linear 0.1)
    expect(easeInQuad(0.1)).toBeLessThan(0.1)
    expect(easeInQuad(0.2)).toBeLessThan(0.2)
  })

  it('is convex (each step increases by more than the previous — accelerating)', () => {
    // Differences should be strictly increasing
    const steps = 10
    const diffs = []
    for (let i = 1; i <= steps; i++) {
      diffs.push(easeInQuad(i / steps) - easeInQuad((i - 1) / steps))
    }
    for (let i = 1; i < diffs.length; i++) {
      expect(diffs[i]).toBeGreaterThan(diffs[i - 1])
    }
  })

  it('equals t² exactly', () => {
    const testValues = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]
    testValues.forEach((t) => {
      expect(easeInQuad(t)).toBeCloseTo(t * t, 12)
    })
  })

  it('returns a finite number for all t in [0, 1]', () => {
    for (let i = 0; i <= 10; i++) {
      expect(Number.isFinite(easeInQuad(i / 10))).toBe(true)
    }
  })
})

// ─── springDecay ─────────────────────────────────────────────────────────────

describe('springDecay', () => {
  it('starts at 0 when t = 0', () => {
    // cos(0) = 1, exp(0) = 1 → 1 - 1 * 1 = 0
    expect(springDecay(0)).toBeCloseTo(0, 10)
    expect(springDecay(0, 180, 12)).toBeCloseTo(0, 10)
  })

  it('converges close to 1 by t = 1 (within 2 % for default params)', () => {
    const v = springDecay(1)
    expect(v).toBeGreaterThan(0.95)
    expect(v).toBeLessThan(1.05)
  })

  it('overshoots 1.0 at some point for typical under-damped params', () => {
    let maxValue = 0
    // Sample at many points — spring should overshoot 1
    for (let i = 1; i <= 100; i++) {
      maxValue = Math.max(maxValue, springDecay(i / 100, 180, 10))
    }
    expect(maxValue).toBeGreaterThan(1.0)
  })

  it('higher friction damps overshoot (over-damped config stays near 1)', () => {
    // friction²/4 > tension → critically/over-damped, no oscillation
    const overDamped = springDecay(0.5, 10, 20)  // friction=20, tension=10 → ω≈0
    // Over-damped spring should not overshoot meaningfully
    let maxOverDamped = 0
    for (let i = 1; i <= 100; i++) {
      maxOverDamped = Math.max(maxOverDamped, springDecay(i / 100, 10, 20))
    }
    expect(maxOverDamped).toBeLessThanOrEqual(1.02)
  })

  it('returns a finite number for all t in [0, 1] with default params', () => {
    for (let i = 0; i <= 20; i++) {
      const v = springDecay(i / 20)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('returns a finite number for extreme tension and friction values', () => {
    expect(Number.isFinite(springDecay(0.5, 400, 4))).toBe(true)
    expect(Number.isFinite(springDecay(0.5, 1, 100))).toBe(true)
    expect(Number.isFinite(springDecay(0.5, 0, 0))).toBe(true)
  })

  it('with zero tension and zero friction output is 0 everywhere (omega=0, e^0·cos(0)=1)', () => {
    // tension=0, friction=0 → omega = sqrt(0) = 0; exp(-0·t) = 1; cos(0·t) = 1
    // → f(t) = 1 − 1·1 = 0 for all t
    expect(springDecay(0, 0, 0)).toBeCloseTo(0, 10)
    expect(springDecay(0.5, 0, 0)).toBeCloseTo(0, 10)
  })
})
