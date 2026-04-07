/**
 * NpcBubbleLayout.js
 *
 * Pure layout engine for the procedural 9-slice NPC speech-bubble system.
 * Contains zero Phaser imports — all functions operate on plain numbers and
 * plain objects so they can be unit-tested in jsdom without a Phaser instance.
 *
 * ─── Three responsibilities ──────────────────────────────────────────────────
 *
 *  1. computePanelSize(textWidth, textHeight, options)
 *     → Given measured text bounds, returns the exact (panelW, panelH) the
 *       9-slice panel must be set to.  Corner slices are NEVER scaled; the
 *       edge/centre regions stretch to fill.
 *
 *  2. computeTailAnchor(panelW, panelH, options)
 *     → Returns the (x, y) origin at which the unscaled tail sprite should
 *       be placed, relative to the speech-bubble container's top-left corner.
 *       The tail always attaches to the bottom edge of the panel so it moves
 *       with the bubble without distorting.
 *
 *  3. worldToScreen(worldX, worldY, headOffsetY, camera)
 *     → Projects an NPC's isometric world position to canvas screen space and
 *       applies a vertical offset so the bubble floats above the character's
 *       head.  Compatible with Phaser's camera worldView API.
 *
 * ─── 9-slice corner constraint ───────────────────────────────────────────────
 *
 *  The bubble_panel texture is 64 × 64 px, corner radius 14 px.  The four
 *  corner slices are each 14 × 14 px.  The panel must therefore be at least
 *  2 × cornerSize in both dimensions so corners never overlap.
 *
 *  Minimum panel width  = 2 × cornerSize  +  minimum centre gap (1 px)
 *  Minimum panel height = 2 × cornerSize  +  minimum centre gap (1 px)
 */

// ─── Default layout options ───────────────────────────────────────────────────

/**
 * @typedef {Object} BubbleLayoutOptions
 * @property {number} [paddingH=16]       Horizontal padding between text and panel edge (px).
 * @property {number} [paddingV=12]       Vertical padding between text and panel edge (px).
 * @property {number} [cornerSize=14]     The 9-slice corner slice size (px).
 *                                        Must match the four border values passed to
 *                                        scene.add.nineslice().
 * @property {number} [minPanelW=80]      Minimum panel width (px).
 * @property {number} [minPanelH=44]      Minimum panel height (px).
 * @property {number} [tailH=14]          Height of the downward-pointing tail triangle (px).
 * @property {number} [tailW=16]          Base width of the tail triangle (px).
 * @property {'bottom-centre'|'bottom-left'|'bottom-right'} [tailPosition='bottom-centre']
 *                                        Where the tail attaches on the bottom edge.
 * @property {number} [tailInset=20]      Horizontal inset from the edge when using
 *                                        'bottom-left' or 'bottom-right'.
 */

/** @type {Required<BubbleLayoutOptions>} */
export const DEFAULT_BUBBLE_OPTIONS = Object.freeze({
  paddingH:      16,
  paddingV:      12,
  cornerSize:    14,
  minPanelW:     80,
  minPanelH:     44,
  tailH:         14,
  tailW:         16,
  tailPosition:  'bottom-centre',
  tailInset:     20,
  // ── Portrait column ──────────────────────────────────────────────────────
  // When portraitW > 0 the panel reserves a fixed-width column on the left
  // for a character portrait image.  All layout calculations account for this
  // column automatically.  Set portraitW to 0 (the default) for text-only
  // bubbles so no existing code path is affected.
  portraitW:     0,    // portrait display width  (px); 0 = no portrait
  portraitH:     40,   // portrait display height (px)
  portraitGap:   8,    // gap between portrait right edge and text left edge (px)
})

// ─── 1. Panel sizing ──────────────────────────────────────────────────────────

/**
 * computePanelSize
 *
 * Calculates the width and height the 9-slice panel must be set to so that
 * the text content fits with the requested padding.  The 9-slice corner
 * segments are never scaled; only the edge and centre regions stretch.
 *
 * Minimum dimensions are enforced so corners never overlap, which would break
 * the 9-slice illusion.
 *
 * @param {number} textWidth   – Measured rendered width of the text object (px).
 * @param {number} textHeight  – Measured rendered height of the text object (px).
 * @param {Partial<BubbleLayoutOptions>} [opts={}]
 * @returns {{ panelW: number, panelH: number }}
 */
