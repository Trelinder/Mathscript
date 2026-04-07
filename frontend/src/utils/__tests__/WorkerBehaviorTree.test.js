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

// ─── Infrastructure capacity gate (CheckInfraCapacity) ────────────────────────

describe('CheckInfraCapacity gate', () => {
  it('allows work cycle when totalWorkspaceLevel is within infra capacity', () => {
    const tree = createWorkerTree()
    // infraCapacity(1) = 10 >= 7 → not blocked
    const ctx = makeCtx({
      startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0,
      infraLevel: 1, totalWorkspaceLevel: 7,
    })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
  })

  it('blocks the work cycle when totalWorkspaceLevel exceeds infraCapacity', () => {
    const tree = createWorkerTree()
    // infraCapacity(0) = 0, total 1 > 0 → blocked
    const ctx = makeCtx({
      startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5,
      infraLevel: 0, totalWorkspaceLevel: 1,
    })
    const { status } = tickUntilDone(tree, ctx, 10)
    expect(status).toBe(Status.FAILURE)
  })

  it('does not set ctx.isWorking = true when blocked', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({
      startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5,
      infraLevel: 0, totalWorkspaceLevel: 1,
    })
    tickUntilDone(tree, ctx, 5)
    expect(ctx.isWorking).toBeFalsy()
  })

  it('does not set ctx.propVisible = true when blocked', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({
      startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0.5,
      infraLevel: 0, totalWorkspaceLevel: 1,
    })
    tickUntilDone(tree, ctx, 5)
    expect(ctx.propVisible).toBeFalsy()
  })

  it('unblocks and completes the work cycle after infraLevel is raised', () => {
    const tree = createWorkerTree()
    const ctx = makeCtx({
      startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0,
      infraLevel: 0, totalWorkspaceLevel: 1,
    })
    // First pass — blocked at capacity check
    expect(tickUntilDone(tree, ctx, 10).status).toBe(Status.FAILURE)
    tree.reset()

    // Caller raises infra level (e.g., player upgrades the infrastructure room)
    ctx.infraLevel = 1  // infraCapacity(1) = 10 >= 1 → now allowed
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
  })

  it('defaults to not-blocked when infraLevel and totalWorkspaceLevel are absent (backward compat)', () => {
    // Old-style ctx with no capacity fields — must not be blocked
    const tree = createWorkerTree()
    const ctx = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    const { status } = tickUntilDone(tree, ctx)
    expect(status).toBe(Status.SUCCESS)
  })

  it('blocks all workers independently when any NPC shares an over-capacity ctx', () => {
    // Two separate trees/contexts — each is evaluated independently
    const treeA = createWorkerTree()
    const ctxA  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0, infraLevel: 0, totalWorkspaceLevel: 1 })
    const treeB = createWorkerTree()
    const ctxB  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0, infraLevel: 1, totalWorkspaceLevel: 5 })

    expect(tickUntilDone(treeA, ctxA, 10).status).toBe(Status.FAILURE)
    expect(tickUntilDone(treeB, ctxB).status).toBe(Status.SUCCESS)
  })
})

// ─── Needs System ─────────────────────────────────────────────────────────────

/** Helper: construct a context with amenities but needs starting at 0. */
function makeCtxWithAmenities(overrides = {}) {
  return makeCtx({
    startX: 0, startY: 0, deskX: 2, deskY: 2,
    floorNumber: 1, targetFloor: 1,
    needs: { bladder: 0, morale: 0 },
    amenities: [
      { id: 'washroom_1', floor: 1, col: 4, row: 0, type: 'washroom' },
    ],
    ...overrides,
  })
}

describe('TickNeeds (side-effect action)', () => {
  it('initialises ctx.needs lazily when absent', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx()
    tree.tick(ctx)
    expect(ctx.needs).toBeDefined()
    expect(typeof ctx.needs.bladder).toBe('number')
    expect(typeof ctx.needs.morale).toBe('number')
  })

  it('increments bladder and morale every tick', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ needs: { bladder: 0, morale: 0 } })
    tree.tick(ctx)
    expect(ctx.needs.bladder).toBeGreaterThan(0)
    expect(ctx.needs.morale).toBeGreaterThan(0)
  })

  it('needs accumulate monotonically over multiple ticks', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ needs: { bladder: 0, morale: 0 } })
    tree.tick(ctx)
    const after1 = ctx.needs.bladder
    tree.reset()
    tree.tick(ctx)
    const after2 = ctx.needs.bladder
    expect(after2).toBeGreaterThan(after1)
  })

  it('caps needs at 1.0 (never exceeds maximum)', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ needs: { bladder: 0.9999, morale: 0.9999 } })
    for (let i = 0; i < 20; i++) { tree.tick(ctx); tree.reset() }
    expect(ctx.needs.bladder).toBeLessThanOrEqual(1)
    expect(ctx.needs.morale).toBeLessThanOrEqual(1)
  })
})

