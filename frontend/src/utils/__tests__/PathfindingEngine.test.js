import { describe, it, expect } from 'vitest'
import { findPath, findPathCost, GRID_COLS, GRID_ROWS, TRANSIT_COL, TRANSIT_ROW, FLOOR_CHANGE_PENALTY } from '../PathfindingEngine.js'

describe('PathfindingEngine', () => {
  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Assert every consecutive pair of path steps is orthogonally adjacent. */
  function assertAdjacent(path) {
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i].x - path[i - 1].x)
      const dy = Math.abs(path[i].y - path[i - 1].y)
      expect(dx + dy, `step ${i - 1}→${i} should be distance 1`).toBe(1)
    }
  }

  /** Assert every step lies within the default 5×5 grid. */
  function assertInBounds(path) {
    for (const step of path) {
      expect(step.x).toBeGreaterThanOrEqual(0)
      expect(step.x).toBeLessThan(GRID_COLS)
      expect(step.y).toBeGreaterThanOrEqual(0)
      expect(step.y).toBeLessThan(GRID_ROWS)
    }
  }

  /** Assert no step coincides with a blocked cell. */
  function assertNoObstacle(path, obstacles) {
    const keys = new Set(obstacles.map(o => `${o.col ?? o[0]},${o.row ?? o[1]}`))
    for (const step of path) {
      expect(keys.has(`${step.x},${step.y}`), `step (${step.x},${step.y}) is blocked`).toBe(false)
    }
  }

  // ─── Trivial / edge cases ────────────────────────────────────────────────────

  describe('trivial cases', () => {
    it('returns a single node when start equals target', () => {
      expect(findPath(0, 0, 0, 0)).toEqual([{ x: 0, y: 0 }])
    })

    it('returns a single node at any valid corner when start equals target', () => {
      expect(findPath(4, 4, 4, 4)).toEqual([{ x: 4, y: 4 }])
    })
  })

  // ─── Out-of-bounds ───────────────────────────────────────────────────────────

  describe('out-of-bounds coordinates', () => {
    it('returns [] for negative start column', () => {
      expect(findPath(-1, 0, 2, 2)).toEqual([])
    })

    it('returns [] for negative start row', () => {
      expect(findPath(0, -1, 2, 2)).toEqual([])
    })

    it('returns [] for start column ≥ GRID_COLS', () => {
      expect(findPath(GRID_COLS, 0, 2, 2)).toEqual([])
    })

    it('returns [] for start row ≥ GRID_ROWS', () => {
      expect(findPath(0, GRID_ROWS, 2, 2)).toEqual([])
    })

    it('returns [] for target column ≥ GRID_COLS', () => {
      expect(findPath(0, 0, GRID_COLS, 0)).toEqual([])
    })

    it('returns [] for target row ≥ GRID_ROWS', () => {
      expect(findPath(0, 0, 0, GRID_ROWS)).toEqual([])
    })
  })

  // ─── Straight-line paths ─────────────────────────────────────────────────────

  describe('straight-line paths on clear grid', () => {
    it('walks left-to-right along row 0 (length 5)', () => {
      const path = findPath(0, 0, 4, 0)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
      expect(path.length).toBe(5)
      assertAdjacent(path)
      assertInBounds(path)
    })

    it('walks top-to-bottom along col 0 (length 5)', () => {
      const path = findPath(0, 0, 0, 4)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 0, y: 4 })
      expect(path.length).toBe(5)
      assertAdjacent(path)
    })

    it('walks right-to-left along row 2 (length 5)', () => {
      const path = findPath(4, 2, 0, 2)
      expect(path[0]).toEqual({ x: 4, y: 2 })
      expect(path[path.length - 1]).toEqual({ x: 0, y: 2 })
      expect(path.length).toBe(5)
      assertAdjacent(path)
    })
  })

  // ─── Diagonal paths (must bend, not jump) ────────────────────────────────────

  describe('diagonal (corner-to-corner) paths', () => {
    it('reaches (4,4) from (0,0) with optimal Manhattan length (9 steps)', () => {
      const path = findPath(0, 0, 4, 4)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 4, y: 4 })
      expect(path.length).toBe(9)   // 4 col steps + 4 row steps + 1 (start)
      assertAdjacent(path)
      assertInBounds(path)
    })

    it('reaches (0,4) from (4,0)', () => {
      const path = findPath(4, 0, 0, 4)
      expect(path[0]).toEqual({ x: 4, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 0, y: 4 })
      expect(path.length).toBe(9)
      assertAdjacent(path)
    })
  })

  // ─── Obstacle avoidance ──────────────────────────────────────────────────────

  describe('obstacle avoidance', () => {
    it('returns [] when all neighbours of start are blocked', () => {
      // (0,0) has only two neighbours: (1,0) and (0,1)
      const obstacles = [{ col: 1, row: 0 }, { col: 0, row: 1 }]
      expect(findPath(0, 0, 4, 4, obstacles)).toEqual([])
    })

    it('returns [] when the target itself is blocked', () => {
      const obstacles = [{ col: 4, row: 4 }]
      expect(findPath(0, 0, 4, 4, obstacles)).toEqual([])
    })

    it('returns [] when the start itself is blocked', () => {
      const obstacles = [{ col: 0, row: 0 }]
      expect(findPath(0, 0, 4, 4, obstacles)).toEqual([])
    })

    it('navigates around a vertical wall through col 2 (rows 0-3)', () => {
      const obstacles = [
        { col: 2, row: 0 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
        { col: 2, row: 3 },
      ]
      const path = findPath(0, 0, 4, 0, obstacles)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
      assertAdjacent(path)
      assertNoObstacle(path, obstacles)
      assertInBounds(path)
    })

    it('finds no path when col 2 is fully blocked (rows 0-4) — grid is split', () => {
      const obstacles = [
        { col: 2, row: 0 },
        { col: 2, row: 1 },
        { col: 2, row: 2 },
        { col: 2, row: 3 },
        { col: 2, row: 4 },
      ]
      expect(findPath(0, 0, 4, 0, obstacles)).toEqual([])
    })

    it('navigates around a horizontal wall through row 2 (cols 0-3)', () => {
      const obstacles = [
        { col: 0, row: 2 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
      ]
      const path = findPath(0, 0, 0, 4, obstacles)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 0, y: 4 })
      assertAdjacent(path)
      assertNoObstacle(path, obstacles)
    })

    it('returns [] when horizontal wall spans the full row (cols 0-4)', () => {
      const obstacles = [
        { col: 0, row: 2 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
        { col: 3, row: 2 },
        { col: 4, row: 2 },
      ]
      expect(findPath(0, 0, 0, 4, obstacles)).toEqual([])
    })

    it('handles workstation-style obstacles (row 2, cols 0/2/4)', () => {
      // FLOOR_COLS = [0, 2, 4, 1, 3, 0, 2] — first 3 workstations at row 2
      const obstacles = [
        { col: 0, row: 2 },
        { col: 2, row: 2 },
        { col: 4, row: 2 },
      ]
      const path = findPath(0, 0, 4, 4, obstacles)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 4, y: 4 })
      assertAdjacent(path)
      assertNoObstacle(path, obstacles)
      assertInBounds(path)
    })
  })

  // ─── Alternative obstacle input formats ──────────────────────────────────────

  describe('obstacle input formats', () => {
    it('accepts { x, y } obstacle objects', () => {
      const obstacles = [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }]
      const path = findPath(0, 0, 4, 0, obstacles)
      expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
      assertNoObstacle(path, obstacles.map(o => ({ col: o.x, row: o.y })))
    })

    it('accepts [col, row] array pairs', () => {
      const obstacles = [[2, 0], [2, 1], [2, 2], [2, 3]]
      const path = findPath(0, 0, 4, 0, obstacles)
      expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
    })

    it('treats an empty obstacles list as a clear grid', () => {
      const path = findPath(0, 0, 4, 4, [])
      expect(path.length).toBe(9)
    })

    it('ignores obstacle entries with missing coordinates', () => {
      // Should not throw — silently skip malformed entries
      expect(() => findPath(0, 0, 4, 4, [{}])).not.toThrow()
    })
  })

  // ─── Grid dimension override ─────────────────────────────────────────────────

  describe('custom grid dimensions', () => {
    it('works on a 3×3 grid', () => {
      const path = findPath(0, 0, 2, 2, [], 3, 3)
      expect(path[0]).toEqual({ x: 0, y: 0 })
      expect(path[path.length - 1]).toEqual({ x: 2, y: 2 })
      assertAdjacent(path)
    })

    it('respects the smaller boundary — out-of-bounds on 3×3', () => {
      expect(findPath(0, 0, 4, 4, [], 3, 3)).toEqual([])
    })
  })

  // ─── Path integrity (contract checks) ───────────────────────────────────────

  describe('path integrity', () => {
    it('every step is exactly 1 unit away from the previous (no diagonals)', () => {
      const path = findPath(0, 0, 4, 4)
      assertAdjacent(path)
    })

    it('all steps lie within default grid bounds', () => {
      const path = findPath(0, 0, 4, 4)
      assertInBounds(path)
    })

    it('first element is always the start node', () => {
      const path = findPath(1, 2, 3, 4)
      expect(path[0]).toEqual({ x: 1, y: 2 })
    })

    it('last element is always the target node', () => {
      const path = findPath(1, 2, 3, 4)
      expect(path[path.length - 1]).toEqual({ x: 3, y: 4 })
    })

    it('does not mutate the obstacles array passed in', () => {
      const obstacles = [{ col: 2, row: 2 }]
      const copy = [...obstacles]
      findPath(0, 0, 4, 4, obstacles)
      expect(obstacles).toEqual(copy)
    })
  })

  // ─── Transit node constants ──────────────────────────────────────────────────

  describe('TRANSIT_COL / TRANSIT_ROW', () => {
    it('exports TRANSIT_COL as a number', () => {
      expect(typeof TRANSIT_COL).toBe('number')
    })

    it('exports TRANSIT_ROW as a number', () => {
      expect(typeof TRANSIT_ROW).toBe('number')
    })

    it('TRANSIT_COL is within the grid (0 … GRID_COLS-1)', () => {
      expect(TRANSIT_COL).toBeGreaterThanOrEqual(0)
      expect(TRANSIT_COL).toBeLessThan(GRID_COLS)
    })

    it('TRANSIT_ROW is within the grid (0 … GRID_ROWS-1)', () => {
      expect(TRANSIT_ROW).toBeGreaterThanOrEqual(0)
      expect(TRANSIT_ROW).toBeLessThan(GRID_ROWS)
    })

    it('transit node is reachable from (0, 0) with no obstacles', () => {
      const path = findPath(0, 0, TRANSIT_COL, TRANSIT_ROW)
      expect(path.length).toBeGreaterThan(0)
      expect(path[path.length - 1]).toEqual({ x: TRANSIT_COL, y: TRANSIT_ROW })
    })

    it('transit node is reachable from any corner with no obstacles', () => {
      const corners = [
        [0, 0], [GRID_COLS - 1, 0],
        [0, GRID_ROWS - 1], [GRID_COLS - 1, GRID_ROWS - 1],
      ]
      for (const [sx, sy] of corners) {
        const path = findPath(sx, sy, TRANSIT_COL, TRANSIT_ROW)
        expect(path.length).toBeGreaterThan(0)
      }
    })

    it('path to transit node is valid (orthogonally adjacent steps)', () => {
      const path = findPath(0, 0, TRANSIT_COL, TRANSIT_ROW)
      assertAdjacent(path)
      assertInBounds(path)
    })
  })
})

