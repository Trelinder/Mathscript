/**
 * UplinkTechTree.test.js
 *
 * Unit tests for UPLINK_NODES catalogue, computeUplinkLevel, and
 * computeUplinkEffects.
 */
import { describe, it, expect } from 'vitest'
import {
  UPLINK_NODES,
  UPLINK_NODES_MAP,
  computeUplinkLevel,
  computeUplinkEffects,
} from '../UplinkTechTree.js'

// ─── UPLINK_NODES catalogue ──────────────────────────────────────────────────

describe('UPLINK_NODES', () => {
  it('contains exactly 5 nodes', () => {
    expect(UPLINK_NODES).toHaveLength(5)
  })

  it('each node has the required fields', () => {
    for (const node of UPLINK_NODES) {
      expect(typeof node.id).toBe('string')
      expect(node.id.length).toBeGreaterThan(0)
      expect(typeof node.label).toBe('string')
      expect(typeof node.desc).toBe('string')
      expect(typeof node.icon).toBe('string')
      expect(typeof node.cost).toBe('object')
      expect(typeof node.cost.power).toBe('number')
      expect(typeof node.cost.maint).toBe('number')
      expect(typeof node.effect).toBe('object')
      expect(typeof node.effect.type).toBe('string')
      expect(typeof node.effect.value).toBe('number')
    }
  })

  it('all costs are non-negative', () => {
    for (const node of UPLINK_NODES) {
      expect(node.cost.power).toBeGreaterThanOrEqual(0)
      expect(node.cost.maint).toBeGreaterThanOrEqual(0)
    }
  })

  it('each node costs at least one resource', () => {
    for (const node of UPLINK_NODES) {
      expect(node.cost.power + node.cost.maint).toBeGreaterThan(0)
    }
  })

  it('all effect values are positive', () => {
    for (const node of UPLINK_NODES) {
      expect(node.effect.value).toBeGreaterThan(0)
    }
  })

  it('all IDs are unique', () => {
    const ids = UPLINK_NODES.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all effect types are one of the recognised enum values', () => {
    const VALID_TYPES = new Set(['rcps_mult', 'bus_mult', 'conv_mult', 'proc_speedup'])
    for (const node of UPLINK_NODES) {
      expect(VALID_TYPES.has(node.effect.type)).toBe(true)
    }
  })

  it('u:power-amp and u:power-surge both have rcps_mult effects', () => {
    expect(UPLINK_NODES_MAP.get('u:power-amp')?.effect.type).toBe('rcps_mult')
    expect(UPLINK_NODES_MAP.get('u:power-surge')?.effect.type).toBe('rcps_mult')
  })

  it('u:maint-opt has bus_mult effect', () => {
    expect(UPLINK_NODES_MAP.get('u:maint-opt')?.effect.type).toBe('bus_mult')
  })

  it('u:grid-bridge has conv_mult effect', () => {
    expect(UPLINK_NODES_MAP.get('u:grid-bridge')?.effect.type).toBe('conv_mult')
  })

  it('u:deep-sync has proc_speedup effect', () => {
    expect(UPLINK_NODES_MAP.get('u:deep-sync')?.effect.type).toBe('proc_speedup')
  })
})

// ─── UPLINK_NODES_MAP ────────────────────────────────────────────────────────

describe('UPLINK_NODES_MAP', () => {
  it('contains all UPLINK_NODES ids', () => {
    for (const node of UPLINK_NODES) {
      expect(UPLINK_NODES_MAP.has(node.id)).toBe(true)
    }
  })

  it('maps to the correct objects', () => {
    for (const node of UPLINK_NODES) {
      expect(UPLINK_NODES_MAP.get(node.id)).toBe(node)
    }
  })

  it('has exactly the same number of entries as UPLINK_NODES', () => {
    expect(UPLINK_NODES_MAP.size).toBe(UPLINK_NODES.length)
  })
})

// ─── computeUplinkLevel ──────────────────────────────────────────────────────

describe('computeUplinkLevel', () => {
  it('returns 0 for an empty array', () => {
    expect(computeUplinkLevel([])).toBe(0)
  })

  it('returns 0 for null', () => {
    expect(computeUplinkLevel(null)).toBe(0)
  })

  it('returns 0 for undefined', () => {
    expect(computeUplinkLevel(undefined)).toBe(0)
  })

  it('returns the count of unlocked nodes', () => {
    expect(computeUplinkLevel(['u:power-amp'])).toBe(1)
    expect(computeUplinkLevel(['u:power-amp', 'u:maint-opt'])).toBe(2)
    expect(computeUplinkLevel(UPLINK_NODES.map(n => n.id))).toBe(UPLINK_NODES.length)
  })

  it('counts unknown IDs too (caller is responsible for deduplication)', () => {
    expect(computeUplinkLevel(['u:power-amp', 'unknown'])).toBe(2)
  })
})

