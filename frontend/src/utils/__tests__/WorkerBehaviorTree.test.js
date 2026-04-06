import { describe, it, expect } from 'vitest'
import { createWorkerTree, Status } from '../WorkerBehaviorTree.js'
import { TRANSIT_COL, TRANSIT_ROW } from '../PathfindingEngine.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid worker context pointing to a clear grid. */
function makeCtx(overrides = {}) {
  return {
    startX: 0,
    startY: 0,
    deskX: 2,
    deskY: 2,
    progress: 0,
    obstacles: [],
    ...overrides,
  }
}

/**
 * Tick a tree until it stops returning RUNNING or until maxTicks is reached.
 * Returns the final Status and the number of ticks used.
 */
function tickUntilDone(tree, ctx, maxTicks = 50) {
  let status
  let ticks = 0
  do {
    status = tree.tick(ctx)
    ticks++
  } while (status === Status.RUNNING && ticks < maxTicks)
  return { status, ticks }
}

// ─── createWorkerTree factory ─────────────────────────────────────────────────

describe('createWorkerTree', () => {
  it('returns a BehaviorTree instance (has tick and reset methods)', () => {
    const tree = createWorkerTree()
    expect(typeof tree.tick).toBe('function')
    expect(typeof tree.reset).toBe('function')
  })

  it('creates independent trees — state does not bleed between instances', () => {
    const treeA = createWorkerTree()
    const treeB = createWorkerTree()
    const ctxA = makeCtx({ deskX: 1, deskY: 0 })
    const ctxB = makeCtx({ deskX: 3, deskY: 0 })

    // Advance A part-way (WalkAlongPath RUNNING)
    treeA.tick(ctxA)

    // B should still start fresh
    treeB.tick(ctxB)
    expect(ctxB._pathIndex).toBe(1)  // took its own first step
  })
})

// ─── Phase 1: RequestPathToDesk ──────────────────────────────────────────────

describe('RequestPathToDesk phase', () => {
  it('stores the computed A* path on ctx._path', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 2, deskY: 0 })  // two steps right
    tree.tick(ctx)
    expect(Array.isArray(ctx._path)).toBe(true)
    expect(ctx._path.length).toBeGreaterThan(0)
    expect(ctx._path[0]).toEqual({ x: 0, y: 0 })
    expect(ctx._path[ctx._path.length - 1]).toEqual({ x: 2, y: 0 })
  })

  it('initialises ctx._pathIndex to 0 (RequestPathToDesk sets it before WalkAlongPath runs)', () => {
    // RequestPathToDesk sets _pathIndex = 0, then in the same tick WalkAlongPath
    // takes the first step and increments it to 1.  After tick 1 the value is 1.
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 3, deskY: 0 })  // multi-step path
    tree.tick(ctx)
    // _pathIndex starts at 0 (set by RequestPath) then is advanced to 1 by WalkAlongPath
    expect(ctx._pathIndex).toBe(1)
  })

  it('returns FAILURE (tree stops) when no path exists', () => {
    const tree = createWorkerTree()
    // Completely surround the start cell (0,0) with obstacles
    const obstacles = [{ col: 1, row: 0 }, { col: 0, row: 1 }]
    const ctx = makeCtx({ obstacles })
    const status = tree.tick(ctx)
    expect(status).toBe(Status.FAILURE)
    expect(ctx._path).toBeNull()
  })

  it('returns FAILURE when the target is blocked', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ obstacles: [{ col: 2, row: 2 }] })
    expect(tree.tick(ctx)).toBe(Status.FAILURE)
  })

  it('does not mutate the caller-supplied obstacles array', () => {
    const tree = createWorkerTree()
    const obstacles = [{ col: 3, row: 3 }]
    const copy = [...obstacles]
    tree.tick(makeCtx({ obstacles }))
    expect(obstacles).toEqual(copy)
  })
})

// ─── Phase 2: WalkAlongPath ───────────────────────────────────────────────────

