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
 *   ctx.needs        {{ bladder: number, morale: number }}
 *                              Optional. Each value runs 0–1 and is incremented
 *                              by NEEDS_TICK_RATE per tree tick.  When a value
 *                              reaches NEEDS_THRESHOLD the NPC interrupts its
 *                              work loop to visit the nearest suitable amenity.
 *                              If omitted, the tree initialises it lazily.
 *   ctx.amenities    {Array<{ id:string, floor:number, col:number, row:number,
 *                              type:'washroom'|'lounge' }>}
 *                              Optional list of amenity rooms available in the
 *                              building.  When empty or absent, the needs branch
 *                              never fires (no destinations to visit).
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
 *   ctx._needTarget   {{floor,col,row,type}|null}  Amenity chosen by FindNearestAmenity.
 *   ctx._amenityWait  {number|null}        Remaining ticks at the amenity room.
 *
 * ─── Full Tree Structure ─────────────────────────────────────────────────────
 *
 *   PrioritySelector "Root"
 *   │   Re-evaluates from child 0 every tick so the needs branch can preempt
 *   │   the work routine whenever a need becomes critical.
 *   │
 *   ├── Action "TickNeeds"
 *   │     Increments ctx.needs by NEEDS_TICK_RATE; always returns FAILURE
 *   │     (side-effect only — PrioritySelector continues to the next child).
 *   │
 *   ├── Sequence "NeedsUrgencyBranch"
 *   │   │   Only activates when a need ≥ NEEDS_THRESHOLD.
 *   │   ├── Action "CheckNeedsCritical"
 *   │   │     FAILURE when no need is critical → falls through to WorkerRoutine.
 *   │   ├── Action "FindNearestAmenity"
 *   │   │     Scores candidates using FLOOR_CHANGE_PENALTY so same-floor rooms
 *   │   │     are always preferred.  Sets ctx._needTarget.
 *   │   ├── Selector "TransitToAmenityFloor"
 *   │   │   ├── Action "IsAmenityOnSameFloor"
 *   │   │   └── Sequence "CrossFloorToAmenity"
 *   │   │       ├── RequestPathToTransit
 *   │   │       ├── WalkAlongPath
 *   │   │       └── RideElevatorToAmenityFloor
 *   │   ├── Action "RequestPathToAmenity"
 *   │   ├── Action "WalkAlongPath"
 *   │   ├── Action "UseAmenity"
 *   │   │     Waits AMENITY_USE_TICKS ticks then restores the critical need to 0.
 *   │   ├── Selector "TransitBackToWorkFloor"
 *   │   │   ├── Action "IsOnWorkFloor"
 *   │   │   └── Sequence "CrossFloorBack"
 *   │   │       ├── RequestPathToTransit
 *   │   │       ├── WalkAlongPath
 *   │   │       └── RideElevatorToWorkFloor
 *   │   └── Action "NeedsCleanup"
 *   │         Clears ctx._needTarget, ctx._path, ctx._amenityWait so the
 *   │         work routine restarts cleanly after the needs cycle.
 *   │
 *   └── Sequence "WorkerRoutine"  (unchanged from original tree)
 *       ├── Selector "TransitIfNeeded"
 *       │   ├── Action "IsSameFloor"
 *       │   └── Sequence "CrossFloorTransit"
 *       │       ├── RequestPathToTransit
 *       │       ├── WalkAlongPath
 *       │       └── RideElevator
 *       ├── RequestPathToDesk
 *       ├── WalkAlongPath
 *       ├── CheckInfraCapacity
 *       ├── PerformWorkAnimation
 *       └── ReturnToIdle
 *
 * After the root PrioritySelector returns SUCCESS or FAILURE the caller must
 * call tree.reset() before the next production / needs cycle.
 * IsoTycoonScene._tickBTs() does this automatically.
 */

