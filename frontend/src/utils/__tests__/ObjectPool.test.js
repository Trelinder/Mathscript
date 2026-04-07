import { describe, it, expect, vi } from 'vitest'
import { ObjectPool } from '../ObjectPool.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A simple factory that produces plain objects with a unique id. */
let _uid = 0
function makeFactory() {
  return () => ({ id: ++_uid, value: 0 })
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('ObjectPool — constructor', () => {
  it('throws when factory is not a function', () => {
    expect(() => new ObjectPool(null, 5)).toThrow(TypeError)
    expect(() => new ObjectPool('hello', 5)).toThrow(TypeError)
  })

  it('throws when initialSize is not a positive integer', () => {
    const f = makeFactory()
    expect(() => new ObjectPool(f, 0)).toThrow(RangeError)
    expect(() => new ObjectPool(f, -1)).toThrow(RangeError)
    expect(() => new ObjectPool(f, 1.5)).toThrow(RangeError)
    expect(() => new ObjectPool(f, 'ten')).toThrow(RangeError)
  })

  it('calls factory exactly initialSize times', () => {
    const spy = vi.fn(() => ({}))
    new ObjectPool(spy, 10)
    expect(spy).toHaveBeenCalledTimes(10)
  })

  it('starts with all objects in the free list', () => {
    const pool = new ObjectPool(makeFactory(), 5)
    expect(pool.freeCount).toBe(5)
    expect(pool.activeCount).toBe(0)
    expect(pool.totalSize).toBe(5)
  })

  it('defaults initialSize to 50 when omitted', () => {
    const pool = new ObjectPool(makeFactory())
    expect(pool.totalSize).toBe(50)
  })
})

// ─── acquire() ───────────────────────────────────────────────────────────────

describe('ObjectPool — acquire()', () => {
  it('returns an object from the free list', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const obj = pool.acquire()
    expect(obj).toBeDefined()
    expect(typeof obj).toBe('object')
  })

  it('moves the object from free to active', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    pool.acquire()
    expect(pool.freeCount).toBe(2)
    expect(pool.activeCount).toBe(1)
    expect(pool.totalSize).toBe(3)
  })

  it('can acquire all pre-allocated objects', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const a = pool.acquire()
    const b = pool.acquire()
    const c = pool.acquire()
    expect([a, b, c].every(Boolean)).toBe(true)
    expect(pool.freeCount).toBe(0)
    expect(pool.activeCount).toBe(3)
  })

  it('grows the pool when exhausted (growable: true — default)', () => {
    const pool = new ObjectPool(makeFactory(), 2)
    pool.acquire()
    pool.acquire()
    // Pool is now empty — next acquire should grow
    const extra = pool.acquire()
    expect(extra).not.toBeNull()
    expect(pool.totalSize).toBe(3)
    expect(pool.activeCount).toBe(3)
  })

  it('logs a warning when pool grows', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pool = new ObjectPool(makeFactory(), 1)
    pool.acquire()  // empties free list
    pool.acquire()  // should warn
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('returns null when exhausted and growable is false', () => {
    const pool = new ObjectPool(makeFactory(), 1, { growable: false })
    pool.acquire()       // takes the only free object
    const result = pool.acquire()
    expect(result).toBeNull()
    expect(pool.totalSize).toBe(1)
  })

  it('returns different objects on successive acquires', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const a = pool.acquire()
    const b = pool.acquire()
    expect(a).not.toBe(b)
  })

  it('totalSize is conserved (acquire does not create objects when free list has items)', () => {
    const pool = new ObjectPool(makeFactory(), 5)
    pool.acquire()
    pool.acquire()
    expect(pool.totalSize).toBe(5)   // no new objects created
  })
})

// ─── release() ───────────────────────────────────────────────────────────────

describe('ObjectPool — release()', () => {
  it('moves an active object back to the free list', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const obj = pool.acquire()
    expect(pool.activeCount).toBe(1)
    pool.release(obj)
    expect(pool.activeCount).toBe(0)
    expect(pool.freeCount).toBe(3)
    expect(pool.totalSize).toBe(3)
  })

  it('silently ignores release of an object not in the active list (no double-free)', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const foreign = { id: 9999 }
    expect(() => pool.release(foreign)).not.toThrow()
    expect(pool.totalSize).toBe(3)
  })

  it('released objects can be re-acquired', () => {
    const pool = new ObjectPool(makeFactory(), 1)
    const obj = pool.acquire()
    pool.release(obj)
    const obj2 = pool.acquire()
    expect(obj2).toBe(obj)   // same object returned from free list
  })

  it('does not duplicate objects after release', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const obj = pool.acquire()
    pool.release(obj)
    // Only one copy of obj should exist in the pool
    const all = [...pool.all]
    const occurrences = all.filter(o => o === obj).length
    expect(occurrences).toBe(1)
  })

  it('is idempotent relative to repeated release of the same object', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const obj = pool.acquire()
    pool.release(obj)
    // Second release should be silently ignored (obj is no longer in _active)
    expect(() => pool.release(obj)).not.toThrow()
    expect(pool.totalSize).toBe(3)
  })
})

