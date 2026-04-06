/**
 * NpcSpeechBubble.js
 *
 * Phaser View-layer renderer for a procedural 9-slice NPC speech bubble.
 *
 * Design constraints satisfied:
 *   ✔  No fixed-size background images — the 9-slice panel is resized
 *      programmatically to fit measured text bounds.
 *   ✔  The bubble tail is a completely separate, unscaled Graphics object;
 *      it never distorts when the panel expands horizontally.
 *   ✔  Isometric world coordinates are projected to 2D screen space via
 *      NpcBubbleLayout.worldToScreen(), keeping the bubble anchored above the
 *      NPC's head even when the camera pans.
 *   ✔  All rendering logic lives strictly inside this View class — no game
 *      logic, no EconomyEngine calls.
 *
 * Usage (inside IsoTycoonScene):
 *
 *   // Create once per workstation that needs bubbles:
 *   const bubble = new NpcSpeechBubble(scene, { cornerSize: 14, tailH: 14 })
 *
 *   // Show a message above the NPC:
 *   bubble.show('Hello, world!', npcSprite.x, npcSprite.y, 80, camera.worldView)
 *
 *   // Optionally auto-hide after a duration (ms):
 *   bubble.show('Working hard!', x, y, 80, camera.worldView, 3000)
 *
 *   // Update every frame so the bubble tracks camera pans:
 *   bubble.update(npcSprite.x, npcSprite.y, camera.worldView)
 *
 *   // Hide and reset (before showing a new message or on shutdown):
 *   bubble.hide()
 *   bubble.destroy()
 */

import {
  computePanelSize,
  computeTailAnchor,
  worldToScreen,
  DEFAULT_BUBBLE_OPTIONS,
} from '../utils/NpcBubbleLayout.js'

// Shared font family constant — mirrors FONT_BUBBLE from IsoTycoonScene.
const FONT_NPC_BUBBLE = '"Fredoka One", "Patrick Hand", cursive'

// Depth offset above the owning sprite's depth so bubbles always appear in front.
const BUBBLE_DEPTH_ABOVE_SPRITE = 20