export function computePanelSize(textWidth, textHeight, opts = {}) {
  const { paddingH, paddingV, cornerSize, minPanelW, minPanelH, portraitW, portraitGap } = {
    ...DEFAULT_BUBBLE_OPTIONS,
    ...opts,
  }

  // Strictly positive text dimensions (guard against unmeasured/hidden text)
  const safeW = Math.max(0, textWidth)
  const safeH = Math.max(0, textHeight)

  // When a portrait column is present, reserve its full width (portrait + gap)
  // to the left of the text.  This expands the raw panel width proportionally.
  const portraitBlock = portraitW > 0 ? (portraitW + portraitGap) : 0

  // Raw desired size = text bounds + symmetric padding + optional portrait column
  const rawW = safeW + paddingH * 2 + portraitBlock
  const rawH = safeH + paddingV * 2

  // Hard minimum: corners must not overlap (2 * cornerSize + 1 gap each axis)
  const cornerMin = cornerSize * 2 + 1

  const panelW = Math.ceil(Math.max(rawW, minPanelW, cornerMin))
  const panelH = Math.ceil(Math.max(rawH, minPanelH, cornerMin))

  return { panelW, panelH }
}

// ─── 2. Tail anchor ───────────────────────────────────────────────────────────

/**
 * computeTailAnchor
 *
 * Returns the (x, y) position at which the tail sprite's top-centre origin
 * should be placed, in container-local space (relative to the bubble
 * container's top-left corner).
 *
 * The tail is rendered as a completely separate, **unscaled** sprite so it
 * never distorts when the panel expands horizontally.  Its top edge is always
 * flush with the bottom edge of the panel (y = panelH), and its horizontal
 * position depends on `opts.tailPosition`.
 *
 * The returned (x, y) is suitable for use as the position of a Phaser
 * Graphics / Image whose origin is set to (0.5, 0) — top-centre.
 *
 * @param {number} panelW    – Final 9-slice panel width (px).
 * @param {number} panelH    – Final 9-slice panel height (px).
 * @param {Partial<BubbleLayoutOptions>} [opts={}]
 * @returns {{ x: number, y: number }}
 */
export function computeTailAnchor(panelW, panelH, opts = {}) {
  const { tailPosition, tailInset } = { ...DEFAULT_BUBBLE_OPTIONS, ...opts }

  let x
  switch (tailPosition) {
    case 'bottom-left':
      x = tailInset
      break
    case 'bottom-right':
      x = panelW - tailInset
      break
    case 'bottom-centre':
    default:
      x = panelW / 2
      break
  }

  // Tail attaches flush with the panel's bottom edge — never overlaps the panel.
  return { x, y: panelH }
}

// ─── 3. Portrait column offsets ───────────────────────────────────────────────

/**
 * computePortraitOffsets
 *
 * Returns the container-local position for the portrait Image and the
 * adjusted text X offset that places the text to the right of the portrait.
 *
 * Both values are relative to the bubble container's top-left corner.
 *
 * The portrait is inset from the panel's left edge by `paddingH` (matching
 * the existing text left-padding) and vertically centred inside the panel.
 *
 * @param {number} panelH  – Final 9-slice panel height (px).
 * @param {Partial<BubbleLayoutOptions>} [opts={}]
 * @returns {{ portraitLocalX: number, portraitLocalY: number, textLocalX: number }}
 */
export function computePortraitOffsets(panelH, opts = {}) {
  const { paddingH, portraitW, portraitH, portraitGap } = {
    ...DEFAULT_BUBBLE_OPTIONS,
    ...opts,
  }

  // Portrait is flush with the left padding — mirrors the text left-padding position.
  const portraitLocalX = paddingH

  // Vertically centre the portrait inside the panel.
  const portraitLocalY = Math.round((panelH - portraitH) / 2)

  // Text starts immediately after the portrait column ends.
  const textLocalX = paddingH + portraitW + portraitGap

  return { portraitLocalX, portraitLocalY, textLocalX }
}

// ─── 4. Isometric world → screen projection ───────────────────────────────────

/**
 * @typedef {Object} CameraWorldView
 * @property {number} x     – Left edge of the camera viewport in world pixels (= scrollX).
 * @property {number} y     – Top edge of the camera viewport in world pixels (= scrollY).
 * @property {number} [zoom=1] – Camera zoom factor.  Pass `camera.zoom` from the Phaser
 *                               camera object so the bubble stays anchored at any zoom level.
 *                               Defaults to 1 (no zoom) for backwards compatibility.
 */

