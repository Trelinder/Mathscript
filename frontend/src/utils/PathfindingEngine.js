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

      const tentativeG = current.g + 1

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
