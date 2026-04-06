import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FloatingTextManager } from '../FloatingTextManager.js'

// ─── DOM + rAF mocks ──────────────────────────────────────────────────────────

// jsdom (used by Vitest) provides document.createElement but its
// requestAnimationFrame is not driven by a real clock.  We replace both rAF
// and cAF with controllable stubs so we can advance time manually.

let rafCallbacks = []
let rafId = 0

function mockRaf(cb) {
  const id = ++rafId
  rafCallbacks.push({ id, cb })
  return id
}

function mockCaf(id) {
  rafCallbacks = rafCallbacks.filter(e => e.id !== id)
}

// Flush all pending rAF callbacks with a given timestamp, then clear the queue
function flushRaf(timestamp = 0) {
  const pending = [...rafCallbacks]
  rafCallbacks = []
  pending.forEach(({ cb }) => cb(timestamp))
}

// Helper: build a minimal parent element with a predictable computed position
function makeParent(position = 'relative') {
  const el = document.createElement('div')
  // jsdom getComputedStyle returns '' for un-styled properties; override via
  // Object.defineProperty so the FloatingTextManager branch works correctly.
  Object.defineProperty(el, '_fakePosition', { value: position, writable: true })
  return el
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  rafCallbacks = []
  rafId = 0
  vi.stubGlobal('requestAnimationFrame', mockRaf)
  vi.stubGlobal('cancelAnimationFrame',  mockCaf)
  vi.stubGlobal('getComputedStyle', (el) => ({
    position: el._fakePosition ?? 'relative',
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  rafCallbacks = []
})

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('FloatingTextManager — constructor', () => {
  it('appends an overlay canvas to the parent element', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    expect(parent.querySelector('canvas')).not.toBeNull()
    mgr.destroy()
  })

  it('overlay canvas has the default logical dimensions (800 × 600)', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    const canvas = parent.querySelector('canvas')

    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
    mgr.destroy()
  })

  it('respects custom logicalWidth / logicalHeight options', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent, { logicalWidth: 1280, logicalHeight: 720 })
    const canvas = parent.querySelector('canvas')

    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(720)
    mgr.destroy()
  })

  it('sets overlay canvas style: position absolute, pointer-events none', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    const canvas = parent.querySelector('canvas')

    expect(canvas.style.position).toBe('absolute')
    expect(canvas.style.pointerEvents).toBe('none')
    mgr.destroy()
  })

  it('forces parent position to relative when it is static', () => {
    const parent = makeParent('static')
    const mgr = new FloatingTextManager(parent)

    expect(parent.style.position).toBe('relative')
    mgr.destroy()
  })

  it('does not change parent position when it is already relative', () => {
    const parent = makeParent('relative')
    parent.style.position = 'relative'
    const mgr = new FloatingTextManager(parent)

    // style.position should remain unchanged (not re-set)
    expect(parent.style.position).toBe('relative')
    mgr.destroy()
  })

  it('schedules the first rAF tick immediately', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    expect(rafCallbacks.length).toBeGreaterThan(0)
    mgr.destroy()
  })
})

// ─── spawn() ─────────────────────────────────────────────────────────────────

describe('FloatingTextManager — spawn()', () => {
  it('increments activeCount by 1', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    expect(mgr.activeCount).toBe(0)
    mgr.spawn('+$1K', 100, 200)
    expect(mgr.activeCount).toBe(1)
    mgr.destroy()
  })

  it('can spawn multiple items', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    mgr.spawn('+$1K', 100, 200)
    mgr.spawn('+$2K', 150, 250)
    mgr.spawn('+$3K', 200, 300)
    expect(mgr.activeCount).toBe(3)
    mgr.destroy()
  })

  it('is a no-op after destroy()', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    mgr.destroy()

    // Should not throw and should not mutate destroyed state
    expect(() => mgr.spawn('+$1K', 100, 200)).not.toThrow()
    expect(mgr.activeCount).toBe(0)
  })
})

// ─── _tick() — position and opacity updates ───────────────────────────────────

describe('FloatingTextManager — _tick() animation', () => {
  it('does not move items on the very first tick (dt = 0)', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    mgr.spawn('+$1K', 100, 200)

    flushRaf(0)     // first tick: _lastTime set to 0, dt = 0
    expect(mgr.activeCount).toBe(1)

    // Access internal item — y must not have changed
    expect(mgr._items[0].y).toBe(200)
    mgr.destroy()
  })

  it('moves items upward (decreases y) proportional to elapsed time', () => {
    const parent = makeParent()
    // maxDt: 10 removes the 100 ms cap so we can drive large dt in tests
    const mgr = new FloatingTextManager(parent, { riseSpeed: 60, fadeRate: 0.01, maxDt: 10 })
    mgr.spawn('+$5K', 100, 200)

    flushRaf(0)       // first tick  (dt = 0)
    flushRaf(1000)    // second tick (dt = 1 s)

    // y should have decreased by ~60px (riseSpeed × 1 s)
    expect(mgr._items[0].y).toBeCloseTo(200 - 60, 0)
    mgr.destroy()
  })

  it('decreases opacity proportional to elapsed time', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent, { riseSpeed: 0, fadeRate: 0.5, maxDt: 10 })
    mgr.spawn('+$5K', 100, 200)

    flushRaf(0)
    flushRaf(500)   // dt = 0.5 s

    expect(mgr._items[0].opacity).toBeCloseTo(1.0 - 0.25, 5) // 0.5 × 0.5
    mgr.destroy()
  })

  it('caps delta-time at the configured maxDt to prevent jumps after tab blur', () => {
    const parent = makeParent()
    // Default maxDt is 0.1 s — verify the cap is applied
    const mgr = new FloatingTextManager(parent, { riseSpeed: 60, fadeRate: 0.01 })
    mgr.spawn('+$5K', 100, 200)

    flushRaf(0)
    flushRaf(5000)   // 5 s — should be capped at 0.1 s

    // Maximum movement per capped tick: 60 × 0.1 = 6 px
    expect(mgr._items[0].y).toBeCloseTo(200 - 6, 0)
    mgr.destroy()
  })

  it('schedules another rAF after each tick', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    flushRaf(0)

    expect(rafCallbacks.length).toBeGreaterThan(0)
    mgr.destroy()
  })
})

