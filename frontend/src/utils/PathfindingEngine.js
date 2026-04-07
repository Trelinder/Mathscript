/**
 * PathfindingEngine.js
 *
 * Pure A* (A-Star) pathfinding for the 5×5 isometric office grid.
 * Runs completely independently of the visual rendering loop — no
 * Phaser imports, no game-state mutations.
 *
 * Grid conventions (match IsoTycoonScene.js):
 *   - Columns: 0 – GRID_COLS-1  (left → right in world space)
 *   - Rows:    0 – GRID_ROWS-1  (top  → bottom in world space)
 *   - Movement: 4-directional orthogonal (N/E/S/W).  No diagonal
 *     movement is used because the 2:1 isometric projection maps
 *     cardinal grid steps to the clean 2:1 screen vectors.
 *
 * Usage:
 *   import { findPath } from './PathfindingEngine.js'
 *
 *   const path = findPath(0, 0, 4, 4, [
 *     { col: 2, row: 0 },   // wall / upgraded desk
 *     { col: 2, row: 1 },
 *   ])
 *   // → [{ x: 0, y: 0 }, { x: 1, y: 0 }, …, { x: 4, y: 4 }]
 *   // → [] if no path exists
 */

/** Grid dimensions — must match IsoTycoonScene GRID_COLS / GRID_ROWS. */
export const GRID_COLS = 5
export const GRID_ROWS = 5

/**
 * Transit node — the fixed grid cell used as the inter-floor connection point
 * (elevator / stairs) on every floor.
 *
 * Because every floor shares the same 5×5 layout, an NPC that arrives at
 * (TRANSIT_COL, TRANSIT_ROW) on floor N is considered to be standing at the
 * identical overlapping X/Y coordinate on any other floor.  WorkerBehaviorTree
 * routes cross-floor NPCs to this cell first, waits for the transit delay, then
 * resumes from the same cell on the destination floor — the "stacked Z-layer"
 * connection that links floors without modifying the A* heuristic.
 *
 * Cell (4, 4): bottom-right corner of the grid, never occupied by a workstation
 * (all desks sit at row 2, various columns), so the transit lane stays clear.
 */
export const TRANSIT_COL = 4
export const TRANSIT_ROW = 4

/**
 * Floor-change penalty used by the NPC needs system when scoring candidate
 * amenities across multiple floors.  Added to the total path cost whenever an
 * amenity requires a floor change, ensuring same-floor amenities are strongly
 * preferred over cross-floor ones even if the cross-floor amenity is slightly
 * closer in grid cells.
 *
 * The value (50) is deliberately larger than the maximum possible same-floor
 * grid distance (8 steps on a 5×5 grid) so a same-floor amenity at any position
 * will always beat a cross-floor amenity at any position.
 */
export const FLOOR_CHANGE_PENALTY = 50

/**
 * Manhattan-distance heuristic.
 * Admissible for uniform-cost 4-directional grids.
 */
