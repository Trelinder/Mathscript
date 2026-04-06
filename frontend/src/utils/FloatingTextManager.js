/**
 * FloatingTextManager.js
 *
 * Lightweight floating-text feedback renderer for HTML5 canvas games.
 *
 * Creates a transparent overlay <canvas> that sits on top of the game canvas,
 * then drives an independent requestAnimationFrame loop to animate text objects
 * upward while fading them from opacity 1.0 → 0.0.  Once opacity reaches 0
 * the object is spliced out of the live list so it becomes garbage-collectable,
 * preventing unbounded memory growth.
 *
 * No external dependencies — pure DOM / Canvas 2D API only.
 * The loop is completely decoupled from the economy math thread; it only draws
 * what it already knows about and never reads or writes game state.
 *
 * ─── Coordinate system ────────────────────────────────────────────────────────
 * Coordinates passed to spawn() are in the overlay canvas's logical pixel space
 * (defaults to 800 × 600 to match a standard Phaser game).  The caller is
 * responsible for converting Phaser world coordinates to screen coordinates
 * before calling spawn():
 *
 *   const cam = scene.cameras.main
 *   const sx  = ws.screenX - cam.worldView.x
 *   const sy  = ws.screenY - cam.worldView.y - 20
 *   mgr.spawn('+$5.8K', sx, sy)
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *   import { FloatingTextManager } from './FloatingTextManager.js'
 *
 *   const mgr = new FloatingTextManager(
 *     document.getElementById('iso-game-container'),
 *   )
 *
 *   // On each floor:cycle event:
 *   mgr.spawn('+$5.8K', 320, 200)
 *
 *   // On scene shutdown:
 *   mgr.destroy()
 */

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_RISE_SPEED   = 60    // pixels per second (upward)
const DEFAULT_FADE_RATE    = 1.2   // opacity units per second → ~0.83 s lifetime
const DEFAULT_FONT         = 'bold 22px "Fredoka One", cursive'
const DEFAULT_COLOR        = '#4ade80'
const DEFAULT_STROKE       = '#065f46'
const DEFAULT_STROKE_WIDTH = 3
const DEFAULT_LOGICAL_W    = 800
const DEFAULT_LOGICAL_H    = 600

// Maximum delta-time cap (seconds) — prevents large jumps after tab blur/focus
const MAX_DT = 0.1

// ─── FloatingTextManager ──────────────────────────────────────────────────────