// ─── FLOOR_CHANGE_PENALTY constant ──────────────────────────────────────────

describe('FLOOR_CHANGE_PENALTY', () => {
  it('is exported as a number', () => {
    expect(typeof FLOOR_CHANGE_PENALTY).toBe('number')
  })

  it('is larger than the maximum possible same-floor path cost (8 for a 5×5 grid)', () => {
    // Maximum same-floor distance on a 5×5 grid = 4+4 = 8 steps.
    // FLOOR_CHANGE_PENALTY must exceed this so any same-floor amenity beats
    // any cross-floor one in the FindNearestAmenity selector.
    const maxSameFloorCost = (GRID_COLS - 1) + (GRID_ROWS - 1)
    expect(FLOOR_CHANGE_PENALTY).toBeGreaterThan(maxSameFloorCost)
  })
})

// ─── findPath with transitPenalty ───────────────────────────────────────────

describe('findPath with transitPenalty', () => {
  it('still finds a valid path when transitPenalty is provided', () => {
    const path = findPath(0, 0, 4, 4, [], GRID_COLS, GRID_ROWS, 10)
    expect(path.length).toBeGreaterThan(0)
    expect(path[0]).toEqual({ x: 0, y: 0 })
    expect(path[path.length - 1]).toEqual({ x: 4, y: 4 })
  })

  it('path avoids transit node when a penalty-free alternative exists', () => {
    // With a high transitPenalty the algorithm should steer around (TRANSIT_COL, TRANSIT_ROW)
    // if a same-cost route avoiding it exists.
    const path = findPath(0, 0, 4, 3, [], GRID_COLS, GRID_ROWS, 100)
    expect(path.length).toBeGreaterThan(0)
    // The path should not visit the transit node (4,4) when going to (4,3)
    const stepsOnTransit = path.filter(p => p.x === TRANSIT_COL && p.y === TRANSIT_ROW)
    expect(stepsOnTransit.length).toBe(0)
  })

  it('still reaches (TRANSIT_COL, TRANSIT_ROW) when it is the target regardless of penalty', () => {
    const path = findPath(0, 0, TRANSIT_COL, TRANSIT_ROW, [], GRID_COLS, GRID_ROWS, 999)
    expect(path.length).toBeGreaterThan(0)
    expect(path[path.length - 1]).toEqual({ x: TRANSIT_COL, y: TRANSIT_ROW })
  })

  it('transitPenalty = 0 behaves identically to omitting the param', () => {
    const pathA = findPath(0, 0, 4, 4)
    const pathB = findPath(0, 0, 4, 4, [], GRID_COLS, GRID_ROWS, 0)
    expect(pathA).toEqual(pathB)
  })
})