describe('WalkAlongPath phase', () => {
  it('returns RUNNING while en route and advances one step per tick', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 3, deskY: 0 })  // 3 steps right

    // Tick 1: RequestPath → SUCCESS, WalkAlongPath step 0→1 → RUNNING
    expect(tree.tick(ctx)).toBe(Status.RUNNING)
    expect(ctx.startX).toBe(1)
    expect(ctx.startY).toBe(0)

    // Tick 2: resumes at WalkAlongPath, step 1→2 → RUNNING
    expect(tree.tick(ctx)).toBe(Status.RUNNING)
    expect(ctx.startX).toBe(2)

    // Tick 3: step 2→3 → SUCCESS (at desk), then progress=0 → PerformWork SUCCESS, ReturnToIdle SUCCESS
    // Tree returns SUCCESS (all phases done)
    expect(tree.tick(ctx)).toBe(Status.SUCCESS)
    expect(ctx.startX).toBe(3)
  })

  it('handles a single-step path (start adjacent to desk)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 1, startY: 2, deskX: 2, deskY: 2 })

    // One step to desk (path length 2: [start, desk])
    // Tick 1: RequestPath, Walk(SUCCESS on arrival since path.length-1=1), PerformWork(progress=0 → SUCCESS), ReturnToIdle
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
    expect(ctx.startX).toBe(2)
    expect(ctx.startY).toBe(2)
  })

  it('handles a zero-distance path (worker already at desk)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
  })

  it('updates ctx.startX and ctx.startY along the path', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 2, deskY: 0 })  // 2 steps right
    const visited = [{ x: 0, y: 0 }]

    let status
    do {
      status = tree.tick(ctx)
      visited.push({ x: ctx.startX, y: ctx.startY })
    } while (status === Status.RUNNING)

    // Path must be [0,0] → [1,0] → [2,0]; no diagonal jumps
    for (let i = 1; i < visited.length; i++) {
      const dx = Math.abs(visited[i].x - visited[i - 1].x)
      const dy = Math.abs(visited[i].y - visited[i - 1].y)
      expect(dx + dy).toBeLessThanOrEqual(1)
    }
    expect(visited[visited.length - 1]).toEqual({ x: 2, y: 0 })
  })

  it('navigates around obstacles during the walk', () => {
    const tree = createWorkerTree()
    // Block direct column path; force detour
    const obstacles = [
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ]
    const ctx = makeCtx({ deskX: 2, deskY: 0, obstacles })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
    expect(ctx.startX).toBe(2)
    expect(ctx.startY).toBe(0)
  })
})

// ─── Phase 3: PerformWorkAnimation (progress hook) ───────────────────────────

describe('PerformWorkAnimation phase — normalized progress hook', () => {
  /** Fast-forward through RequestPath + WalkAlongPath so the next tick hits
   *  PerformWorkAnimation.  Returns the ctx positioned at the desk. */
  function arriveAtDesk(tree, ctxOverrides = {}) {
    const ctx = makeCtx({ deskX: 1, deskY: 0, ...ctxOverrides })  // 1 step away
    // Tick until WalkAlongPath finishes (arriving at desk = SUCCESS)
    // With 1-step path: tick 1 → RequestPath + WalkAlongPath both succeed in
    // the same pass, landing on PerformWork which returns SUCCESS (progress=0)
    // and the whole tree completes.  We need progress > 0 to keep it RUNNING.
    ctx.progress = 0.5  // set before first tick so PerformWork sees it
    return ctx
  }

  it('sets ctx.isWorking = true while 0 < progress < 1', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 0, deskY: 0, progress: 0.5 })
    // startX=0,startY=0 == deskX=0,deskY=0 → zero-distance path
    // After RequestPath + Walk(already at desk) → PerformWork
    tree.tick(ctx)
    // The sequence may have advanced to PerformWork in tick 1
    // Keep ticking until we see RUNNING (PerformWork active)
    let sawWorking = ctx.isWorking
    for (let i = 0; i < 5 && !sawWorking; i++) {
      tree.tick(ctx)
      sawWorking = ctx.isWorking
    }
    expect(sawWorking).toBe(true)
  })

  it('stays RUNNING while progress is between 0 and 1', () => {
    const tree = createWorkerTree()
    // Place worker at desk to skip walking phase
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.1 })

    // First tick: RequestPath (success, single-node path) + Walk (already at dest, success)
    // → PerformWork: progress=0.1 → RUNNING
    const firstStatus = tree.tick(ctx)
    expect(firstStatus).toBe(Status.RUNNING)
    expect(ctx.isWorking).toBe(true)

    // Keep RUNNING at various mid-cycle progress values
    for (const p of [0.25, 0.5, 0.75, 0.99]) {
      ctx.progress = p
      expect(tree.tick(ctx)).toBe(Status.RUNNING)
      expect(ctx.isWorking).toBe(true)
    }
  })

  it('returns SUCCESS (cycle complete) when progress reaches 1', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5 })

    // Advance to PerformWork RUNNING state
    tree.tick(ctx)

    // Simulate cycle completion
    ctx.progress = 1
    const status = tree.tick(ctx)
    // PerformWork SUCCESS → ReturnToIdle SUCCESS → Sequence SUCCESS
    expect(status).toBe(Status.SUCCESS)
    expect(ctx.isWorking).toBe(false)
  })

  it('returns SUCCESS when progress resets to 0 (new cycle started before previous one registered)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5 })
    tree.tick(ctx)  // enter PerformWork RUNNING
    ctx.progress = 0
    expect(tree.tick(ctx)).toBe(Status.SUCCESS)
  })

  it('sets ctx.isWorking = false when progress is 0 (no active cycle)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx.isWorking).toBe(false)
  })

  it('progress float is read from ctx each tick (caller updates between ticks)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.1 })

    tree.tick(ctx)               // → RUNNING at PerformWork

    ctx.progress = 0.6           // caller updates progress from GameEventBus
    expect(tree.tick(ctx)).toBe(Status.RUNNING)
    expect(ctx.isWorking).toBe(true)

    ctx.progress = 1.0           // cycle completes
    expect(tree.tick(ctx)).toBe(Status.SUCCESS)
  })
})