export class FloatingTextManager {
  /**
   * @param {HTMLElement} parentEl       - Container element to attach the
   *                                       overlay canvas to.  Should be the
   *                                       same parent as the game canvas.
   * @param {object}      [opts]
   * @param {number}      [opts.riseSpeed=60]      px/s upward drift.
   * @param {number}      [opts.fadeRate=1.2]       opacity decrease per second.
   * @param {string}      [opts.font]               CSS font string.
   * @param {string}      [opts.color]              Text fill colour.
   * @param {string}      [opts.stroke]             Text stroke colour.
   * @param {number}      [opts.strokeWidth=3]      Stroke thickness in px.
   * @param {number}      [opts.logicalWidth=800]   Overlay canvas logical width.
   * @param {number}      [opts.logicalHeight=600]  Overlay canvas logical height.
   */
  constructor(parentEl, opts = {}) {
    this._riseSpeed   = opts.riseSpeed   ?? DEFAULT_RISE_SPEED
    this._fadeRate    = opts.fadeRate    ?? DEFAULT_FADE_RATE
    this._font        = opts.font        ?? DEFAULT_FONT
    this._color       = opts.color       ?? DEFAULT_COLOR
    this._stroke      = opts.stroke      ?? DEFAULT_STROKE
    this._strokeWidth = opts.strokeWidth ?? DEFAULT_STROKE_WIDTH
    // Maximum dt cap in seconds — override in tests to bypass frame-jump guard
    this._maxDt       = opts.maxDt       ?? MAX_DT

    const logicalW = opts.logicalWidth  ?? DEFAULT_LOGICAL_W
    const logicalH = opts.logicalHeight ?? DEFAULT_LOGICAL_H

    /** @type {Array<{text:string, x:number, y:number, opacity:number}>} */
    this._items     = []
    this._rafId     = null
    this._lastTime  = null
    this._destroyed = false

    // ── Create the overlay canvas ──────────────────────────────────────────
    this._canvas        = document.createElement('canvas')
    this._canvas.width  = logicalW
    this._canvas.height = logicalH
    Object.assign(this._canvas.style, {
      position:      'absolute',
      top:           '0',
      left:          '0',
      width:         '100%',
      height:        '100%',
      pointerEvents: 'none',   // pass-through: clicks reach the game canvas
    })

    this._ctx = this._canvas.getContext('2d')

    // Ensure the parent is a positioning context so our absolute canvas
    // is contained within it rather than escaping to the nearest ancestor.
    const position = getComputedStyle(parentEl).position
    if (position === 'static') {
      parentEl.style.position = 'relative'
    }

    parentEl.appendChild(this._canvas)

    // Start the animation loop immediately (cheap no-op when _items is empty)
    this._rafId = requestAnimationFrame(ts => this._tick(ts))
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Spawn a floating text label at the given logical canvas coordinates.
   *
   * @param {string} text - Pre-formatted label (e.g. '+$5.8K').
   * @param {number} x    - Horizontal centre of the text in canvas pixels.
   * @param {number} y    - Vertical baseline of the text in canvas pixels.
   */
  spawn(text, x, y) {
    if (this._destroyed) return
    this._items.push({ text, x, y: +y, opacity: 1.0 })
  }

  /**
   * Number of text objects currently alive (visible on screen).
   * Useful for assertions in tests.
   * @returns {number}
   */
  get activeCount() {
    return this._items.length
  }

  /**
   * Stop the animation loop and remove the overlay canvas from the DOM.
   * Must be called when the game scene shuts down to prevent memory leaks.
   */
  destroy() {
    if (this._destroyed) return
    this._destroyed = true

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }

    this._canvas.parentElement?.removeChild(this._canvas)
    this._items = []
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  /**
   * requestAnimationFrame callback — update positions/opacities, purge dead
   * items, redraw, then schedule the next frame.
   *
   * @param {number} timestamp - DOMHighResTimeStamp from rAF.
   */
  _tick(timestamp) {
    if (this._destroyed) return

    // Delta-time in seconds, capped to avoid large jumps after tab-switch
    const dt = this._lastTime === null
      ? 0
      : Math.min((timestamp - this._lastTime) / 1000, this._maxDt)
    this._lastTime = timestamp

    // Update all live items; iterate in reverse so splice() indices stay valid
    for (let i = this._items.length - 1; i >= 0; i--) {
      const item = this._items[i]
      item.y       -= this._riseSpeed * dt
      item.opacity -= this._fadeRate  * dt

      if (item.opacity <= 0) {
        // Opacity exhausted — remove from array so the object can be GC'd
        this._items.splice(i, 1)
      }
    }

    this._draw()

    // Schedule the next frame
    this._rafId = requestAnimationFrame(ts => this._tick(ts))
  }

  /**
   * Clear the overlay canvas and redraw all live text objects at their
   * current positions and opacities.
   */
  _draw() {
    const ctx = this._ctx
    // ctx may be null in non-browser environments (SSR, tests with jsdom)
    if (!ctx) return

    // Full clear every frame — canvas is transparent so the game shows through
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height)

    if (this._items.length === 0) return

    ctx.font        = this._font
    ctx.textAlign   = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineWidth   = this._strokeWidth

    for (const item of this._items) {
      ctx.globalAlpha = Math.max(0, item.opacity)

      // Draw stroke first (behind fill) for legibility over bright backgrounds
      ctx.strokeStyle = this._stroke
      ctx.strokeText(item.text, item.x, item.y)

      ctx.fillStyle = this._color
      ctx.fillText(item.text, item.x, item.y)
    }

    // Reset globalAlpha so later canvas operations aren't affected
    ctx.globalAlpha = 1
  }
}