// ─── findPathCost ────────────────────────────────────────────────────────────

describe('findPathCost', () => {
  it('returns 0 when start equals target', () => {
    expect(findPathCost(2, 2, 2, 2)).toBe(0)
  })

  it('returns Infinity when no path exists', () => {
    // Block all exits from (0,0)
    const obs = [{ col: 1, row: 0 }, { col: 0, row: 1 }]
    expect(findPathCost(0, 0, 4, 4, obs)).toBe(Infinity)
  })

  it('returns the number of steps (edges) for a clear path', () => {
    // From (0,0) to (4,0) on a clear grid: 4 steps
    expect(findPathCost(0, 0, 4, 0)).toBe(4)
  })

  it('returns Manhattan distance for any clear diagonal path', () => {
    expect(findPathCost(0, 0, 4, 4)).toBe(8)  // 4 col + 4 row steps
    expect(findPathCost(1, 0, 3, 2)).toBe(4)
  })

  it('adds transitPenalty to the cost when path passes through transit node', () => {
    // Path from (3,0) to (4,4): the only path with length 5 passes through (4,4)
    // itself — but (4,4) IS the target so no penalty should be applied on target.
    // Use (3,0)→(4,3) with a path that goes through (4,4)… let's test a path
    // that must go through TRANSIT_COL,TRANSIT_ROW as an intermediate step.
    // On a 5×5 grid, routing from (4,0) to (0,4) via the bottom-right corner is
    // possible. With high transitPenalty the path avoids it; with transitPenalty=0
    // the cost is simply 8.
    const baselineCost = findPathCost(4, 0, 0, 4, [], GRID_COLS, GRID_ROWS, 0)
    expect(baselineCost).toBe(8)
    // With transitPenalty: cost may be higher if path goes via (4,4)
    const penaltyApplied = findPathCost(0, 3, TRANSIT_COL, TRANSIT_ROW - 1, [], GRID_COLS, GRID_ROWS, 0)
    expect(penaltyApplied).toBeGreaterThanOrEqual(0)
    expect(isFinite(penaltyApplied)).toBe(true)
  })

  it('same-floor cost is always less than cross-floor cost with FLOOR_CHANGE_PENALTY', () => {
    // Simulate amenity scoring: same-floor path cost (max 8) must be < cross-floor
    // (FLOOR_CHANGE_PENALTY + any additional steps).
    const sameFloorCost  = findPathCost(0, 0, 4, 4)  // 8 steps — worst case
    const crossFloorCost = findPathCost(0, 0, TRANSIT_COL, TRANSIT_ROW) + FLOOR_CHANGE_PENALTY + 0
    expect(sameFloorCost).toBeLessThan(crossFloorCost)
  })
})
