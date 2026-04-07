import { describe, it, expect } from 'vitest'
import { toastReducer } from '../ToastNotification.jsx'

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeToast = (id, overrides = {}) => ({
  id,
  icon:    '✅',
  title:   'TEST',
  body:    'body text',
  color:   '#22c55e',
  exiting: false,
  ...overrides,
})

// ─── PUSH ─────────────────────────────────────────────────────────────────────

describe('toastReducer — PUSH', () => {
  it('adds a toast to an empty queue', () => {
    const toast  = makeToast('t1')
    const state  = toastReducer([], { type: 'PUSH', payload: toast })
    expect(state).toHaveLength(1)
    expect(state[0]).toEqual(toast)
  })

  it('appends to a non-empty queue', () => {
    const t1    = makeToast('t1')
    const t2    = makeToast('t2')
    const after1 = toastReducer([],    { type: 'PUSH', payload: t1 })
    const after2 = toastReducer(after1, { type: 'PUSH', payload: t2 })
    expect(after2).toHaveLength(2)
    expect(after2[1].id).toBe('t2')
  })

  it('preserves insertion order (FIFO)', () => {
    const ids = ['a', 'b', 'c']
    const state = ids.reduce((s, id) =>
      toastReducer(s, { type: 'PUSH', payload: makeToast(id) }), [])
    expect(state.map(t => t.id)).toEqual(ids)
  })

  it('marks the oldest toast as exiting when queue exceeds QUEUE_MAX (4)', () => {
    // Fill to QUEUE_MAX
    let state = []
    for (let i = 0; i < 4; i++) {
      state = toastReducer(state, { type: 'PUSH', payload: makeToast(`t${i}`) })
    }
    // All 4 should be non-exiting
    state.forEach(t => expect(t.exiting).toBe(false))
    // Push one more — oldest (t0) should be flagged
    state = toastReducer(state, { type: 'PUSH', payload: makeToast('t4') })
    expect(state).toHaveLength(5)
    expect(state[0].id).toBe('t0')
    expect(state[0].exiting).toBe(true)
    // All others remain non-exiting
    state.slice(1).forEach(t => expect(t.exiting).toBe(false))
  })

  it('does not mutate the previous state array', () => {
    const prev = [makeToast('t1')]
    const next = toastReducer(prev, { type: 'PUSH', payload: makeToast('t2') })
    expect(prev).toHaveLength(1)       // original unchanged
    expect(next).toHaveLength(2)
    expect(next).not.toBe(prev)        // new reference
  })
})

// ─── EXIT ─────────────────────────────────────────────────────────────────────

describe('toastReducer — EXIT', () => {
  it('sets exiting=true on the targeted toast', () => {
    const state = [makeToast('t1'), makeToast('t2')]
    const next  = toastReducer(state, { type: 'EXIT', id: 't1' })
    expect(next[0].exiting).toBe(true)
    expect(next[1].exiting).toBe(false)
  })

  it('is a no-op when the id does not exist', () => {
    const state = [makeToast('t1')]
    const next  = toastReducer(state, { type: 'EXIT', id: 'ghost' })
    expect(next).toEqual(state)
  })

  it('does not mutate the original toast object', () => {
    const toast = makeToast('t1')
    const state = [toast]
    toastReducer(state, { type: 'EXIT', id: 't1' })
    expect(toast.exiting).toBe(false)  // original must not be changed
  })
})

// ─── REMOVE ───────────────────────────────────────────────────────────────────

describe('toastReducer — REMOVE', () => {
  it('removes a toast by id', () => {
    const state = [makeToast('t1'), makeToast('t2'), makeToast('t3')]
    const next  = toastReducer(state, { type: 'REMOVE', id: 't2' })
    expect(next).toHaveLength(2)
    expect(next.map(t => t.id)).toEqual(['t1', 't3'])
  })

  it('is a no-op when the id does not exist', () => {
    const state = [makeToast('t1')]
    const next  = toastReducer(state, { type: 'REMOVE', id: 'ghost' })
    expect(next).toHaveLength(1)
  })

  it('empties the queue when the last toast is removed', () => {
    const state = [makeToast('solo')]
    const next  = toastReducer(state, { type: 'REMOVE', id: 'solo' })
    expect(next).toHaveLength(0)
  })

  it('does not mutate the previous state array', () => {
    const prev = [makeToast('t1'), makeToast('t2')]
    const next = toastReducer(prev, { type: 'REMOVE', id: 't1' })
    expect(prev).toHaveLength(2)
    expect(next).toHaveLength(1)
    expect(next).not.toBe(prev)
  })
})

// ─── unknown action ───────────────────────────────────────────────────────────

describe('toastReducer — unknown action', () => {
  it('returns the state unchanged for an unrecognised action type', () => {
    const state = [makeToast('t1')]
    const next  = toastReducer(state, { type: 'UNKNOWN_ACTION' })
    expect(next).toBe(state)           // same reference
  })
})

// ─── combined lifecycle ───────────────────────────────────────────────────────

describe('toastReducer — full push → exit → remove lifecycle', () => {
  it('completes a full lifecycle without errors', () => {
    let state = []

    // Push two toasts
    state = toastReducer(state, { type: 'PUSH', payload: makeToast('a') })
    state = toastReducer(state, { type: 'PUSH', payload: makeToast('b') })
    expect(state).toHaveLength(2)

    // Begin exit animation on first
    state = toastReducer(state, { type: 'EXIT', id: 'a' })
    expect(state[0].exiting).toBe(true)
    expect(state[1].exiting).toBe(false)

    // Remove it after animation
    state = toastReducer(state, { type: 'REMOVE', id: 'a' })
    expect(state).toHaveLength(1)
    expect(state[0].id).toBe('b')
  })
})