// ─── Counters ─────────────────────────────────────────────────────────────────

describe('ObjectPool — counters', () => {
  it('activeCount reflects the number of checked-out objects', () => {
    const pool = new ObjectPool(makeFactory(), 5)
    expect(pool.activeCount).toBe(0)
    const a = pool.acquire()
    expect(pool.activeCount).toBe(1)
    const b = pool.acquire()
    expect(pool.activeCount).toBe(2)
    pool.release(a)
    expect(pool.activeCount).toBe(1)
    pool.release(b)
    expect(pool.activeCount).toBe(0)
  })

  it('freeCount reflects the number of objects waiting to be reused', () => {
    const pool = new ObjectPool(makeFactory(), 4)
    expect(pool.freeCount).toBe(4)
    const a = pool.acquire()
    expect(pool.freeCount).toBe(3)
    pool.release(a)
    expect(pool.freeCount).toBe(4)
  })

  it('totalSize equals activeCount + freeCount at all times', () => {
    const pool = new ObjectPool(makeFactory(), 4)
    for (let i = 0; i < 4; i++) {
      expect(pool.totalSize).toBe(pool.activeCount + pool.freeCount)
      pool.acquire()
    }
    expect(pool.totalSize).toBe(pool.activeCount + pool.freeCount)
  })
})

// ─── pool.all iterator ────────────────────────────────────────────────────────

describe('ObjectPool — all iterator', () => {
  it('returns every object (active + free)', () => {
    const pool = new ObjectPool(makeFactory(), 5)
    const a = pool.acquire()
    const b = pool.acquire()
    const all = [...pool.all]
    expect(all.length).toBe(5)
    expect(all).toContain(a)
    expect(all).toContain(b)
  })

  it('returns an array with no duplicates', () => {
    const pool = new ObjectPool(makeFactory(), 4)
    pool.acquire()
    const all = [...pool.all]
    const unique = new Set(all)
    expect(unique.size).toBe(all.length)
  })

  it('the iterable is a snapshot (modifying the pool afterwards does not affect it)', () => {
    const pool = new ObjectPool(makeFactory(), 3)
    const snapshot = [...pool.all]
    pool.acquire()  // mutates internal state
    expect(snapshot.length).toBe(3)  // snapshot unchanged
  })
})

// ─── Acquire → modify → release → re-acquire cycle ────────────────────────────

describe('ObjectPool — full lifecycle cycle', () => {
  it('object field mutations persist across acquire/release/re-acquire', () => {
    const pool = new ObjectPool(() => ({ value: 0 }), 1)
    const obj = pool.acquire()
    obj.value = 42
    pool.release(obj)
    const obj2 = pool.acquire()
    // Pool does NOT reset field values — caller must reset before use
    expect(obj2.value).toBe(42)
    expect(obj2).toBe(obj)
  })

  it('rapid acquire/release cycle with many objects does not lose any objects', () => {
    const pool = new ObjectPool(makeFactory(), 10)
    const held = []
    // Acquire all 10
    for (let i = 0; i < 10; i++) held.push(pool.acquire())
    expect(pool.activeCount).toBe(10)
    expect(pool.freeCount).toBe(0)
    // Release all
    held.forEach(o => pool.release(o))
    expect(pool.activeCount).toBe(0)
    expect(pool.freeCount).toBe(10)
    expect(pool.totalSize).toBe(10)
  })

  it('pool used as a Phaser-style text pool (factory returns mock objects)', () => {
    // Simulates the _cashPopupPool pattern: factory returns mock Phaser objects
    const createMockText = () => ({
      visible: false,
      text:    '',
      setVisible(v) { this.visible = v; return this },
      setText(t)   { this.text = t;    return this },
    })
    const pool = new ObjectPool(createMockText, 5)
    const txt = pool.acquire()
    txt.setVisible(true).setText('+$1K')
    expect(txt.visible).toBe(true)
    expect(txt.text).toBe('+$1K')
    // Simulate tween onComplete:
    txt.setVisible(false)
    pool.release(txt)
    expect(pool.activeCount).toBe(0)
    expect(pool.freeCount).toBe(5)
  })
})
