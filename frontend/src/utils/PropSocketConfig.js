/**
 * PropSocketConfig.js
 *
 * Defines the "anchor socket" data structure and registry used by the dynamic
 * prop attachment system.
 *
 * An AnchorSocket stores per-frame (dx, dy) offsets in pixels, measured from
 * the character sprite's origin point (bottom-centre for hero_iso sprites with
 * setOrigin(0.5, 1)).  Adding (dx, dy) to the sprite's world position gives the
 * exact screen position where a held prop should be drawn.
 *
 * ─── Lookup priority ────────────────────────────────────────────────────────
 *
 *   1. Exact animation key   – override for a specific animation, e.g.
 *                              'spell-lab_work' (future per-workstation tuning).
 *   2. Suffix group fallback – any key ending in '_work' → PROP_SOCKETS.default_work
 *                              any key ending in '_idle' → PROP_SOCKETS.default_idle
 *   3. Global fallback       – { dx: 0, dy: 0 } (prop sits at sprite origin).
 *
 * ─── Coordinate convention ──────────────────────────────────────────────────
 *
 *   Origin = sprite bottom-centre (setOrigin 0.5, 1).
 *   +x → right on screen, +y → down on screen.
 *   The hero_iso sprite is 48 px wide × 64 px tall per frame.
 *   Hand area in the "work" (arms-raised) frames sits approximately:
 *     dx ≈ ±10 px (horizontal arm spread)
 *     dy ≈ −36 px (two-thirds of sprite height above the feet)
 */

// ─── Type definition ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} AnchorSocket
 * @property {number} dx  Horizontal pixel offset from the sprite's origin.
 * @property {number} dy  Vertical pixel offset from the sprite's origin.
 */

// ─── Socket registry ──────────────────────────────────────────────────────────

/**
 * PROP_SOCKETS
 *
 * Registry mapping animation group keys to arrays of per-frame AnchorSocket
 * offsets.  Array indices are 0-based positions within the named animation
 * (NOT absolute spritesheet frame numbers).
 *
 * To add a per-workstation override, add an entry keyed by the exact Phaser
 * animation key (e.g. 'spell-lab_work') alongside the default groups.
 *
 * @type {Object.<string, AnchorSocket[]>}
 */
export const PROP_SOCKETS = {
  /**
   * Default "work" group — 4 frames matching the hero_iso work cycle
   * (arms raised, reaching forward in alternating strokes).
   * The clipboard/box prop is positioned near the character's front hand.
   */
  default_work: [
    { dx:  10, dy: -36 },   // frame 0 — arms extended forward
    { dx:  12, dy: -34 },   // frame 1 — mid-stroke, hands slightly lower
    { dx:  10, dy: -36 },   // frame 2 — arms extended (mirror of frame 0)
    { dx:   8, dy: -34 },   // frame 3 — mid-stroke (mirror of frame 1)
  ],

  /**
   * Default "idle" group — 4 frames matching the hero_iso idle bob.
   * Visibility is normally toggled off during idle via setVisible(false);
   * these offsets are a safe centred fallback in the rare case the prop is
   * shown while idle (e.g. a "carrying" state before the work animation starts).
   */
  default_idle: [
    { dx: 0, dy: -48 },
    { dx: 0, dy: -48 },
    { dx: 0, dy: -48 },
    { dx: 0, dy: -48 },
  ],
}

/** @type {AnchorSocket} Returned when no socket data exists for the given key/frame. */
const ZERO_SOCKET = Object.freeze({ dx: 0, dy: 0 })

// ─── Public helper ────────────────────────────────────────────────────────────

/**
 * getSocketOffset
 *
 * Resolves the (dx, dy) pixel offset for a character sprite that is currently
 * playing `animKey` at `frameIndex` within that animation.
 *
 * @param {string} animKey    The Phaser animation key currently playing.
 * @param {number} frameIndex 0-based index of the current frame within the
 *                            animation (NOT the absolute spritesheet index).
 * @returns {AnchorSocket}
 */
export function getSocketOffset(animKey, frameIndex) {
  // 1. Exact key override (e.g. a future per-workstation fine-tune entry)
  const exact = PROP_SOCKETS[animKey]
  if (exact && exact.length > 0) {
    return exact[frameIndex % exact.length] ?? ZERO_SOCKET
  }

  // 2. Suffix-based group fallback
  if (animKey.endsWith('_work')) {
    const group = PROP_SOCKETS.default_work
    return group[frameIndex % group.length] ?? ZERO_SOCKET
  }
  if (animKey.endsWith('_idle')) {
    const group = PROP_SOCKETS.default_idle
    return group[frameIndex % group.length] ?? ZERO_SOCKET
  }

  // 3. Global fallback — no socket data for this animation type
  return ZERO_SOCKET
}