export class NpcSpeechBubble {
  /**
   * @param {Phaser.Scene}                       scene   – Owning Phaser scene.
   * @param {import('../utils/NpcBubbleLayout').BubbleLayoutOptions} [opts={}]
   */
  constructor(scene, opts = {}) {
    /** @private @type {Phaser.Scene} */
    this._scene = scene

    /** @private Layout options merged with defaults. */
    this._opts = { ...DEFAULT_BUBBLE_OPTIONS, ...opts }

    /** @private @type {Phaser.GameObjects.Container|null} */
    this._container = null

    /** @private @type {Phaser.GameObjects.NineSlice|null} */
    this._panel = null

    /** @private @type {Phaser.GameObjects.Graphics|null} Unscaled tail triangle. */
    this._tail = null

    /** @private @type {Phaser.GameObjects.Text|null} */
    this._textObj = null

    /** @private @type {Phaser.Time.TimerEvent|null} Auto-hide timer. */
    this._timer = null

    /** @private {number} Last known head offset (world px) for update(). */
    this._headOffsetY = 80

    /** @private {boolean} Whether the bubble is currently visible. */
    this._visible = false
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * show
   *
   * Measures the text, computes 9-slice panel dimensions (text-dictated),
   * positions the unscaled tail at the bottom edge of the panel, and places
   * the container above the NPC's head in screen space.
   *
   * Calling show() while already visible replaces the current message.
   *
   * @param {string}  message      – Text to display.
   * @param {number}  worldX       – NPC sprite world X.
   * @param {number}  worldY       – NPC sprite world Y (bottom of sprite).
   * @param {number}  headOffsetY  – World-px above sprite origin to float the bubble.
   * @param {{x:number,y:number}}  cameraView – camera.worldView
   * @param {number}  [duration=0] – Auto-hide after this many ms. 0 = manual hide.
   * @param {number}  [depth=500]  – Phaser depth for the container.
   */
  show(message, worldX, worldY, headOffsetY = 80, cameraView = { x: 0, y: 0 }, duration = 0, depth = 500) {
    // Clear any previous bubble and timer.
    this._clearTimer()
    this._destroyObjects()

    this._headOffsetY = headOffsetY
    this._visible     = true

    const { cornerSize, paddingH, paddingV, minPanelW, minPanelH, tailH, tailW } = this._opts

    // ── Probe text to measure actual rendered bounds ─────────────────────────
    // Text is created off-screen (x = -9999) so it is never briefly visible at
    // the wrong location.
    const maxTextW = Math.max(minPanelW - paddingH * 2, 20)
    const probe = this._scene.add.text(-9999, -9999, message, {
      fontFamily: FONT_NPC_BUBBLE,
      fontSize:   '13px',
      color:      '#111111',
      align:      'left',
      wordWrap:   { width: maxTextW, useAdvancedWrap: true },
    })
    // Reduce font size if text overflows maxTextW (mirrors _fitText logic)
    let fontSize = 13
    while (probe.width > maxTextW && fontSize > 8) {
      fontSize -= 2
      probe.setFontSize(fontSize)
    }
    const measuredW = probe.width
    const measuredH = probe.height
    probe.destroy()

    // ── 9-slice panel — text bounds dictate exact geometry ───────────────────
    const { panelW, panelH } = computePanelSize(measuredW, measuredH, this._opts)

    // ── Unscaled tail anchor ─────────────────────────────────────────────────
    const { x: tailLocalX, y: tailLocalY } = computeTailAnchor(panelW, panelH, this._opts)

    // ── Screen position ──────────────────────────────────────────────────────
    const { screenX, screenY } = worldToScreen(worldX, worldY, headOffsetY, cameraView)

    // Container top-left: centre panel over NPC, bottom of tail at screenY.
    const totalH    = panelH + tailH
    const containerX = screenX - panelW / 2
    const containerY = screenY - totalH

    // ── Build Phaser objects ─────────────────────────────────────────────────
    this._container = this._scene.add.container(containerX, containerY).setDepth(depth)

    // 9-slice panel — corners fixed at cornerSize px; centre stretches.
    this._panel = this._scene.add.nineslice(
      0, 0, 'bubble_panel', undefined,
      panelW, panelH,
      cornerSize, cornerSize, cornerSize, cornerSize,
    ).setOrigin(0, 0)
    this._container.add(this._panel)

    // Unscaled directional tail — separate Graphics, never scaled.
    // Origin is at the tip top-centre of the triangle (the attachment point).
    // The triangle points downward from (tailLocalX, tailLocalY).
    this._tail = this._scene.add.graphics()
    this._tail.fillStyle(0xffffff, 1)
    this._tail.fillTriangle(
      tailLocalX - tailW / 2, tailLocalY,       // left base
      tailLocalX,             tailLocalY + tailH, // tip (downward)
      tailLocalX + tailW / 2, tailLocalY,        // right base
    )
    this._tail.lineStyle(2, 0x111111, 1)
    this._tail.strokeTriangle(
      tailLocalX - tailW / 2, tailLocalY,
      tailLocalX,             tailLocalY + tailH,
      tailLocalX + tailW / 2, tailLocalY,
    )
    this._container.add(this._tail)

    // Body text — vertically centred inside the panel, left-padded.
    this._textObj = this._scene.add.text(paddingH, panelH / 2, message, {
      fontFamily: FONT_NPC_BUBBLE,
      fontSize:   `${fontSize}px`,
      color:      '#111111',
      align:      'left',
      wordWrap:   { width: maxTextW, useAdvancedWrap: true },
    }).setOrigin(0, 0.5)
    this._container.add(this._textObj)

    // ── Entrance fade-in tween ───────────────────────────────────────────────
    this._container.setAlpha(0)
    this._scene.tweens.add({
      targets:  this._container,
      alpha:    1,
      duration: 180,
      ease:     'Sine.easeOut',
    })

    // ── Optional auto-hide timer ─────────────────────────────────────────────
    if (duration > 0) {
      this._timer = this._scene.time.delayedCall(duration, () => this.hide())
    }
  }

  /**
   * update
   *
   * Repositions the container to keep the bubble anchored above the NPC's head
   * as the camera pans or the sprite moves.  Call this every frame from the
   * scene's update() while the bubble is visible.
   *
   * @param {number} worldX       – NPC sprite's current world X.
   * @param {number} worldY       – NPC sprite's current world Y.
   * @param {{x:number,y:number}} cameraView – camera.worldView
   */
  update(worldX, worldY, cameraView) {
    if (!this._visible || !this._container?.active || !this._panel?.active) return

    const panelW = this._panel.width
    const panelH = this._panel.height
    const { tailH } = this._opts
    const { screenX, screenY } = worldToScreen(worldX, worldY, this._headOffsetY, cameraView)

    const totalH     = (panelH ?? 0) + tailH
    const containerX = screenX - (panelW ?? 0) / 2
    const containerY = screenY - totalH

    this._container.setPosition(containerX, containerY)
  }

  /**
   * hide
   *
   * Fades out and destroys all Phaser objects.  Idempotent — safe to call
   * when already hidden.
   */
  hide() {
    if (!this._container?.active) {
      this._clearTimer()
      this._visible = false
      return
    }

    this._clearTimer()
    this._visible = false

    // Fade-out tween; destroy on complete.
    this._scene.tweens.add({
      targets:  this._container,
      alpha:    0,
      duration: 200,
      ease:     'Sine.easeIn',
      onComplete: () => this._destroyObjects(),
    })
  }

  /**
   * isVisible
   * @returns {boolean}
   */
  get isVisible() {
    return this._visible
  }

  /**
   * destroy
   *
   * Immediately removes all Phaser objects and cancels any running timer.
   * Must be called on scene shutdown to prevent memory leaks.
   */
  destroy() {
    this._clearTimer()
    this._destroyObjects()
    this._visible = false
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /** @private */
  _clearTimer() {
    if (this._timer) {
      this._timer.remove(false)
      this._timer = null
    }
  }

  /** @private */
  _destroyObjects() {
    // Destroy the container (which also destroys all children added via add())
    if (this._container?.active) {
      this._container.destroy()
    }
    this._container = null
    this._panel     = null
    this._tail      = null
    this._textObj   = null
  }
}