// ─── Garbage collection ───────────────────────────────────────────────────────

describe('FloatingTextManager — garbage collection', () => {
  it('removes an item once its opacity drops to 0', () => {
    const parent = makeParent()
    // fadeRate 2.0, maxDt removed → fully faded in 0.5 s at dt=1 s
    const mgr = new FloatingTextManager(parent, { riseSpeed: 0, fadeRate: 2.0, maxDt: 10 })
    mgr.spawn('+$1K', 100, 200)

    flushRaf(0)       // establish _lastTime
    flushRaf(1000)    // dt = 1 s → opacity = 1 - 2 = -1 → removed

    expect(mgr.activeCount).toBe(0)
    mgr.destroy()
  })

  it('only removes items whose opacity has reached 0, keeping others alive', () => {
    const parent = makeParent()
    // fadeRate 2.0, maxDt=10: first item spawned before tick 1; second after tick 1.
    // After the large-dt tick both will expire; verify clean removal of both.
    const mgr = new FloatingTextManager(parent, { riseSpeed: 0, fadeRate: 2.0, maxDt: 10 })

    mgr.spawn('+$1K', 100, 200)
    flushRaf(0)       // tick 1: dt=0, first item unchanged

    // Spawn second item after the zero-dt tick so it also starts at opacity=1
    mgr.spawn('+$2K', 150, 250)
    expect(mgr.activeCount).toBe(2)

    // Tick 2: dt=0.3 s → both items: opacity = 1 - 2*0.3 = 0.4 (both still alive)
    flushRaf(300)
    expect(mgr.activeCount).toBe(2)

    // Tick 3: dt=0.3 s → both: opacity = 0.4 - 0.6 = -0.2 → both removed
    flushRaf(600)
    expect(mgr.activeCount).toBe(0)
    mgr.destroy()
  })

  it('keeps alive items spawned just before expiry', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent, { riseSpeed: 0, fadeRate: 1.0, maxDt: 10 })
    mgr.spawn('+$1K', 100, 200)

    flushRaf(0)
    flushRaf(500)     // dt = 0.5 s → opacity = 0.5 (still alive)

    expect(mgr.activeCount).toBe(1)
    expect(mgr._items[0].opacity).toBeCloseTo(0.5, 5)

    flushRaf(1500)    // dt = 1 s → opacity = 0.5 - 1 = -0.5 → removed
    expect(mgr.activeCount).toBe(0)
    mgr.destroy()
  })

  it('handles many rapid spawns without errors', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent, { riseSpeed: 0, fadeRate: 2.0, maxDt: 10 })

    flushRaf(0)

    for (let i = 0; i < 50; i++) mgr.spawn(`+$${i}`, i * 10, 300)
    expect(mgr.activeCount).toBe(50)

    flushRaf(2000)   // dt = 2 s → all expired (opacity = 1 - 2*2 = -3)
    expect(mgr.activeCount).toBe(0)
    mgr.destroy()
  })
})

// ─── destroy() ────────────────────────────────────────────────────────────────

describe('FloatingTextManager — destroy()', () => {
  it('cancels the rAF loop (no further callbacks queued)', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    flushRaf(0)          // process first tick (queues another)
    rafCallbacks = []    // clear any pending callbacks manually

    mgr.destroy()

    // _tick should not re-queue anything after destroy
    flushRaf(100)
    expect(rafCallbacks.length).toBe(0)
  })

  it('removes the overlay canvas from the DOM', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)

    expect(parent.querySelector('canvas')).not.toBeNull()
    mgr.destroy()
    expect(parent.querySelector('canvas')).toBeNull()
  })

  it('empties the items list', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    mgr.spawn('+$1K', 100, 200)
    mgr.spawn('+$2K', 200, 300)

    mgr.destroy()
    expect(mgr.activeCount).toBe(0)
  })

  it('is idempotent — calling destroy() twice does not throw', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    expect(() => { mgr.destroy(); mgr.destroy() }).not.toThrow()
  })
})

// ─── Text formatting (labels) ─────────────────────────────────────────────────

describe('FloatingTextManager — spawn labels (integration smoke)', () => {
  it('stores the exact string passed to spawn()', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    mgr.spawn('+$5.8K', 300, 200)

    expect(mgr._items[0].text).toBe('+$5.8K')
    mgr.destroy()
  })

  it('handles unicode / emoji labels without throwing', () => {
    const parent = makeParent()
    const mgr = new FloatingTextManager(parent)
    expect(() => mgr.spawn('💰 +$1M', 400, 300)).not.toThrow()
    mgr.destroy()
  })
})