/**
 * worldToScreen
 *
 * Projects an NPC's isometric world position (the sprite's world x/y) to the
 * 2D canvas screen coordinate so the speech bubble can be anchored above the
 * character's head.
 *
 * The `headOffsetY` parameter is subtracted from the world Y before the
 * camera transform so the bubble floats the correct distance above the head
 * in world space (not screen space), preserving the feel of world attachment
 * as the camera pans and zooms.
 *
 * Compatible with Phaser's `camera.worldView` ({ x, y, width, height }) extended
 * with an optional `zoom` field, e.g.:
 *   `{ ...camera.worldView, zoom: camera.zoom }`
 *
 * @param {number} worldX          – NPC sprite's world X position.
 * @param {number} worldY          – NPC sprite's world Y position (bottom of sprite).
 * @param {number} headOffsetY     – How many world pixels above the sprite origin
 *                                   the bubble should float (positive = upward).
 * @param {CameraWorldView} camera – Camera descriptor ({ x, y, zoom? }).
 * @returns {{ screenX: number, screenY: number }}
 */
export function worldToScreen(worldX, worldY, headOffsetY, camera) {
  const zoom    = camera?.zoom ?? 1
  const scrollX = camera?.x   ?? 0
  const scrollY = camera?.y   ?? 0
  const screenX = (worldX - scrollX) * zoom
  const screenY = ((worldY - headOffsetY) - scrollY) * zoom
  return { screenX, screenY }
}

// ─── 5. Complete layout — convenience wrapper ─────────────────────────────────

/**
 * @typedef {Object} BubbleLayout
 * @property {number} panelW          – 9-slice panel width (px).
 * @property {number} panelH          – 9-slice panel height (px).
 * @property {number} tailX           – Tail x in container-local space.
 * @property {number} tailY           – Tail y in container-local space (= panelH).
 * @property {number} textOffsetX     – Text x relative to container top-left (portrait-adjusted).
 * @property {number} textOffsetY     – Text y relative to container top-left.
 * @property {number} containerX      – Container's canvas X (top-left of panel).
 * @property {number} containerY      – Container's canvas Y (top-left of panel).
 * @property {number} portraitLocalX  – Portrait image x in container-local space.
 * @property {number} portraitLocalY  – Portrait image y in container-local space.
 */

/**
 * computeBubbleLayout
 *
 * One-shot convenience function that calls computePanelSize, computeTailAnchor,
 * and worldToScreen in sequence and returns a complete layout descriptor that
 * the View layer can use directly to position every element.
 *
 * The container's top-left is placed so the **bottom edge** of the complete
 * bubble (panel + tail) sits at `screenY` — i.e. the bubble grows upward from
 * the anchor point, which is the character's head position.
 *
 * @param {number} textWidth          – Measured text width (px).
 * @param {number} textHeight         – Measured text height (px).
 * @param {number} worldX             – NPC sprite world X.
 * @param {number} worldY             – NPC sprite world Y (bottom of sprite).
 * @param {number} headOffsetY        – World-space upward offset to clear the head.
 * @param {CameraWorldView} camera    – Camera worldView.
 * @param {Partial<BubbleLayoutOptions>} [opts={}]
 * @returns {BubbleLayout}
 */
export function computeBubbleLayout(textWidth, textHeight, worldX, worldY, headOffsetY, camera, opts = {}) {
  const merged = { ...DEFAULT_BUBBLE_OPTIONS, ...opts }

  const { panelW, panelH } = computePanelSize(textWidth, textHeight, merged)
  const { x: tailX, y: tailY } = computeTailAnchor(panelW, panelH, merged)
  const { screenX, screenY } = worldToScreen(worldX, worldY, headOffsetY, camera)

  // Container top-left: centre the panel horizontally over the NPC,
  // and position it so the bottom of the tail (panelH + tailH) sits at screenY.
  const totalH = panelH + merged.tailH
  const containerX = screenX - panelW / 2
  const containerY = screenY - totalH

  // Text offset: when a portrait is present, text starts after the portrait
  // column; otherwise it starts at the standard left padding.
  const hasPortrait = (merged.portraitW ?? 0) > 0
  const { portraitLocalX, portraitLocalY, textLocalX } = hasPortrait
    ? computePortraitOffsets(panelH, merged)
    : { portraitLocalX: 0, portraitLocalY: 0, textLocalX: merged.paddingH }

  const textOffsetX = textLocalX
  const textOffsetY = panelH / 2

  return {
    panelW,
    panelH,
    tailX,
    tailY,
    textOffsetX,
    textOffsetY,
    containerX,
    containerY,
    portraitLocalX,
    portraitLocalY,
  }
}
