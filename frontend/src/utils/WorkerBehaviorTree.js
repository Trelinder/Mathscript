/**
 * WorkerBehaviorTree.js
 *
 * Behavior Tree definition for an isometric office worker NPC.
 *
 * The tree is a pure logic layer — it never touches the Phaser rendering
 * loop, the EconomyEngine math, or any game-state globals.  All inputs and
 * outputs flow through a plain mutable **worker context** object that the
 * caller creates and owns.
 *
 * ─── Worker Context (ctx) ────────────────────────────────────────────────────
 *
 * Fields the caller must supply before the first tick():
 *
 *   ctx.startX    {number}  Worker's current grid column  (0 … GRID_COLS-1)
 *   ctx.startY    {number}  Worker's current grid row     (0 … GRID_ROWS-1)
 *   ctx.deskX     {number}  Destination desk column
 *   ctx.deskY     {number}  Destination desk row
 *   ctx.progress  {number}  Normalized production cycle progress (0–1),
 *                           updated by the caller from the GameEventBus
 *                           `floor:progress` event before each tick().
 *   ctx.obstacles {Array}   Blocked grid cells — same format accepted by
 *                           PathfindingEngine.findPath().  Defaults to [].
 *
 * Fields written by the tree (read back by the caller / renderer):
 *
 *   ctx.startX / ctx.startY  — updated step-by-step as the worker walks.
 *   ctx.isWorking            — true while the work animation should play,
 *                              false when the worker is idle.
 *   ctx.propVisible          — true while the worker is actively carrying /
 *                              operating a prop (mirrors isWorking during the
 *                              PerformWorkAnimation phase).  The renderer reads
 *                              this to drive PropAttachmentSystem.setVisible().
 *
 * Private fields (managed internally, do not set from outside):
 *
 *   ctx._path      {Array<{x,y}>|null}  Path computed by A*.
 *   ctx._pathIndex {number}             Current step along the path.
 *
 * ─── Worker Routine Sequence ─────────────────────────────────────────────────
 *
 *   Sequence "WorkerRoutine"
 *   ├── Action "RequestPathToDesk"
 *   │     Calls PathfindingEngine.findPath() and stores the result.
 *   │     → SUCCESS when a valid path exists.
 *   │     → FAILURE when no path exists (worker stays idle this cycle).
 *   │
 *   ├── Action "WalkAlongPath"
 *   │     Advances the worker one grid step per tick until it reaches
 *   │     the destination desk.
 *   │     → RUNNING while en route.
 *   │     → SUCCESS on arrival.
 *   │
 *   ├── Action "PerformWorkAnimation"
 *   │     Reads ctx.progress (the normalized 0–1 float from the
 *   │     floor:progress GameEventBus event) to determine animation state.
 *   │     ctx.isWorking is set to true while 0 < progress < 1.
 *   │     → RUNNING while the production cycle is in progress.
 *   │     → SUCCESS when the cycle completes (progress reaches 1 or resets).
 *   │
 *   └── Action "ReturnToIdle"
 *         Clears the path and marks the worker as idle.
 *         → SUCCESS immediately (clean-up step).
 *
 * After the root Sequence returns SUCCESS or FAILURE call tree.reset() and
 * tick() again on the next production cycle.
 *
 * Usage:
 *   import { createWorkerTree } from './WorkerBehaviorTree.js'
 *
 *   const ctx = { startX:0, startY:0, deskX:2, deskY:2, progress:0, obstacles:[] }
 *   const tree = createWorkerTree()
 *
 *   // Each game tick (or GameEventBus 'floor:progress' callback):
 *   ctx.progress = latestProgress   // ← hook into normalized engine float
 *   const status = tree.tick(ctx)
 *   if (status !== Status.RUNNING) tree.reset()
 */

import { findPath } from './PathfindingEngine.js'
import { Status, Action, Sequence, BehaviorTree } from './BehaviorTree.js'

// ─── Leaf actions ─────────────────────────────────────────────────────────────

