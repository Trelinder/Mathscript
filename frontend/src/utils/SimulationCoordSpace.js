/**
 * SimulationCoordSpace.js — Viewport-independent coordinate contract.
 *
 * All simulation layout is expressed in *normalised* 0–1 space so that
 * neither the economy logic (React) nor the pathfinding engine ever needs
 * to know the canvas pixel dimensions.
 *
 * Rendering code (IsoTycoonScene, PlayScene) calls `simToCanvas` once at
 * scene-creation time to derive pixel positions from the then-current
 * canvas size.  React UI calls `canvasNormToViewport` to map a normalised
 * position back into a CSS viewport coordinate for overlay anchoring.
 *
 * Normalised values were derived from the original 800×450 reference canvas:
 *   normX = pixelX / 800   (GAME_WIDTH)
 *   normY = pixelY / 450   (GAME_HEIGHT)
 */

// ─── Canonical reference canvas dimensions ────────────────────────────────────
export const SIM_CANVAS_WIDTH  = 800
export const SIM_CANVAS_HEIGHT = 450

// ─── Floor vertical origins (normalised 0–1, centre of each floor's room) ─────
//
//  Each entry is { normX, normY } in the [0, 1] × [0, 1] canvas space.
//  normX is always 0.5 (horizontal centre).
//  normY values are derived from the original absolute pixel origins divided
//  by SIM_CANVAS_HEIGHT (450).
//
//  Floor 1 is the ground floor (highest normY = lowest on screen).
//  Floor 7 is the penthouse  (lowest  normY = highest on screen).
//
export const SIM_FLOOR_ORIGINS = {
  1: { normX: 0.5, normY: 320 / SIM_CANVAS_HEIGHT },  // ≈ 0.7111
  2: { normX: 0.5, normY: 248 / SIM_CANVAS_HEIGHT },  // ≈ 0.5511
  3: { normX: 0.5, normY: 176 / SIM_CANVAS_HEIGHT },  // ≈ 0.3911
  4: { normX: 0.5, normY: 140 / SIM_CANVAS_HEIGHT },  // ≈ 0.3111
  5: { normX: 0.5, normY: 112 / SIM_CANVAS_HEIGHT },  // ≈ 0.2489
  6: { normX: 0.5, normY:  84 / SIM_CANVAS_HEIGHT },  // ≈ 0.1867
  7: { normX: 0.5, normY:  56 / SIM_CANVAS_HEIGHT },  // ≈ 0.1244
}

// ─── Infrastructure basement origin (normalised) ─────────────────────────────
//
//  The three infrastructure rooms (Power, Server, HR) sit on a basement row
//  directly below floor 1.  Their shared isometric origin is:
//    pixel x = 336  (= SIM_FLOOR_ORIGINS[1].x - 2×(TILE_W/2), TILE_W = 64)
//    pixel y = 375  (= floor-1 pixel y + 55)
//
export const SIM_INFRA_ORIG = {
  normX: 336 / SIM_CANVAS_WIDTH,   // ≈ 0.42
  normY: 375 / SIM_CANVAS_HEIGHT,  // ≈ 0.8333
}

// ─── Pure conversion helpers ──────────────────────────────────────────────────

/**
 * Convert a normalised (0–1) simulation coordinate into canvas pixels.
 *
 * This is the single function that all rendering code should call.
 * No Phaser import required — pure arithmetic.
 *
 * @param {number} normX   - Normalised x (0 = left edge, 1 = right edge)
 * @param {number} normY   - Normalised y (0 = top edge,  1 = bottom edge)
 * @param {number} canvasW - Current canvas width  in pixels
 * @param {number} canvasH - Current canvas height in pixels
 * @returns {{ x: number, y: number }}
 */
export function simToCanvas(normX, normY, canvasW, canvasH) {
  return {
    x: normX * canvasW,
    y: normY * canvasH,
  }
}

/**
 * Convert a normalised (0–1) simulation coordinate into a CSS viewport
 * position (pixels from the document origin) suitable for `position:fixed`
 * or `position:absolute` React overlay elements.
 *
 * @param {number} normX       - Normalised x within the Phaser canvas
 * @param {number} normY       - Normalised y within the Phaser canvas
 * @param {DOMRect} canvasRect - `getBoundingClientRect()` of the canvas element
 * @returns {{ left: number, top: number }}
 */
export function canvasNormToViewport(normX, normY, canvasRect) {
  return {
    left: Math.round(canvasRect.left + normX * canvasRect.width),
    top:  Math.round(canvasRect.top  + normY * canvasRect.height),
  }
}

/**
 * Build a floor-coordinates map in canvas pixels from the normalised origins.
 *
 * Returns an object keyed by floor number (1–7) where each value is
 * `{ x, y }` in canvas pixel space.  Call this once at scene-create time.
 *
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Record<number, {x: number, y: number}>}
 */
export function buildFloorCoords(canvasW, canvasH) {
  const result = {}
  for (const [floor, { normX, normY }] of Object.entries(SIM_FLOOR_ORIGINS)) {
    result[Number(floor)] = simToCanvas(normX, normY, canvasW, canvasH)
  }
  return result
}

/**
 * Build the infrastructure-room positions in canvas pixels.
 *
 * Returns `{ origX, origY }` — the shared isometric origin for the basement
 * row.  Individual room offsets use the tile grid constants (TILE_W, TILE_H)
 * and are applied in the caller.
 *
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {{ origX: number, origY: number }}
 */
export function buildInfraOrig(canvasW, canvasH) {
  const { x, y } = simToCanvas(SIM_INFRA_ORIG.normX, SIM_INFRA_ORIG.normY, canvasW, canvasH)
  return { origX: x, origY: y }
}
