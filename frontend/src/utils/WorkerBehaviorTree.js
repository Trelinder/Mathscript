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
 *   ctx.startX       {number}  Worker's current grid column  (0 … GRID_COLS-1)
 *   ctx.startY       {number}  Worker's current grid row     (0 … GRID_ROWS-1)
 *   ctx.deskX        {number}  Destination desk column
 *   ctx.deskY        {number}  Destination desk row
 *   ctx.floorNumber  {number}  NPC's current floor (1–7).  Defaults to
 *                              ctx.targetFloor (same-floor) when omitted.
 *   ctx.targetFloor  {number}  Floor the destination desk lives on.  When
 *                              equal to ctx.floorNumber the transit phase is
 *                              skipped entirely.
 *   ctx.progress     {number}  Normalized production cycle progress (0–1),
 *                              updated by the caller from the GameEventBus
 *                              `floor:progress` event before each tick().
 *   ctx.obstacles    {Array}   Blocked grid cells — same format accepted by
 *                              PathfindingEngine.findPath().  Defaults to [].
 *   ctx.onFloorChange {function|undefined}
 *                              Optional callback invoked once when the NPC
 *                              completes the transit ride and updates its floor.
 *                              Signature: (newFloorNumber: number) => void.
 *                              The renderer uses this to reposition the sprite
 *                              so the Y-sort depth loop picks up the change.
 *   ctx.infraLevel          {number}  Current infrastructure room level (default 0).
 *                              Passed in by the scene after each status poll.
 *                              Used by CheckInfraCapacity to derive the allowed
 *                              total workspace level (infraCapacity(infraLevel)).
 *   ctx.totalWorkspaceLevel {number}  Current sum of all workstation levels
 *                              (default 0).  Also kept up-to-date by the scene.
 *                              When this exceeds infraCapacity the NPC is blocked.
 *
 * Fields written by the tree (read back by the caller / renderer):
 *
 *   ctx.startX / ctx.startY  — updated step-by-step as the worker walks.
 *   ctx.floorNumber          — updated to ctx.targetFloor after transit.
 *   ctx.isWorking            — true while the work animation should play.
 *   ctx.propVisible          — true while the worker is actively carrying /
 *                              operating a prop (mirrors isWorking during the
 *                              PerformWorkAnimation phase).
 *
 * Private fields (managed internally, do not set from outside):
 *
 *   ctx._path         {Array<{x,y}>|null}  Path computed by A*.
 *   ctx._pathIndex    {number}             Current step along the path.
 *   ctx._transitWait  {number|null}        Remaining ticks at the transit node.
 *
 * ─── Worker Routine Sequence ─────────────────────────────────────────────────
 *
 *   Sequence "WorkerRoutine"
 *   ├── Selector "TransitIfNeeded"
 *   │   ├── Action "IsSameFloor"
 *   │   │     Succeeds immediately when the NPC is already on the target floor
 *   │   │     (or when floor fields are not set), bypassing transit entirely.
 *   │   │
 *   │   └── Sequence "CrossFloorTransit"
 *   │       ├── Action "RequestPathToTransit"
 *   │       │     A* path from current position to the shared transit node
 *   │       │     (TRANSIT_COL, TRANSIT_ROW) on the current floor.
 *   │       ├── Action "WalkAlongPath"
 *   │       │     Walk to the transit node (one step per tick).
 *   │       └── Action "RideElevator"
 *   │             Wait transitDelayTicks ticks, then set ctx.floorNumber to
 *   │             ctx.targetFloor and fire ctx.onFloorChange?.
 *   │
 *   ├── Action "RequestPathToDesk"
 *   │     A* path from current position (the transit node when cross-floor, or
 *   │     the original start when same-floor) to the destination desk.
 *   │
 *   ├── Action "WalkAlongPath"
 *   │     Walk to the desk (one step per tick).
 *   │
 *   ├── Action "CheckInfraCapacity"
 *   │     Gate: succeeds when ctx.totalWorkspaceLevel ≤ infraCapacity(ctx.infraLevel).
 *   │     Returns FAILURE when the infrastructure room is over-capacity, causing
 *   │     the NPC to skip the work phase and stay in a blocked/idle state at the
 *   │     desk position until the caller raises ctx.infraLevel.
 *   │
 *   ├── Action "PerformWorkAnimation"
 *   │     Reads ctx.progress to drive the work animation.
 *   │
 *   └── Action "ReturnToIdle"
 *         Clears all transient state.
 *
 * After the root Sequence returns SUCCESS or FAILURE call tree.reset() and
 * tick() again on the next production cycle.
 */

import { findPath, TRANSIT_COL, TRANSIT_ROW } from './PathfindingEngine.js'
import { Status, Action, Sequence, Selector, BehaviorTree } from './BehaviorTree.js'
import { infraCapacity } from './EconomyEngine.js'

// ─── Leaf actions ─────────────────────────────────────────────────────────────

/**
 * IsSameFloor
 *
 * Guard that succeeds when the NPC is already on its target floor, allowing
 * the Selector to skip the entire transit sequence.  Also succeeds when floor
 * fields are absent (backward-compatible with single-floor contexts).
 */
function makeIsSameFloorAction() {
  return new Action('IsSameFloor', (ctx) =>
    ctx.floorNumber === ctx.targetFloor
      ? Status.SUCCESS
      : Status.FAILURE,
  )
}