import { findPath, findPathCost, TRANSIT_COL, TRANSIT_ROW, FLOOR_CHANGE_PENALTY } from './PathfindingEngine.js'
import { Status, Action, Sequence, Selector, PrioritySelector, BehaviorTree } from './BehaviorTree.js'
import { infraCapacity } from './EconomyEngine.js'

// ─── Needs constants ──────────────────────────────────────────────────────────

/** Amount each need value grows per BT tick.  1 000 ticks ≈ 17 s at 60 fps. */
const NEEDS_TICK_RATE  = 0.001
/** Need value (0–1) at which the NPC interrupts work to visit an amenity. */
const NEEDS_THRESHOLD  = 0.80
/** Ticks spent at the amenity room before the need is considered restored. */
const AMENITY_USE_TICKS = 20

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
/**
 * Internal base factory for elevator ride actions.
 *
 * @param {function(object): number} getTargetFloor  (ctx) => target floor number
 * @param {string}  name             Node label (for debugging)
 * @param {number}  transitDelayTicks
 */
function makeRideElevatorBase(getTargetFloor, name, transitDelayTicks = 15) {
  return new Action(name, (ctx) => {
    // Loose equality catches both null (reset) and undefined (first tick).
    if (ctx._transitWait == null) ctx._transitWait = transitDelayTicks
    ctx._transitWait--
    if (ctx._transitWait > 0) return Status.RUNNING
    ctx._transitWait = null
    const floor = getTargetFloor(ctx)
    ctx.floorNumber = floor
    ctx.onFloorChange?.(floor)
    return Status.SUCCESS
  })
}

function makeRideElevatorAction(transitDelayTicks = 15) {
  return makeRideElevatorBase(ctx => ctx.targetFloor, 'RideElevator', transitDelayTicks)
}

/** Rides to the floor held in ctx._needTarget.floor (needs branch). */
function makeRideElevatorToNeedFloorAction(transitDelayTicks = 15) {
  return makeRideElevatorBase(
    ctx => ctx._needTarget?.floor ?? ctx.floorNumber,
    'RideElevatorToAmenityFloor',
    transitDelayTicks,
  )
}