function heuristic(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

/** Canonical string key for a grid coordinate. */
const nodeKey = (x, y) => `${x},${y}`

/**
 * Convert an obstacle list into a fast-lookup Set of "x,y" keys.
 *
 * Each obstacle entry may be:
 *   - { col, row }          — workstation / desk style
 *   - { x,   y   }          — alternative field names
 *   - [col, row]             — array pair
 */
function buildBlockedSet(obstacles) {
  const blocked = new Set()
  for (const o of obstacles) {
    let col, row
    if (Array.isArray(o)) {
      ;[col, row] = o
    } else {
      col = o.col ?? o.x
      row = o.row ?? o.y
    }
    if (col != null && row != null) {
      blocked.add(nodeKey(col, row))
    }
  }
  return blocked
}

/** 4-directional neighbour offsets: N, E, S, W. */
const DIRS = [
  [0, -1],
  [1,  0],
  [0,  1],
  [-1, 0],
]

/**
 * Find the shortest path between two grid coordinates on the isometric
 * office grid using the A* algorithm.
 *
 * @param {number}   startX    - Starting column  (0 … GRID_COLS-1)
 * @param {number}   startY    - Starting row     (0 … GRID_ROWS-1)
 * @param {number}   targetX   - Destination column
 * @param {number}   targetY   - Destination row
 * @param {Array}    [obstacles=[]] - Blocked grid cells (walls, desks, …).
 *                               Each entry: { col, row } | { x, y } | [col, row]
 * @param {number}   [cols=GRID_COLS] - Optional grid width override
 * @param {number}   [rows=GRID_ROWS] - Optional grid height override
 * @param {number}   [transitPenalty=0] - Extra step cost applied when the A*
 *                   expands through the transit node (TRANSIT_COL, TRANSIT_ROW).
 *                   Set to a large value (e.g. FLOOR_CHANGE_PENALTY) to make
 *                   paths that pass through the elevator/stair cell much more
 *                   expensive, steering the algorithm toward same-floor routes.
 *
 * @returns {Array<{x: number, y: number}>} Ordered path from start to target
 *   (both endpoints included), or an empty array when no path exists.
 */
export function findPath(
  startX,
  startY,
  targetX,
  targetY,
  obstacles = [],
  cols = GRID_COLS,
  rows = GRID_ROWS,
  transitPenalty = 0,
) {
  const inBounds = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows

  // --- Guard: invalid coordinates ---
  if (!inBounds(startX, startY) || !inBounds(targetX, targetY)) return []

  const blocked = buildBlockedSet(obstacles)

  // --- Guard: start or target is an obstacle ---
  if (blocked.has(nodeKey(startX, startY))) return []
  if (blocked.has(nodeKey(targetX, targetY))) return []

  // --- Trivial case ---
  if (startX === targetX && startY === targetY) {
    return [{ x: startX, y: startY }]
  }

  // --- A* ---
  // openSet: array of nodes sorted on-demand (small grid → linear scan is fine)
  // openMap: key → node reference for O(1) look-ups / updates
  // closedSet: keys of fully-evaluated nodes

  const openSet = []
  const openMap = new Map()
  const closedSet = new Set()

  const startNode = {
    x: startX,
    y: startY,
    g: 0,
    f: heuristic(startX, startY, targetX, targetY),
    parent: null,
  }

  openSet.push(startNode)
  openMap.set(nodeKey(startX, startY), startNode)

  while (openSet.length > 0) {
    // Pick the open node with the lowest f-score.
    let bestIdx = 0
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[bestIdx].f) bestIdx = i
    }
    const current = openSet[bestIdx]
    openSet.splice(bestIdx, 1)
    openMap.delete(nodeKey(current.x, current.y))

    // --- Goal reached → reconstruct path ---
    if (current.x === targetX && current.y === targetY) {
      const path = []
      let node = current
      while (node !== null) {
        path.unshift({ x: node.x, y: node.y })
        node = node.parent
      }
      return path
    }

    const ck = nodeKey(current.x, current.y)
    closedSet.add(ck)

    // --- Expand neighbours ---
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx
      const ny = current.y + dy
      const nk = nodeKey(nx, ny)

      if (!inBounds(nx, ny))    continue
      if (closedSet.has(nk))    continue
      if (blocked.has(nk))      continue

      const tentativeG = current.g + 1 +
        (transitPenalty > 0 && nx === TRANSIT_COL && ny === TRANSIT_ROW ? transitPenalty : 0)

      if (openMap.has(nk)) {
        // Node already in open set — update if this path is cheaper.
        const existing = openMap.get(nk)
        if (tentativeG < existing.g) {
          existing.g = tentativeG
          existing.f = tentativeG + heuristic(nx, ny, targetX, targetY)
          existing.parent = current
        }
      } else {
        const neighbour = {
          x: nx,
          y: ny,
          g: tentativeG,
          f: tentativeG + heuristic(nx, ny, targetX, targetY),
          parent: current,
        }
        openSet.push(neighbour)
        openMap.set(nk, neighbour)
      }
    }
  }

  // Open set exhausted — no path exists.
  return []
}

/**
 * Return the actual A* cost of the cheapest path between two grid coordinates.
 *
 * Unlike `findPath().length - 1`, this accounts for the `transitPenalty` cost
 * that may be applied when stepping through the transit node.  Returns `Infinity`
 * when no path exists.
 *
 * Used by WorkerBehaviorTree's `FindNearestAmenity` action to compare the true
 * cost of reaching a same-floor amenity against the cost of a cross-floor one.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} targetX
 * @param {number} targetY
 * @param {Array}  [obstacles=[]]
 * @param {number} [cols=GRID_COLS]
 * @param {number} [rows=GRID_ROWS]
 * @param {number} [transitPenalty=0]
 * @returns {number} Total path cost, or `Infinity` when unreachable.
 */
export function findPathCost(
  startX,
  startY,
  targetX,
  targetY,
  obstacles = [],
  cols = GRID_COLS,
  rows = GRID_ROWS,
  transitPenalty = 0,
) {
  const path = findPath(startX, startY, targetX, targetY, obstacles, cols, rows, transitPenalty)
  if (path.length === 0) return Infinity
  // Sum actual step costs (each step costs 1, transit step costs 1 + transitPenalty).
  // The final step (reaching the target) is NOT penalised even if it lands on the
  // transit node — the penalty applies only to transiting through it as a waypoint.
  let cost = 0
  for (let i = 1; i < path.length; i++) {
    cost += 1
    if (
      transitPenalty > 0 &&
      i < path.length - 1 &&
      path[i].x === TRANSIT_COL &&
      path[i].y === TRANSIT_ROW
    ) {
      cost += transitPenalty
    }
  }
  return cost
}
