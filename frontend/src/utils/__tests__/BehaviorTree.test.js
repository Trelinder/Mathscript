import { describe, it, expect, vi } from 'vitest'
import { Status, Action, Sequence, Selector, BehaviorTree } from '../BehaviorTree.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const success = () => new Action('success', () => Status.SUCCESS)
const failure = () => new Action('failure', () => Status.FAILURE)
const running = () => new Action('running', () => Status.RUNNING)

/** Action that returns each status in `statuses` on successive ticks. */
function cycle(...statuses) {
  let i = 0
  return new Action('cycle', () => statuses[Math.min(i++, statuses.length - 1)])
}

// ─── Status ───────────────────────────────────────────────────────────────────

describe('Status', () => {
  it('exports SUCCESS, FAILURE, RUNNING as distinct strings', () => {
    expect(Status.SUCCESS).toBe('SUCCESS')
    expect(Status.FAILURE).toBe('FAILURE')
    expect(Status.RUNNING).toBe('RUNNING')
    const values = new Set(Object.values(Status))
    expect(values.size).toBe(3)
  })

  it('is frozen (immutable)', () => {
    expect(() => { Status.SUCCESS = 'X' }).toThrow()
  })
})

// ─── Action ───────────────────────────────────────────────────────────────────

describe('Action', () => {
  it('calls the tick function and returns its result', () => {
    const ctx = {}
    const fn = vi.fn(() => Status.SUCCESS)
    const a = new Action('test', fn)
    expect(a.tick(ctx)).toBe(Status.SUCCESS)
    expect(fn).toHaveBeenCalledWith(ctx)
  })

  it('passes ctx by reference so the tick fn can mutate it', () => {
    const ctx = { value: 0 }
    const a = new Action('mutate', (c) => { c.value = 42; return Status.SUCCESS })
    a.tick(ctx)
    expect(ctx.value).toBe(42)
  })

  it('reset() is a no-op and does not throw', () => {
    const a = success()
    expect(() => a.reset()).not.toThrow()
  })
})

// ─── Sequence ─────────────────────────────────────────────────────────────────

describe('Sequence', () => {
  it('returns SUCCESS when all children succeed', () => {
    const s = new Sequence('s', [success(), success(), success()])
    expect(s.tick({})).toBe(Status.SUCCESS)
  })

  it('returns FAILURE on the first failing child', () => {
    const ticked = vi.fn(() => Status.SUCCESS)
    const s = new Sequence('s', [
      new Action('a', ticked),
      failure(),
      new Action('c', ticked),  // must NOT be reached
    ])
    expect(s.tick({})).toBe(Status.FAILURE)
    expect(ticked).toHaveBeenCalledTimes(1)  // only 'a' ran
  })

  it('returns RUNNING when a child returns RUNNING', () => {
    const s = new Sequence('s', [success(), running(), success()])
    expect(s.tick({})).toBe(Status.RUNNING)
  })

  it('resumes from the running child on the next tick (memory variant)', () => {
    const firstCalled = vi.fn(() => Status.SUCCESS)
    const second = cycle(Status.RUNNING, Status.SUCCESS)
    const s = new Sequence('s', [
      new Action('first', firstCalled),
      second,
      success(),
    ])

    // Tick 1: first succeeds, second returns RUNNING
    expect(s.tick({})).toBe(Status.RUNNING)
    // Tick 2: should resume at second (first must NOT be called again)
    expect(s.tick({})).toBe(Status.SUCCESS)
    expect(firstCalled).toHaveBeenCalledTimes(1)
  })

  it('resets _runningIdx to 0 after SUCCESS so it can be re-run', () => {
    const s = new Sequence('s', [success(), success()])
    expect(s.tick({})).toBe(Status.SUCCESS)
    expect(s._runningIdx).toBe(0)
  })

  it('resets _runningIdx to 0 after FAILURE', () => {
    const s = new Sequence('s', [failure()])
    s.tick({})
    expect(s._runningIdx).toBe(0)
  })

  it('reset() resets _runningIdx and recursively resets children', () => {
    const childReset = vi.fn()
    const child = { tick: () => Status.RUNNING, reset: childReset }
    const s = new Sequence('s', [child])
    s.tick({})
    s.reset()
    expect(s._runningIdx).toBe(0)
    expect(childReset).toHaveBeenCalled()
  })

  it('handles a single-child sequence', () => {
    expect(new Sequence('s', [success()]).tick({})).toBe(Status.SUCCESS)
    expect(new Sequence('s', [failure()]).tick({})).toBe(Status.FAILURE)
    expect(new Sequence('s', [running()]).tick({})).toBe(Status.RUNNING)
  })

  it('handles an empty children array (vacuous success)', () => {
    expect(new Sequence('s', []).tick({})).toBe(Status.SUCCESS)
  })
})