describe('CheckNeedsCritical gate', () => {
  it('does not fire needs branch when needs are below threshold', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({ needs: { bladder: 0.1, morale: 0.1 } })
    // Run one tick — NeedsUrgencyBranch should not activate (CheckNeedsCritical fails)
    tree.tick(ctx)
    // NPC should have begun the work routine (path to desk computed)
    expect(ctx._path).not.toBeNull()
    expect(ctx._needTarget).toBeUndefined()
  })

  it('fires needs branch when bladder reaches threshold', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({ needs: { bladder: 0.80, morale: 0 } })
    tree.tick(ctx)
    // FindNearestAmenity should have run and set ctx._needTarget
    expect(ctx._needTarget).not.toBeNull()
    expect(ctx._needTarget).not.toBeUndefined()
  })

  it('fires needs branch when morale reaches threshold', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({
      needs: { bladder: 0, morale: 0.80 },
      amenities: [{ id: 'lounge_1', floor: 1, col: 4, row: 0, type: 'lounge' }],
    })
    tree.tick(ctx)
    expect(ctx._needTarget).toBeDefined()
  })
})

describe('FindNearestAmenity — same-floor preference', () => {
  it('selects same-floor amenity over a cross-floor amenity regardless of proximity', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({
      floorNumber: 1, targetFloor: 1,
      startX: 0, startY: 0,
      needs: { bladder: 0.85, morale: 0 },
      amenities: [
        // Cross-floor amenity at (1,0) on floor 2 — grid distance = 1 (very close in cells)
        { id: 'washroom_2', floor: 2, col: 1, row: 0, type: 'washroom' },
        // Same-floor amenity at (4,4) — grid distance = 8 (maximum distance)
        { id: 'washroom_1', floor: 1, col: 4, row: 4, type: 'washroom' },
      ],
    })
    tree.tick(ctx)
    // Same-floor amenity must win due to FLOOR_CHANGE_PENALTY
    expect(ctx._needTarget?.id).toBe('washroom_1')
  })

  it('selects the closest same-floor amenity when multiple exist on the same floor', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({
      floorNumber: 1, targetFloor: 1,
      startX: 0, startY: 0,
      needs: { bladder: 0.85, morale: 0 },
      amenities: [
        { id: 'far',   floor: 1, col: 4, row: 4, type: 'washroom' },  // 8 steps
        { id: 'near',  floor: 1, col: 1, row: 0, type: 'washroom' },  // 1 step
      ],
    })
    tree.tick(ctx)
    expect(ctx._needTarget?.id).toBe('near')
  })

  it('falls through to WorkerRoutine when amenities list is empty', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtxWithAmenities({
      needs: { bladder: 0.90, morale: 0 },
      amenities: [],
    })
    tree.tick(ctx)
    // FindNearestAmenity fails → NeedsUrgencyBranch fails → WorkerRoutine runs
    // WorkerRoutine should have computed a path to desk
    expect(ctx._path).not.toBeNull()
    expect(ctx._needTarget).toBeUndefined()
  })

  it('falls through to WorkerRoutine when amenities field is absent', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ needs: { bladder: 0.95, morale: 0 } })  // no amenities field
    tree.tick(ctx)
    expect(ctx._path).not.toBeNull()
    expect(ctx._needTarget).toBeUndefined()
  })
})