// ─── Phase 4: ReturnToIdle ────────────────────────────────────────────────────

describe('ReturnToIdle phase', () => {
  it('sets ctx.isWorking = false', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx.isWorking).toBe(false)
  })

  it('sets ctx.propVisible = false', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx.propVisible).toBe(false)
  })

  it('clears ctx._path', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx._path).toBeNull()
  })

  it('resets ctx._pathIndex to 0', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx._pathIndex).toBe(0)
  })
})

// ─── ctx.propVisible — prop attachment hook ───────────────────────────────────

describe('ctx.propVisible — prop attachment visibility hook', () => {
  it('is true while 0 < progress < 1 (worker actively producing)', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5 })

    tree.tick(ctx)   // → PerformWork RUNNING
    expect(ctx.propVisible).toBe(true)
  })

  it('mirrors ctx.isWorking during the PerformWorkAnimation phase', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.1 })

    // While RUNNING
    tree.tick(ctx)
    expect(ctx.propVisible).toBe(ctx.isWorking)

    // Simulate several mid-cycle ticks
    for (const p of [0.3, 0.6, 0.9]) {
      ctx.progress = p
      tree.tick(ctx)
      expect(ctx.propVisible).toBe(ctx.isWorking)
    }
  })

  it('is false after the cycle completes (progress = 1)', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5 })

    tree.tick(ctx)          // → RUNNING at PerformWork
    ctx.progress = 1
    tree.tick(ctx)          // → SUCCESS; ReturnToIdle clears flags
    expect(ctx.propVisible).toBe(false)
  })

  it('is false when progress resets to 0 before PerformWork fires', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5 })

    tree.tick(ctx)          // enter PerformWork RUNNING
    ctx.progress = 0
    tree.tick(ctx)          // PerformWork → SUCCESS; ReturnToIdle runs
    expect(ctx.propVisible).toBe(false)
  })

  it('is false when path is blocked (tree never reaches PerformWork)', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({
      obstacles: [{ col: 1, row: 0 }, { col: 0, row: 1 }],
      progress: 0.5,
    })
    tree.tick(ctx)
    expect(ctx.propVisible).toBeFalsy()
  })

  it('propVisible is false after a full reset + re-run cycle', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })

    for (let cycle = 0; cycle < 2; cycle++) {
      tickUntilDone(tree, ctx)
      expect(ctx.propVisible).toBe(false)
      tree.reset()
    }
  })
})


// ─── Full sequence integrity ──────────────────────────────────────────────────

describe('Full sequence (end-to-end)', () => {
  it('completes a full cycle: path → walk → work → idle', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 2, deskY: 0, progress: 0 })

    let status
    let ticks = 0

    // Walk phase (progress = 0, so PerformWork returns SUCCESS immediately after walking)
    do {
      status = tree.tick(ctx)
      ticks++
    } while (status === Status.RUNNING && ticks < 100)

    expect(status).toBe(Status.SUCCESS)
    expect(ctx.startX).toBe(2)     // arrived at desk
    expect(ctx.isWorking).toBe(false)
    expect(ctx._path).toBeNull()
  })

  it('can be reset and re-run for a second production cycle', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })

    for (let cycle = 0; cycle < 3; cycle++) {
      const { status } = tickUntilDone(tree, ctx)
      expect(status).toBe(Status.SUCCESS)
      tree.reset()
    }
  })

  it('whole tree returns FAILURE when the path is blocked, without setting isWorking', () => {
    const tree = createWorkerTree()
    // Surround start
    const ctx = makeCtx({
      obstacles: [{ col: 1, row: 0 }, { col: 0, row: 1 }],
      progress: 0.5,
    })
    const status = tree.tick(ctx)
    expect(status).toBe(Status.FAILURE)
    expect(ctx.isWorking).toBeFalsy()
  })

  it('worker stays at the desk position after all phases complete', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ deskX: 4, deskY: 4, progress: 0 })
    tickUntilDone(tree, ctx)
    expect(ctx.startX).toBe(4)
    expect(ctx.startY).toBe(4)
  })
})

// ─── Inter-floor traversal (IsSameFloor gate + CrossFloorTransit) ─────────────