/**
 * RequestPathToDesk
 *
 * Uses A* (PathfindingEngine) to compute the shortest unobstructed path from
 * the worker's current position to the desk.  Stores the result on ctx so
 * WalkAlongPath can consume it.
 */
function makeRequestPathAction() {
  return new Action('RequestPathToDesk', (ctx) => {
    const path = findPath(
      ctx.startX,
      ctx.startY,
      ctx.deskX,
      ctx.deskY,
      ctx.obstacles ?? [],
    )

    if (path.length === 0) {
      // No reachable path — clear any stale data and abort this cycle.
      ctx._path = null
      ctx._pathIndex = 0
      return Status.FAILURE
    }

    ctx._path = path
    ctx._pathIndex = 0
    return Status.SUCCESS
  })
}

/**
 * WalkAlongPath
 *
 * Advances the worker one grid step per tick along the pre-computed path.
 * Updates ctx.startX / ctx.startY so the renderer can read the current
 * position each tick.
 *
 * Returns RUNNING until the worker arrives at the final step (the desk),
 * at which point it returns SUCCESS.
 */
function makeWalkAlongPathAction() {
  return new Action('WalkAlongPath', (ctx) => {
    const path = ctx._path
    if (!path || path.length === 0) return Status.FAILURE

    const lastIdx = path.length - 1

    // Already at destination (single-step path or repeated tick).
    if (ctx._pathIndex >= lastIdx) {
      const dest = path[lastIdx]
      ctx.startX = dest.x
      ctx.startY = dest.y
      return Status.SUCCESS
    }

    // Advance one step.
    ctx._pathIndex++
    const step = path[ctx._pathIndex]
    ctx.startX = step.x
    ctx.startY = step.y

    return ctx._pathIndex >= lastIdx ? Status.SUCCESS : Status.RUNNING
  })
}

/**
 * PerformWorkAnimation
 *
 * Hooks into the normalized production-cycle float (`ctx.progress`) that
 * the caller keeps in sync with the GameEventBus `floor:progress` event
 * (emitted by EconomyEngine / GamePlayerPage).
 *
 * While 0 < progress < 1 the worker is actively producing; ctx.isWorking
 * is set to true so the renderer knows which animation to play.
 *
 * Returns RUNNING during an active cycle, SUCCESS when the cycle finishes.
 * The EconomyEngine math that determines the cycle duration and currency
 * earned is never touched here.
 */
function makePerformWorkAction() {
  return new Action('PerformWorkAnimation', (ctx) => {
    const progress = ctx.progress ?? 0

    if (progress > 0 && progress < 1) {
      // Active production cycle — play work animation and show held prop.
      ctx.isWorking   = true
      ctx.propVisible = true
      return Status.RUNNING
    }

    // progress === 0  → cycle not started yet  (treat as complete/idle)
    // progress >= 1   → cycle just finished
    ctx.isWorking   = false
    ctx.propVisible = false
    return Status.SUCCESS
  })
}

/**
 * ReturnToIdle
 *
 * Cleans up after the production cycle: resets path data and marks the
 * worker as idle.  Always succeeds immediately.
 */
function makeReturnToIdleAction() {
  return new Action('ReturnToIdle', (ctx) => {
    ctx.isWorking   = false
    ctx.propVisible = false
    ctx._path       = null
    ctx._pathIndex  = 0
    return Status.SUCCESS
  })
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a new worker Behavior Tree instance.
 *
 * Each NPC worker should own its own tree so internal _runningIdx state does
 * not bleed across workers.
 *
 * @returns {BehaviorTree}
 */
export function createWorkerTree() {
  const root = new Sequence('WorkerRoutine', [
    makeRequestPathAction(),
    makeWalkAlongPathAction(),
    makePerformWorkAction(),
    makeReturnToIdleAction(),
  ])
  return new BehaviorTree(root)
}

// Re-export Status so callers only need one import.
export { Status }