/**
 * RequestPathToTransit
 *
 * Computes an A* path from the NPC's current position to the shared transit
 * node (TRANSIT_COL, TRANSIT_ROW) on the current floor.  The transit node is
 * at the same grid coordinates on every floor, forming the vertical link
 * between Z-layers without altering the horizontal A* heuristic.
 */
function makeRequestPathToTransitAction() {
  return new Action('RequestPathToTransit', (ctx) => {
    const path = findPath(
      ctx.startX,
      ctx.startY,
      TRANSIT_COL,
      TRANSIT_ROW,
      ctx.obstacles ?? [],
    )

    if (path.length === 0) {
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
 * RideElevator
 *
 * Simulates the transit delay at the inter-floor node.  Returns RUNNING for
 * `transitDelayTicks` ticks, then updates ctx.floorNumber to ctx.targetFloor
 * and fires the optional ctx.onFloorChange callback so the renderer can
 * reposition the sprite — triggering the Y-sort depth update automatically.
 *
 * The wait counter lives on ctx._transitWait so it survives RUNNING ticks
 * inside the memory-variant Sequence.  ReturnToIdle resets it at end-of-cycle.
 *
 * @param {number} [transitDelayTicks=15]
 */
function makeRideElevatorAction(transitDelayTicks = 15) {
  return new Action('RideElevator', (ctx) => {
    // Loose equality intentionally catches both null (reset by ReturnToIdle)
    // and undefined (field not yet present on ctx), so the countdown starts
    // fresh on the first entry to this action regardless of how ctx was created.
    if (ctx._transitWait == null) {
      ctx._transitWait = transitDelayTicks
    }

    ctx._transitWait--

    if (ctx._transitWait > 0) return Status.RUNNING

    // Transit complete — move the NPC to the target floor.
    ctx._transitWait = null
    ctx.floorNumber  = ctx.targetFloor
    ctx.onFloorChange?.(ctx.targetFloor)
    return Status.SUCCESS
  })
}

/**
 * RequestPathToDesk
 *
 * Uses A* (PathfindingEngine) to compute the shortest unobstructed path from
 * the worker's current position to the desk.  After cross-floor transit,
 * ctx.startX/Y is already at the transit node on the new floor, so this action
 * correctly paths from there to the desk without any special casing.
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
 * Returns RUNNING until the worker arrives at the final step, at which point
 * it returns SUCCESS.  Used for both legs of the journey (to transit node and
 * to desk) — ctx._path is replaced between legs by the preceding Request action.
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
      ctx.isWorking   = true
      ctx.propVisible = true
      return Status.RUNNING
    }

    ctx.isWorking   = false
    ctx.propVisible = false
    return Status.SUCCESS
  })
}

/**
 * CheckInfraCapacity
 *
 * Guard node placed just before PerformWorkAnimation.  Returns FAILURE when
 * the total workspace level exceeds the infrastructure room's capacity, causing
 * the NPC to hold in a blocked/idle state at the desk without starting a work
 * cycle.  The tree resets on FAILURE, so the check is re-evaluated every cycle
 * — the NPC resumes automatically once ctx.infraLevel is raised by the caller.
 *
 * Both ctx fields default to 0 when absent so legacy contexts (no floor fields)
 * pass the check (infraCapacity(0) = 0, total = 0, 0 ≤ 0 → SUCCESS).
 */
function makeCheckInfraCapacityAction() {
  return new Action('CheckInfraCapacity', (ctx) => {
    const total    = ctx.totalWorkspaceLevel ?? 0
    const capacity = infraCapacity(ctx.infraLevel ?? 0)
    return total <= capacity ? Status.SUCCESS : Status.FAILURE
  })
}

/**
 * Cleans up after the production cycle: resets path data, transit state, and
 * marks the worker as idle.  Always succeeds immediately.
 */
function makeReturnToIdleAction() {
  return new Action('ReturnToIdle', (ctx) => {
    ctx.isWorking    = false
    ctx.propVisible  = false
    ctx._path        = null
    ctx._pathIndex   = 0
    ctx._transitWait = null
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
 * Tree structure:
 *
 *   Sequence "WorkerRoutine"
 *   ├── Selector "TransitIfNeeded"   ← skipped if same-floor (IsSameFloor succeeds)
 *   │   ├── Action "IsSameFloor"
 *   │   └── Sequence "CrossFloorTransit"
 *   │       ├── RequestPathToTransit
 *   │       ├── WalkAlongPath
 *   │       └── RideElevator
 *   ├── RequestPathToDesk
 *   ├── WalkAlongPath
 *   ├── CheckInfraCapacity   ← FAILURE if over-capacity → NPC idles at desk
 *   ├── PerformWorkAnimation
 *   └── ReturnToIdle
 *
 * @returns {BehaviorTree}
 */
export function createWorkerTree() {
  const root = new Sequence('WorkerRoutine', [
    new Selector('TransitIfNeeded', [
      makeIsSameFloorAction(),
      new Sequence('CrossFloorTransit', [
        makeRequestPathToTransitAction(),
        makeWalkAlongPathAction(),
        makeRideElevatorAction(),
      ]),
    ]),
    makeRequestPathAction(),
    makeWalkAlongPathAction(),
    makeCheckInfraCapacityAction(),
    makePerformWorkAction(),
    makeReturnToIdleAction(),
  ])
  return new BehaviorTree(root)
}

// Re-export Status so callers only need one import.
export { Status }
