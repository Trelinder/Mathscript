import { describe, it, expect } from 'vitest'
import { PROP_SOCKETS, getSocketOffset } from '../PropSocketConfig.js'

// ─── PROP_SOCKETS registry structure ─────────────────────────────────────────

describe('PROP_SOCKETS registry', () => {
  it('exports a non-empty object', () => {
    expect(typeof PROP_SOCKETS).toBe('object')
    expect(Object.keys(PROP_SOCKETS).length).toBeGreaterThan(0)
  })

  it('default_work has exactly 4 frame entries', () => {
    expect(Array.isArray(PROP_SOCKETS.default_work)).toBe(true)
    expect(PROP_SOCKETS.default_work).toHaveLength(4)
  })

  it('default_idle has exactly 4 frame entries', () => {
    expect(Array.isArray(PROP_SOCKETS.default_idle)).toBe(true)
    expect(PROP_SOCKETS.default_idle).toHaveLength(4)
  })

  it('every socket entry has numeric dx and dy properties', () => {
    for (const [key, frames] of Object.entries(PROP_SOCKETS)) {
      for (const socket of frames) {
        expect(typeof socket.dx, `${key} dx`).toBe('number')
        expect(typeof socket.dy, `${key} dy`).toBe('number')
      }
    }
  })
})

// ─── getSocketOffset ──────────────────────────────────────────────────────────

describe('getSocketOffset — exact key lookup', () => {
  it('returns the correct frame entry when an exact key match exists', () => {
    // Inject a custom override into PROP_SOCKETS for this test
    PROP_SOCKETS['test_exact'] = [
      { dx: 5, dy: -10 },
      { dx: 7, dy: -12 },
    ]

    expect(getSocketOffset('test_exact', 0)).toEqual({ dx: 5, dy: -10 })
    expect(getSocketOffset('test_exact', 1)).toEqual({ dx: 7, dy: -12 })

    // Clean up
    delete PROP_SOCKETS['test_exact']
  })

  it('wraps frameIndex when it exceeds the array length (exact key)', () => {
    PROP_SOCKETS['test_wrap'] = [{ dx: 1, dy: -1 }, { dx: 2, dy: -2 }]

    expect(getSocketOffset('test_wrap', 2)).toEqual({ dx: 1, dy: -1 })  // 2 % 2 = 0
    expect(getSocketOffset('test_wrap', 3)).toEqual({ dx: 2, dy: -2 })  // 3 % 2 = 1

    delete PROP_SOCKETS['test_wrap']
  })
})

describe('getSocketOffset — suffix fallback', () => {
  it('routes any "_work" suffixed key to default_work offsets', () => {
    const frame0 = getSocketOffset('spell-lab_work', 0)
    expect(frame0).toEqual(PROP_SOCKETS.default_work[0])

    const frame2 = getSocketOffset('battle-dojo_work', 2)
    expect(frame2).toEqual(PROP_SOCKETS.default_work[2])
  })

  it('routes any "_idle" suffixed key to default_idle offsets', () => {
    const frame1 = getSocketOffset('spell-lab_idle', 1)
    expect(frame1).toEqual(PROP_SOCKETS.default_idle[1])
  })

  it('wraps frameIndex when it exceeds the default group length (suffix)', () => {
    // default_work has 4 entries; frameIndex 4 should map to index 0
    const result = getSocketOffset('any_work', 4)
    expect(result).toEqual(PROP_SOCKETS.default_work[0])
  })
})

describe('getSocketOffset — global fallback', () => {
  it('returns { dx: 0, dy: 0 } for an unknown animation key', () => {
    expect(getSocketOffset('unknown_animation', 0)).toEqual({ dx: 0, dy: 0 })
    expect(getSocketOffset('', 0)).toEqual({ dx: 0, dy: 0 })
  })

  it('returns { dx: 0, dy: 0 } for keys with no recognised suffix', () => {
    expect(getSocketOffset('hero_walk_s', 1)).toEqual({ dx: 0, dy: 0 })
    expect(getSocketOffset('hero_walk_n', 2)).toEqual({ dx: 0, dy: 0 })
    expect(getSocketOffset('custom_anim', 0)).toEqual({ dx: 0, dy: 0 })
  })
})

describe('getSocketOffset — return value properties', () => {
  it('always returns an object with numeric dx and dy', () => {
    const testKeys = ['spell-lab_work', 'battle-dojo_idle', 'unknown', '']
    for (const key of testKeys) {
      const result = getSocketOffset(key, 0)
      expect(typeof result.dx).toBe('number')
      expect(typeof result.dy).toBe('number')
    }
  })

  it('work offsets have a negative dy (prop is above the sprite origin)', () => {
    const { dy } = getSocketOffset('spell-lab_work', 0)
    expect(dy).toBeLessThan(0)
  })
})
