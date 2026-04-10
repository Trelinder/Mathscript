import { describe, it, expect, beforeEach, vi } from 'vitest'
import { on, off, emit, clear } from '../GameEventBus.js'

// Reset bus between tests so listeners from one test don't bleed into the next.
beforeEach(() => {
  clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// on / emit
// ─────────────────────────────────────────────────────────────────────────────
describe('on / emit', () => {
  it('invokes a registered handler when the matching event is emitted', () => {
    const handler = vi.fn()
    on('test:event', handler)
    emit('test:event', { value: 42 })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ value: 42 })
  })

  it('does not invoke a handler for a different event', () => {
    const handler = vi.fn()
    on('test:event', handler)
    emit('other:event', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('invokes multiple handlers for the same event', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    on('test:event', h1)
    on('test:event', h2)
    emit('test:event', { x: 1 })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('passes the payload object unchanged', () => {
    const received = []
    on('data:event', (p) => received.push(p))
    const payload = { floorId: 'spell-lab', progress: 0.75 }
    emit('data:event', payload)
    expect(received).toHaveLength(1)
    expect(received[0]).toBe(payload)
  })

  it('emitting an event with no listeners does not throw', () => {
    expect(() => emit('no:listeners', {})).not.toThrow()
  })

  it('handles undefined payload gracefully', () => {
    const handler = vi.fn()
    on('test:event', handler)
    emit('test:event', undefined)
    expect(handler).toHaveBeenCalledWith(undefined)
  })

  it('calls the same handler once per emit when registered once', () => {
    const handler = vi.fn()
    on('test:event', handler)
    emit('test:event', {})
    emit('test:event', {})
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('registering the same handler twice only calls it once per emit (Set semantics)', () => {
    const handler = vi.fn()
    on('test:event', handler)
    on('test:event', handler) // duplicate registration
    emit('test:event', {})
    expect(handler).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// off
// ─────────────────────────────────────────────────────────────────────────────
describe('off', () => {
  it('stops calling the handler after off() is called', () => {
    const handler = vi.fn()
    on('test:event', handler)
    off('test:event', handler)
    emit('test:event', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('only removes the specified handler, leaving others intact', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    on('test:event', h1)
    on('test:event', h2)
    off('test:event', h1)
    emit('test:event', {})
    expect(h1).not.toHaveBeenCalled()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('does not throw when removing a handler for an event with no listeners', () => {
    expect(() => off('nonexistent:event', vi.fn())).not.toThrow()
  })

  it('does not throw when removing a handler that was never registered', () => {
    const handler = vi.fn()
    expect(() => off('test:event', handler)).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// on returns an unsubscribe function
// ─────────────────────────────────────────────────────────────────────────────
describe('on() return value (unsubscribe)', () => {
  it('returns a function', () => {
    const unsub = on('test:event', vi.fn())
    expect(typeof unsub).toBe('function')
  })

  it('calling the returned unsubscribe function removes the handler', () => {
    const handler = vi.fn()
    const unsub = on('test:event', handler)
    unsub()
    emit('test:event', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('can be called multiple times without throwing', () => {
    const unsub = on('test:event', vi.fn())
    expect(() => {
      unsub()
      unsub()
    }).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// clear
// ─────────────────────────────────────────────────────────────────────────────
describe('clear', () => {
  it('removes all listeners for all events', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    on('event:a', h1)
    on('event:b', h2)
    clear()
    emit('event:a', {})
    emit('event:b', {})
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('can be called on an empty bus without throwing', () => {
    expect(() => clear()).not.toThrow()
  })

  it('new subscriptions added after clear() work correctly', () => {
    const handler = vi.fn()
    on('test:event', vi.fn()) // old handler
    clear()
    on('test:event', handler)  // fresh handler
    emit('test:event', { fresh: true })
    expect(handler).toHaveBeenCalledWith({ fresh: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Realistic event name coverage (spot-check canonical events)
// ─────────────────────────────────────────────────────────────────────────────
describe('canonical event names', () => {
  const CANONICAL_EVENTS = [
    ['floor:progress', { floorId: 'spell-lab', progress: 0.5 }],
    ['floor:cycle',    { floorId: 'speed-desk', earned: 100 }],
    ['floor:upgraded', { floorId: 'spell-lab', newLevel: 2 }],
    ['ui:notify',      { title: 'Hello', body: 'World' }],
    ['ui:manual-produce', { floorId: 'spell-lab', normX: 0.5, normY: 0.5 }],
    ['combat:start',   { hero: 'Arcanos' }],
    ['combat:end',     { outcome: 'victory', rewardCoins: 50 }],
    ['render:scene-ready', {}],
    ['sim:floor-bins', { bins: [] }],
  ]

  CANONICAL_EVENTS.forEach(([event, payload]) => {
    it(`routes '${event}' correctly`, () => {
      const handler = vi.fn()
      on(event, handler)
      emit(event, payload)
      expect(handler).toHaveBeenCalledWith(payload)
    })
  })
})