/** Rides back to the NPC's work floor (ctx.targetFloor) after amenity visit. */
function makeRideElevatorToWorkFloorAction(transitDelayTicks = 15) {
  return makeRideElevatorBase(ctx => ctx.targetFloor, 'RideElevatorToWorkFloor', transitDelayTicks)
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

// ─── Needs-system actions ─────────────────────────────────────────────────────

/**
 * TickNeeds
 *
 * Increments each need value by NEEDS_TICK_RATE every BT tick, capped at 1.
 * Lazily initialises ctx.needs when absent.
 *
 * Always returns FAILURE so that the PrioritySelector it lives in continues
 * evaluating higher-priority children.  This is a pure side-effect node.
 */
function makeTickNeedsAction() {
  return new Action('TickNeeds', (ctx) => {
    if (!ctx.needs) ctx.needs = { bladder: 0, morale: 0 }
    ctx.needs.bladder = Math.min(1, ctx.needs.bladder + NEEDS_TICK_RATE)
    ctx.needs.morale  = Math.min(1, ctx.needs.morale  + NEEDS_TICK_RATE)
    return Status.FAILURE  // side-effect only — PrioritySelector continues
  })
}

/**
 * CheckNeedsCritical
 *
 * Returns SUCCESS when at least one need value has reached NEEDS_THRESHOLD,
 * causing the NeedsUrgencyBranch Sequence to proceed.  Returns FAILURE
 * otherwise, allowing the PrioritySelector to fall through to WorkerRoutine.
 */
function makeCheckNeedsCriticalAction() {
  return new Action('CheckNeedsCritical', (ctx) => {
    if (!ctx.needs) return Status.FAILURE
    const critical = ctx.needs.bladder >= NEEDS_THRESHOLD
                  || ctx.needs.morale  >= NEEDS_THRESHOLD
    return critical ? Status.SUCCESS : Status.FAILURE
  })
}

/**
 * FindNearestAmenity
 *
 * Selects the lowest-cost reachable amenity from ctx.amenities, applying
 * FLOOR_CHANGE_PENALTY to any cross-floor candidate.  This ensures an NPC
 * on floor 3 with a washroom available always visits that washroom rather
 * than walking to a washroom on a different floor — preventing the classic
 * simulation-game pathfinding flaw where NPCs bypass same-floor amenities.
 *
 * Sets ctx._needTarget to the winning amenity and returns SUCCESS.
 * Returns FAILURE when ctx.amenities is absent or empty.
 */
function makeFindNearestAmenityAction() {
  return new Action('FindNearestAmenity', (ctx) => {
    const amenities = ctx.amenities
    if (!amenities || amenities.length === 0) return Status.FAILURE

    let bestAmenity = null
    let bestCost    = Infinity

    for (const amenity of amenities) {
      const isSameFloor = amenity.floor === ctx.floorNumber

      if (isSameFloor) {
        // Direct A* cost on the same floor — no floor-change penalty.
        const cost = findPathCost(
          ctx.startX, ctx.startY,
          amenity.col, amenity.row,
          ctx.obstacles ?? [],
        )
        if (cost < bestCost) { bestCost = cost; bestAmenity = amenity }
      } else {
        // Cross-floor path: current position → transit node → amenity floor.
        // FLOOR_CHANGE_PENALTY is added between the two path segments so same-
        // floor candidates always win unless the same floor has no reachable amenity.
        const toTransit = findPathCost(
          ctx.startX, ctx.startY,
          TRANSIT_COL, TRANSIT_ROW,
          ctx.obstacles ?? [],
        )
        if (toTransit < Infinity) {
          const fromTransit = findPathCost(
            TRANSIT_COL, TRANSIT_ROW,
            amenity.col, amenity.row,
            ctx.obstacles ?? [],
          )
          const cost = toTransit + FLOOR_CHANGE_PENALTY + fromTransit
          if (cost < bestCost) { bestCost = cost; bestAmenity = amenity }
        }
      }
    }

    if (!bestAmenity) return Status.FAILURE
    ctx._needTarget = bestAmenity
    return Status.SUCCESS
  })
}

/**
 * IsAmenityOnSameFloor
 *
 * Guard that returns SUCCESS when the selected amenity (ctx._needTarget) is on
 * the NPC's current floor, allowing the TransitToAmenityFloor Selector to skip
 * the cross-floor transit Sequence.
 */
function makeIsAmenityOnSameFloorAction() {
  return new Action('IsAmenityOnSameFloor', (ctx) =>
    ctx._needTarget?.floor === ctx.floorNumber ? Status.SUCCESS : Status.FAILURE,
  )
}

/**
 * IsOnWorkFloor
 *
 * Guard that returns SUCCESS when the NPC is already on its work floor
 * (ctx.floorNumber === ctx.targetFloor), allowing the TransitBackToWorkFloor
 * Selector to skip the return elevator ride.
 */
function makeIsOnWorkFloorAction() {
  return new Action('IsOnWorkFloor', (ctx) =>
    ctx.floorNumber === ctx.targetFloor ? Status.SUCCESS : Status.FAILURE,
  )
}

/**
 * RequestPathToAmenity
 *
 * Computes an A* path from the worker's current position to the amenity cell
 * stored in ctx._needTarget.  After cross-floor transit the worker starts at
 * (TRANSIT_COL, TRANSIT_ROW) on the amenity floor, so this paths correctly
 * without special-casing.
 */
function makeRequestPathToAmenityAction() {
  return new Action('RequestPathToAmenity', (ctx) => {
    if (!ctx._needTarget) return Status.FAILURE
    const path = findPath(
      ctx.startX,      ctx.startY,
      ctx._needTarget.col, ctx._needTarget.row,
      ctx.obstacles ?? [],
    )
    if (path.length === 0) return Status.FAILURE
    ctx._path      = path
    ctx._pathIndex = 0
    return Status.SUCCESS
  })
}

/**
 * UseAmenity
 *
 * Simulates the NPC spending time at the amenity room.  Returns RUNNING for
 * AMENITY_USE_TICKS ticks, then restores the need that triggered the visit to
 * 0 and returns SUCCESS.
 *
 * Type resolution:
 *   ctx._needTarget.type === 'lounge'  → restores morale
 *   anything else                      → restores bladder
 */
function makeUseAmenityAction(useTicks = AMENITY_USE_TICKS) {
  return new Action('UseAmenity', (ctx) => {
    if (ctx._amenityWait == null) ctx._amenityWait = useTicks
    ctx._amenityWait--
    if (ctx._amenityWait > 0) return Status.RUNNING

    ctx._amenityWait = null
    if (!ctx.needs) ctx.needs = { bladder: 0, morale: 0 }
    if (ctx._needTarget?.type === 'lounge') {
      ctx.needs.morale  = 0
    } else {
      ctx.needs.bladder = 0
    }
    return Status.SUCCESS
  })
}

/**
 * NeedsCleanup
 *
 * Clears all transient needs-branch state so WorkerRoutine can restart cleanly
 * after the NPC returns from the amenity.  WalkAlongPath checks ctx._path for
 * null and returns FAILURE, propagating out of WorkerRoutine's Sequence (which
 * then resets itself) — ensuring the work cycle begins fresh from the top.
 */
function makeNeedsCleanupAction() {
  return new Action('NeedsCleanup', (ctx) => {
    ctx._needTarget  = null
    ctx._path        = null
    ctx._pathIndex   = 0
    ctx._transitWait = null
    ctx._amenityWait = null
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
 * See the module-level JSDoc for the full tree structure.
 *
 * @returns {BehaviorTree}
 */
export function createWorkerTree() {
  // ── NeedsUrgencyBranch ──────────────────────────────────────────────────────
  // Fires only when a need is critical.  Uses FLOOR_CHANGE_PENALTY in
  // FindNearestAmenity to guarantee same-floor amenities are always preferred.
  const needsUrgencyBranch = new Sequence('NeedsUrgencyBranch', [
    makeCheckNeedsCriticalAction(),
    makeFindNearestAmenityAction(),
    new Selector('TransitToAmenityFloor', [
      makeIsAmenityOnSameFloorAction(),
      new Sequence('CrossFloorToAmenity', [
        makeRequestPathToTransitAction(),
        makeWalkAlongPathAction(),
        makeRideElevatorToNeedFloorAction(),
      ]),
    ]),
    makeRequestPathToAmenityAction(),
    makeWalkAlongPathAction(),
    makeUseAmenityAction(),
    new Selector('TransitBackToWorkFloor', [
      makeIsOnWorkFloorAction(),
      new Sequence('CrossFloorBack', [
        makeRequestPathToTransitAction(),
        makeWalkAlongPathAction(),
        makeRideElevatorToWorkFloorAction(),
      ]),
    ]),
    makeNeedsCleanupAction(),
  ])

  // ── WorkerRoutine (original logic, unchanged) ───────────────────────────────
  const workerRoutine = new Sequence('WorkerRoutine', [
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

  // ── Root: PrioritySelector re-evaluates from child 0 every tick ─────────────
  // TickNeeds always returns FAILURE so the selector continues.
  // NeedsUrgencyBranch intercepts when needs are critical.
  // WorkerRoutine handles the normal production cycle.
  const root = new PrioritySelector('Root', [
    makeTickNeedsAction(),
    needsUrgencyBranch,
    workerRoutine,
  ])

  return new BehaviorTree(root)
}

// Re-export Status so callers only need one import.
export { Status }