// ─── Selector ─────────────────────────────────────────────────────────────────

describe('Selector', () => {
  it('returns SUCCESS on the first succeeding child', () => {
    const neverCalled = vi.fn(() => Status.SUCCESS)
    const sel = new Selector('sel', [
      failure(),
      success(),
      new Action('never', neverCalled),
    ])
    expect(sel.tick({})).toBe(Status.SUCCESS)
    expect(neverCalled).not.toHaveBeenCalled()
  })

  it('returns FAILURE when all children fail', () => {
    const sel = new Selector('sel', [failure(), failure(), failure()])
    expect(sel.tick({})).toBe(Status.FAILURE)
  })

  it('returns RUNNING when the current child returns RUNNING', () => {
    const sel = new Selector('sel', [failure(), running(), success()])
    expect(sel.tick({})).toBe(Status.RUNNING)
  })

  it('resumes from the running child on the next tick (memory variant)', () => {
    const firstCalled = vi.fn(() => Status.FAILURE)
    const second = cycle(Status.RUNNING, Status.SUCCESS)
    const sel = new Selector('sel', [
      new Action('first', firstCalled),
      second,
    ])

    // Tick 1: first fails, second returns RUNNING
    expect(sel.tick({})).toBe(Status.RUNNING)
    // Tick 2: resume at second (first must NOT be re-evaluated)
    expect(sel.tick({})).toBe(Status.SUCCESS)
    expect(firstCalled).toHaveBeenCalledTimes(1)
  })

  it('resets _runningIdx to 0 after SUCCESS', () => {
    const sel = new Selector('sel', [success()])
    sel.tick({})
    expect(sel._runningIdx).toBe(0)
  })

  it('resets _runningIdx to 0 after FAILURE', () => {
    const sel = new Selector('sel', [failure()])
    sel.tick({})
    expect(sel._runningIdx).toBe(0)
  })

  it('reset() resets _runningIdx and recursively resets children', () => {
    const childReset = vi.fn()
    const child = { tick: () => Status.RUNNING, reset: childReset }
    const sel = new Selector('sel', [child])
    sel.tick({})
    sel.reset()
    expect(sel._runningIdx).toBe(0)
    expect(childReset).toHaveBeenCalled()
  })

  it('handles an empty children array (vacuous failure)', () => {
    expect(new Selector('sel', []).tick({})).toBe(Status.FAILURE)
  })
})

// ─── Nested composites ────────────────────────────────────────────────────────

describe('Nested composites', () => {
  it('Selector of Sequences — first sequence fails → second sequence runs', () => {
    const sel = new Selector('top', [
      new Sequence('seq-fail', [success(), failure()]),
      new Sequence('seq-ok',   [success(), success()]),
    ])
    expect(sel.tick({})).toBe(Status.SUCCESS)
  })

  it('Sequence of Selectors — both selectors must succeed', () => {
    const seq = new Sequence('top', [
      new Selector('sel1', [failure(), success()]),
      new Selector('sel2', [success()]),
    ])
    expect(seq.tick({})).toBe(Status.SUCCESS)
  })

  it('RUNNING propagates through nested composites', () => {
    const tree = new BehaviorTree(
      new Sequence('top', [
        new Selector('inner', [running()]),
      ])
    )
    expect(tree.tick({})).toBe(Status.RUNNING)
  })
})

// ─── BehaviorTree ─────────────────────────────────────────────────────────────

describe('BehaviorTree', () => {
  it('tick() delegates to the root node', () => {
    const rootTick = vi.fn(() => Status.SUCCESS)
    const tree = new BehaviorTree({ tick: rootTick, reset: vi.fn() })
    const ctx = { x: 1 }
    expect(tree.tick(ctx)).toBe(Status.SUCCESS)
    expect(rootTick).toHaveBeenCalledWith(ctx)
  })

  it('reset() delegates to the root node', () => {
    const rootReset = vi.fn()
    const tree = new BehaviorTree({ tick: () => Status.SUCCESS, reset: rootReset })
    tree.reset()
    expect(rootReset).toHaveBeenCalled()
  })

  it('can be re-run after reset()', () => {
    let calls = 0
    const countingAction = new Action('count', () => {
      calls++
      return Status.SUCCESS
    })
    const tree = new BehaviorTree(new Sequence('s', [countingAction]))

    tree.tick({})   // first full run
    tree.reset()
    tree.tick({})   // second full run

    expect(calls).toBe(2)
  })

  it('a full SUCCESS → reset → tick cycle works across multiple runs', () => {
    const seq = new Sequence('s', [success(), success()])
    const tree = new BehaviorTree(seq)

    for (let i = 0; i < 3; i++) {
      expect(tree.tick({})).toBe(Status.SUCCESS)
      tree.reset()
    }
  })
})