describe('Full needs-fulfillment cycle (same floor)', () => {
  /**
   * Simulate the full lifecycle: run the tree until the needs branch completes
   * (tree returns SUCCESS or FAILURE), then optionally reset and re-run.
   */
  function runNeedsCycle(ctx, maxTicks = 200) {
    const tree = createWorkerTree()
    let status
    let ticks = 0
    do {
      status = tree.tick(ctx)
      if (status !== Status.RUNNING) tree.reset()
      ticks++
    } while (status === Status.RUNNING && ticks < maxTicks)
    return { tree, status, ticks }
  }

  it('NPC visits amenity and restores bladder need to 0', () => {
    const ctx = makeCtxWithAmenities({
      startX: 0, startY: 0,
      needs: { bladder: 0.90, morale: 0 },
    })
    const { status } = runNeedsCycle(ctx, 300)
    expect(status).not.toBe(Status.RUNNING)
    // After the cycle completes, bladder should be restored
    expect(ctx.needs.bladder).toBe(0)
  })

  it('NPC visits lounge and restores morale need to 0', () => {
    const ctx = makeCtxWithAmenities({
      startX: 0, startY: 0,
      needs: { bladder: 0, morale: 0.90 },
      amenities: [{ id: 'lounge_1', floor: 1, col: 4, row: 0, type: 'lounge' }],
    })
    const { status } = runNeedsCycle(ctx, 300)
    expect(status).not.toBe(Status.RUNNING)
    expect(ctx.needs.morale).toBe(0)
  })

  it('ctx._needTarget is cleared (NeedsCleanup ran) after the needs cycle', () => {
    const ctx = makeCtxWithAmenities({ needs: { bladder: 0.90, morale: 0 } })
    runNeedsCycle(ctx, 300)
    expect(ctx._needTarget).toBeNull()
  })

  it('ctx._path is cleared by NeedsCleanup so WorkerRoutine restarts cleanly', () => {
    const ctx = makeCtxWithAmenities({ needs: { bladder: 0.90, morale: 0 } })
    runNeedsCycle(ctx, 300)
    expect(ctx._path).toBeNull()
  })

  it('NPC returns to work after needs are fulfilled (new cycle runs WorkerRoutine)', () => {
    const ctx = makeCtxWithAmenities({ needs: { bladder: 0.90, morale: 0 } })
    // First cycle: needs branch runs and resolves
    runNeedsCycle(ctx, 300)
    // After reset, the next cycle should run the work routine (needs are now below threshold)
    ctx.needs.bladder = 0  // ensure it's fully reset
    ctx.progress = 0
    const tree = createWorkerTree()
    const firstStatus = tree.tick(ctx)
    // WorkerRoutine should have computed a path to desk
    expect(firstStatus).toBe(Status.RUNNING)
    expect(ctx._path).not.toBeNull()
    // _needTarget is null (cleared by NeedsCleanup) — WorkerRoutine does not touch it
    expect(ctx._needTarget).toBeNull()
  })
})

// ─── Cross-floor needs fulfillment cycle ──────────────────────────────────────

/**
 * Upper bound for a "restored" need value.
 *
 * UseAmenity resets the critical need to 0, but TickNeeds continues to
 * accumulate needs during the return transit (walk-to-transit + elevator
 * ride).  At most ~60 extra ticks × 0.001/tick = ~0.06 of accumulation.
 * This constant is set to 0.5 — well below the 0.80 critical threshold —
 * to confirm the need was properly restored without asserting exactly 0.
 */
const RESTORED_NEED_MAX = 0.5