// ─── computeUplinkEffects ─────────────────────────────────────────────────────

describe('computeUplinkEffects', () => {
  it('returns neutral effects for an empty array', () => {
    const fx = computeUplinkEffects([])
    expect(fx.rcpsMult).toBe(1)
    expect(fx.busMult).toBe(1)
    expect(fx.convMult).toBe(1)
    expect(fx.procSpeedup).toBe(0)
  })

  it('returns neutral effects for null / undefined', () => {
    const fxNull = computeUplinkEffects(null)
    expect(fxNull.rcpsMult).toBe(1)
    const fxUnd  = computeUplinkEffects(undefined)
    expect(fxUnd.busMult).toBe(1)
  })

  it('u:power-amp grants +10% rcpsMult', () => {
    const fx = computeUplinkEffects(['u:power-amp'])
    expect(fx.rcpsMult).toBeCloseTo(1.10, 6)
    expect(fx.busMult).toBe(1)
    expect(fx.convMult).toBe(1)
    expect(fx.procSpeedup).toBe(0)
  })

  it('u:maint-opt grants +10% busMult', () => {
    const fx = computeUplinkEffects(['u:maint-opt'])
    expect(fx.busMult).toBeCloseTo(1.10, 6)
  })

  it('u:grid-bridge grants +10% convMult', () => {
    const fx = computeUplinkEffects(['u:grid-bridge'])
    expect(fx.convMult).toBeCloseTo(1.10, 6)
  })

  it('u:deep-sync grants 0.20 procSpeedup', () => {
    const fx = computeUplinkEffects(['u:deep-sync'])
    expect(fx.procSpeedup).toBeCloseTo(0.20, 6)
  })

  it('stacks two rcps_mult nodes multiplicatively', () => {
    // u:power-amp (+10%) × u:power-surge (+20%) = 1.10 × 1.20 = 1.32
    const fx = computeUplinkEffects(['u:power-amp', 'u:power-surge'])
    expect(fx.rcpsMult).toBeCloseTo(1.10 * 1.20, 6)
  })

  it('stacking is commutative', () => {
    const ab = computeUplinkEffects(['u:power-amp', 'u:power-surge'])
    const ba = computeUplinkEffects(['u:power-surge', 'u:power-amp'])
    expect(ab.rcpsMult).toBeCloseTo(ba.rcpsMult, 10)
  })

  it('procSpeedup is additive but capped at 0.80', () => {
    // Two deep-sync nodes each give 0.20; additive → 0.40 (well below cap)
    const fx2 = computeUplinkEffects(['u:deep-sync', 'u:deep-sync'])
    expect(fx2.procSpeedup).toBeCloseTo(0.40, 6)

    // Simulate 10 × 0.20 = 2.0 but cap kicks in at 0.80
    const many = Array.from({ length: 10 }, () => 'u:deep-sync')
    const fxMany = computeUplinkEffects(many)
    expect(fxMany.procSpeedup).toBeCloseTo(0.80, 6)
  })

  it('ignores unknown node IDs silently', () => {
    const fx = computeUplinkEffects(['u:power-amp', 'nonexistent'])
    expect(fx.rcpsMult).toBeCloseTo(1.10, 6)
    expect(fx.busMult).toBe(1)
  })

  it('unlocking all nodes stacks correctly', () => {
    const allIds = UPLINK_NODES.map(n => n.id)
    const fx = computeUplinkEffects(allIds)
    // rcpsMult: power-amp (×1.10) × power-surge (×1.20)
    expect(fx.rcpsMult).toBeCloseTo(1.10 * 1.20, 6)
    // busMult: maint-opt (×1.10)
    expect(fx.busMult).toBeCloseTo(1.10, 6)
    // convMult: grid-bridge (×1.10)
    expect(fx.convMult).toBeCloseTo(1.10, 6)
    // procSpeedup: deep-sync (0.20)
    expect(fx.procSpeedup).toBeCloseTo(0.20, 6)
  })
})