describe('IsSameFloor gate', () => {
  it('same-floor context (floorNumber === targetFloor) takes the direct path', () => {
    const tree = createWorkerTree()
    // Worker already at desk, same floor — IsSameFloor succeeds, transit skipped
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2,
      floorNumber: 1, targetFloor: 1, progress: 0 })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
    // Floor number unchanged after same-floor run
    expect(ctx.floorNumber).toBe(1)
  })

  it('context without floor fields behaves as same-floor (backward compat)', () => {
    // Old-style context with no floorNumber/targetFloor fields
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
  })

  it('different floors cause the transit sequence to run', () => {
    const tree = createWorkerTree()
    // Start on floor 1, target desk on floor 3
    const ctx = makeCtx({ startX: 0, startY: 0, deskX: 2, deskY: 2,
      floorNumber: 1, targetFloor: 3, progress: 0 })
    // First tick: IsSameFloor FAILS → CrossFloorTransit begins
    tree.tick(ctx)
    // Worker is now walking toward transit — ctx.floorNumber still 1
    expect(ctx.floorNumber).toBe(1)
    // Advance until the full sequence completes
    const { status } = tickUntilDone(tree, ctx, 200)
    expect(status).toBe(Status.SUCCESS)
    // After RideElevator fires, floor updated to target
    expect(ctx.floorNumber).toBe(3)
  })
})

describe('RequestPathToTransit', () => {
  it('routes NPC to transit coordinates when cross-floor', () => {
    const tree = createWorkerTree()
    const visited = []
    const ctx = makeCtx({ startX: 0, startY: 0, deskX: 0, deskY: 0,
      floorNumber: 1, targetFloor: 2, progress: 0 })

    let status
    let ticks = 0
    do {
      status = tree.tick(ctx)
      visited.push({ x: ctx.startX, y: ctx.startY })
      ticks++
    } while (status === Status.RUNNING && ticks < 200)

    // The NPC must have visited the transit node during the crossing phase
    const reachedTransit = visited.some(
      p => p.x === TRANSIT_COL && p.y === TRANSIT_ROW,
    )
    expect(reachedTransit).toBe(true)
  })

  it('cross-floor routing fails gracefully when transit is blocked', () => {
    // Block all paths to the transit node by surrounding the start
    const obstacles = [{ col: 1, row: 0 }, { col: 0, row: 1 }]
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 0, startY: 0, deskX: 2, deskY: 2,
      floorNumber: 1, targetFloor: 2, obstacles })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.FAILURE)
  })
})

describe('RideElevator action', () => {
  it('updates ctx.floorNumber to targetFloor after transit completes', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: TRANSIT_COL, startY: TRANSIT_ROW,
      deskX: 2, deskY: 2, floorNumber: 1, targetFloor: 4, progress: 0 })
    tickUntilDone(tree, ctx, 200)
    expect(ctx.floorNumber).toBe(4)
  })

  it('fires ctx.onFloorChange callback exactly once with the new floor', () => {
    const tree = createWorkerTree()
    const calls = []
    const ctx = makeCtx({ startX: TRANSIT_COL, startY: TRANSIT_ROW,
      deskX: 2, deskY: 2, floorNumber: 1, targetFloor: 5, progress: 0,
      onFloorChange: (f) => calls.push(f) })
    tickUntilDone(tree, ctx, 200)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(5)
  })

  it('does not fire onFloorChange on a same-floor run', () => {
    const tree = createWorkerTree()
    const calls = []
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2,
      floorNumber: 2, targetFloor: 2, progress: 0,
      onFloorChange: (f) => calls.push(f) })
    tickUntilDone(tree, ctx, 50)
    expect(calls).toHaveLength(0)
  })

  it('clears ctx._transitWait after the full cycle (ReturnToIdle resets it)', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: TRANSIT_COL, startY: TRANSIT_ROW,
      deskX: 2, deskY: 2, floorNumber: 1, targetFloor: 2, progress: 0 })
    tickUntilDone(tree, ctx, 200)
    expect(ctx._transitWait).toBeNull()
  })

  it('transit sequence can be repeated across multiple reset cycles', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: TRANSIT_COL, startY: TRANSIT_ROW,
      deskX: 2, deskY: 2, floorNumber: 1, targetFloor: 2, progress: 0 })

    for (let cycle = 0; cycle < 2; cycle++) {
      // Reset floor for each cycle to re-trigger the transit
      ctx.floorNumber = 1
      ctx.targetFloor = 2
      ctx.startX = TRANSIT_COL
      ctx.startY = TRANSIT_ROW
      const { status } = tickUntilDone(tree, ctx, 200)
      expect(status).toBe(Status.SUCCESS)
      expect(ctx.floorNumber).toBe(2)
      tree.reset()
    }
  })
})