describe('Full needs-fulfillment cycle (cross-floor)', () => {
  /**
   * Context where the NPC is on floor 1 with its work desk also on floor 1,
   * but the only available amenity is on floor 3.  The NPC must ride the
   * elevator to floor 3, use the amenity, then ride back to floor 1.
   */
  function makeCtxCrossFloor(overrides = {}) {
    return makeCtx({
      startX: 0, startY: 0,
      deskX: 2, deskY: 2,
      floorNumber: 1, targetFloor: 1,
      needs: { bladder: 0.90, morale: 0 },
      // Only amenity is on floor 3 — no same-floor washroom available.
      amenities: [
        { id: 'washroom_3', floor: 3, col: 2, row: 0, type: 'washroom' },
      ],
      ...overrides,
    })
  }

  /**
   * Drive the tree until it leaves RUNNING or maxTicks is hit.
   * Resets automatically on each non-RUNNING status so needs cleanup runs.
   */
  function runCrossFloorNeedsCycle(ctx, maxTicks = 500) {
    const tree = createWorkerTree()
    let status
    let ticks = 0
    do {
      status = tree.tick(ctx)
      if (status !== Status.RUNNING) tree.reset()
      ticks++
    } while (status === Status.RUNNING && ticks < maxTicks)
    return { tree, status, ticks }
  }

  it('restores bladder need after visiting a cross-floor amenity', () => {
    const ctx = makeCtxCrossFloor()
    const { status } = runCrossFloorNeedsCycle(ctx)
    expect(status).not.toBe(Status.RUNNING)
    // UseAmenity resets bladder to 0; TickNeeds accumulates a small amount
    // during the return transit.  The result must be well below the 0.80
    // critical threshold, confirming the need was properly restored.
    expect(ctx.needs.bladder).toBeLessThan(RESTORED_NEED_MAX)
  })

  it('ctx.floorNumber ends at targetFloor (work floor) after the full cycle', () => {
    const ctx = makeCtxCrossFloor()
    runCrossFloorNeedsCycle(ctx)
    // NPC must have returned to its work floor.
    expect(ctx.floorNumber).toBe(ctx.targetFloor)
    expect(ctx.floorNumber).toBe(1)
  })

  it('ctx._needTarget is cleared by NeedsCleanup after the cross-floor cycle', () => {
    const ctx = makeCtxCrossFloor()
    runCrossFloorNeedsCycle(ctx)
    expect(ctx._needTarget).toBeNull()
  })

  it('ctx._path is cleared by NeedsCleanup after the cross-floor cycle', () => {
    const ctx = makeCtxCrossFloor()
    runCrossFloorNeedsCycle(ctx)
    expect(ctx._path).toBeNull()
  })

  it('ctx.floorNumber changes to the amenity floor during the cycle then returns to 1', () => {
    const ctx = makeCtxCrossFloor()
    const tree = createWorkerTree()
    const floorHistory = []
    let status
    let ticks = 0
    do {
      status = tree.tick(ctx)
      floorHistory.push(ctx.floorNumber)
      if (status !== Status.RUNNING) tree.reset()
      ticks++
    } while (status === Status.RUNNING && ticks < 500)
    // The NPC must have visited floor 3 (amenity floor) at some point.
    expect(floorHistory).toContain(3)
    // And must finish back on the work floor.
    expect(ctx.floorNumber).toBe(1)
  })

  it('NPC visits the transit node on the way to the cross-floor amenity', () => {
    const ctx = makeCtxCrossFloor()
    const tree = createWorkerTree()
    const visited = []
    let status
    let ticks = 0
    do {
      status = tree.tick(ctx)
      visited.push({ x: ctx.startX, y: ctx.startY })
      if (status !== Status.RUNNING) tree.reset()
      ticks++
    } while (status === Status.RUNNING && ticks < 500)
    const reachedTransit = visited.some(
      p => p.x === TRANSIT_COL && p.y === TRANSIT_ROW,
    )
    expect(reachedTransit).toBe(true)
  })

  it('morale is restored when the cross-floor amenity is a lounge', () => {
    const ctx = makeCtxCrossFloor({
      needs: { bladder: 0, morale: 0.90 },
      amenities: [{ id: 'lounge_5', floor: 5, col: 3, row: 1, type: 'lounge' }],
    })
    const { status } = runCrossFloorNeedsCycle(ctx)
    expect(status).not.toBe(Status.RUNNING)
    // UseAmenity resets morale to 0; TickNeeds adds a small amount during
    // the return journey.  The key is that morale was restored (below threshold).
    expect(ctx.needs.morale).toBeLessThan(RESTORED_NEED_MAX)
  })

  it('IsOnWorkFloor guard passes and skips the return elevator when already on work floor', () => {
    // NPC visits an amenity on its own work floor (same-floor logic) then the
    // TransitBackToWorkFloor Selector's IsOnWorkFloor guard should short-circuit.
    const ctx = makeCtxCrossFloor({
      floorNumber: 1,
      amenities: [{ id: 'washroom_1', floor: 1, col: 4, row: 0, type: 'washroom' }],
    })
    const onFloorChangeCalls = []
    ctx.onFloorChange = (f) => onFloorChangeCalls.push(f)
    runCrossFloorNeedsCycle(ctx)
    // No floor change — same-floor amenity, so elevator never rides.
    expect(onFloorChangeCalls).toHaveLength(0)
    expect(ctx.floorNumber).toBe(1)
  })
})

describe('backward compatibility — no needs fields in ctx', () => {
  it('tree completes normal work cycle when ctx.needs is absent', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    const { status } = tickUntilDone(tree, ctx, 50)
    expect(status).toBe(Status.SUCCESS)
  })

  it('tree completes normal work cycle when ctx.amenities is absent', () => {
    const tree = createWorkerTree()
    const ctx  = makeCtx({ startX: 2, startY: 2, deskX: 2, deskY: 2, progress: 0 })
    const { status } = tickUntilDone(tree, ctx, 50)
    expect(status).toBe(Status.SUCCESS)
  })
})
