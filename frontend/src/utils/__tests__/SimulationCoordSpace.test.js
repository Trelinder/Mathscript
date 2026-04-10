import { describe, it, expect } from 'vitest'
import {
  SIM_CANVAS_WIDTH,
  SIM_CANVAS_HEIGHT,
  SIM_FLOOR_ORIGINS,
  SIM_INFRA_ORIG,
  simToCanvas,
  canvasNormToViewport,
  buildFloorCoords,
  buildInfraOrig,
} from '../SimulationCoordSpace.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
describe('constants', () => {
  it('SIM_CANVAS_WIDTH is 800', () => {
    expect(SIM_CANVAS_WIDTH).toBe(800)
  })

  it('SIM_CANVAS_HEIGHT is 450', () => {
    expect(SIM_CANVAS_HEIGHT).toBe(450)
  })

  it('SIM_FLOOR_ORIGINS has entries for floors 1 through 7', () => {
    for (let floor = 1; floor <= 7; floor++) {
      expect(SIM_FLOOR_ORIGINS).toHaveProperty(String(floor))
    }
  })

  it('every SIM_FLOOR_ORIGINS entry has normX = 0.5 (horizontal centre)', () => {
    for (const { normX } of Object.values(SIM_FLOOR_ORIGINS)) {
      expect(normX).toBe(0.5)
    }
  })

  it('SIM_FLOOR_ORIGINS normY values are in the (0, 1) range', () => {
    for (const { normY } of Object.values(SIM_FLOOR_ORIGINS)) {
      expect(normY).toBeGreaterThan(0)
      expect(normY).toBeLessThan(1)
    }
  })

  it('higher floor numbers have lower normY (higher on screen)', () => {
    // Floor 7 (penthouse) should have a smaller normY than floor 1 (ground)
    expect(SIM_FLOOR_ORIGINS[7].normY).toBeLessThan(SIM_FLOOR_ORIGINS[1].normY)
  })

  it('floor normY values decrease monotonically from floor 1 to floor 7', () => {
    for (let f = 1; f < 7; f++) {
      expect(SIM_FLOOR_ORIGINS[f + 1].normY).toBeLessThan(SIM_FLOOR_ORIGINS[f].normY)
    }
  })

  it('SIM_FLOOR_ORIGINS floor 1 normY is approximately 0.711', () => {
    expect(SIM_FLOOR_ORIGINS[1].normY).toBeCloseTo(320 / 450, 4)
  })

  it('SIM_INFRA_ORIG has normX and normY properties', () => {
    expect(SIM_INFRA_ORIG).toHaveProperty('normX')
    expect(SIM_INFRA_ORIG).toHaveProperty('normY')
  })

  it('SIM_INFRA_ORIG normX is approximately 0.42', () => {
    expect(SIM_INFRA_ORIG.normX).toBeCloseTo(336 / 800, 4)
  })

  it('SIM_INFRA_ORIG normY is approximately 0.833', () => {
    expect(SIM_INFRA_ORIG.normY).toBeCloseTo(375 / 450, 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// simToCanvas
// ─────────────────────────────────────────────────────────────────────────────
describe('simToCanvas', () => {
  it('returns an object with x and y properties', () => {
    const result = simToCanvas(0.5, 0.5, 800, 450)
    expect(result).toHaveProperty('x')
    expect(result).toHaveProperty('y')
  })

  it('maps (0, 0) to canvas origin (0, 0)', () => {
    expect(simToCanvas(0, 0, 800, 450)).toEqual({ x: 0, y: 0 })
  })

  it('maps (1, 1) to far bottom-right corner of the canvas', () => {
    expect(simToCanvas(1, 1, 800, 450)).toEqual({ x: 800, y: 450 })
  })

  it('maps (0.5, 0.5) to the centre of the reference canvas', () => {
    expect(simToCanvas(0.5, 0.5, 800, 450)).toEqual({ x: 400, y: 225 })
  })

  it('scales correctly with a non-reference canvas size', () => {
    // 1600×900 is 2× the reference
    expect(simToCanvas(0.5, 0.5, 1600, 900)).toEqual({ x: 800, y: 450 })
  })

  it('x = normX × canvasW', () => {
    const { x } = simToCanvas(0.25, 0, 1000, 500)
    expect(x).toBe(250)
  })

  it('y = normY × canvasH', () => {
    const { y } = simToCanvas(0, 0.8, 1000, 500)
    expect(y).toBe(400)
  })

  it('handles zero-dimension canvas (degenerate case)', () => {
    expect(simToCanvas(0.5, 0.5, 0, 0)).toEqual({ x: 0, y: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// canvasNormToViewport
// ─────────────────────────────────────────────────────────────────────────────
describe('canvasNormToViewport', () => {
  /** Helper: create a DOMRect-like object. */
  function makeRect({ left = 0, top = 0, width = 800, height = 450 } = {}) {
    return { left, top, width, height }
  }

  it('returns an object with left and top properties', () => {
    const result = canvasNormToViewport(0.5, 0.5, makeRect())
    expect(result).toHaveProperty('left')
    expect(result).toHaveProperty('top')
  })

  it('maps (0, 0) with no canvas offset to (0, 0)', () => {
    expect(canvasNormToViewport(0, 0, makeRect())).toEqual({ left: 0, top: 0 })
  })

  it('maps (1, 1) to (canvasWidth, canvasHeight) when rect is at origin', () => {
    expect(canvasNormToViewport(1, 1, makeRect())).toEqual({ left: 800, top: 450 })
  })

  it('accounts for canvas offset from the document origin', () => {
    const rect = makeRect({ left: 100, top: 50, width: 800, height: 450 })
    const result = canvasNormToViewport(0, 0, rect)
    expect(result).toEqual({ left: 100, top: 50 })
  })

  it('maps the centre correctly with an offset canvas', () => {
    const rect = makeRect({ left: 200, top: 100, width: 800, height: 450 })
    const result = canvasNormToViewport(0.5, 0.5, rect)
    expect(result).toEqual({ left: 600, top: 325 })
  })

  it('rounds to the nearest integer (Math.round)', () => {
    const rect = makeRect({ left: 0, top: 0, width: 300, height: 100 })
    // normX = 1/3 → 300 × (1/3) = 100.000... rounds to 100
    const result = canvasNormToViewport(1 / 3, 1 / 3, rect)
    expect(Number.isInteger(result.left)).toBe(true)
    expect(Number.isInteger(result.top)).toBe(true)
  })

  it('works with a small phone-sized canvas', () => {
    const rect = makeRect({ left: 0, top: 0, width: 375, height: 667 })
    const result = canvasNormToViewport(0.5, 0.5, rect)
    expect(result.left).toBe(Math.round(375 * 0.5))
    expect(result.top).toBe(Math.round(667 * 0.5))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildFloorCoords
// ─────────────────────────────────────────────────────────────────────────────
describe('buildFloorCoords', () => {
  const canvasW = 800
  const canvasH = 450

  it('returns an object with keys for floors 1 through 7', () => {
    const coords = buildFloorCoords(canvasW, canvasH)
    for (let f = 1; f <= 7; f++) {
      expect(coords).toHaveProperty(f)
    }
  })

  it('each floor entry has x and y properties', () => {
    const coords = buildFloorCoords(canvasW, canvasH)
    for (const v of Object.values(coords)) {
      expect(v).toHaveProperty('x')
      expect(v).toHaveProperty('y')
    }
  })

  it('floor 1 pixel x equals normX × canvasW on reference canvas', () => {
    const coords = buildFloorCoords(800, 450)
    expect(coords[1].x).toBeCloseTo(0.5 * 800, 5)
  })

  it('floor 1 pixel y equals normY × canvasH on reference canvas', () => {
    const coords = buildFloorCoords(800, 450)
    expect(coords[1].y).toBeCloseTo((320 / 450) * 450, 5)
  })

  it('keys are numeric (not strings)', () => {
    const coords = buildFloorCoords(canvasW, canvasH)
    for (const key of Object.keys(coords)) {
      expect(typeof coords[Number(key)]).toBe('object')
    }
  })

  it('scales correctly with a 2× canvas', () => {
    const ref   = buildFloorCoords(800, 450)
    const dbl   = buildFloorCoords(1600, 900)
    for (let f = 1; f <= 7; f++) {
      expect(dbl[f].x).toBeCloseTo(ref[f].x * 2, 5)
      expect(dbl[f].y).toBeCloseTo(ref[f].y * 2, 5)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildInfraOrig
// ─────────────────────────────────────────────────────────────────────────────
describe('buildInfraOrig', () => {
  it('returns an object with origX and origY', () => {
    const orig = buildInfraOrig(800, 450)
    expect(orig).toHaveProperty('origX')
    expect(orig).toHaveProperty('origY')
  })

  it('origX equals SIM_INFRA_ORIG.normX × canvasW', () => {
    const orig = buildInfraOrig(800, 450)
    expect(orig.origX).toBeCloseTo(SIM_INFRA_ORIG.normX * 800, 5)
  })

  it('origY equals SIM_INFRA_ORIG.normY × canvasH', () => {
    const orig = buildInfraOrig(800, 450)
    expect(orig.origY).toBeCloseTo(SIM_INFRA_ORIG.normY * 450, 5)
  })

  it('scales correctly with a 2× canvas', () => {
    const ref = buildInfraOrig(800, 450)
    const dbl = buildInfraOrig(1600, 900)
    expect(dbl.origX).toBeCloseTo(ref.origX * 2, 5)
    expect(dbl.origY).toBeCloseTo(ref.origY * 2, 5)
  })

  it('reference canvas origY is approximately 375', () => {
    const orig = buildInfraOrig(800, 450)
    expect(orig.origY).toBeCloseTo(375, 1)
  })
})
