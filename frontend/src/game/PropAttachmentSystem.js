/**
 * PropAttachmentSystem.js
 *
 * Manages a single modular prop image (e.g. clipboard, crate) that follows a
 * character sprite's "anchor socket" every frame.
 *
 * Design constraints satisfied:
 *   ✔  Props are separate Phaser Image objects — never baked into the character
 *      spritesheet.
 *   ✔  Prop depth is kept one layer above the owning character sprite so it
 *      always renders in front without disrupting the Y-sort group.
 *   ✔  No changes to the core game-loop timing; the system's update() is driven
 *      by IsoTycoonScene.update() which already runs every frame.
 *
 * Usage (inside IsoTycoonScene):
 *
 *   // During workstation setup:
 *   const sys = new PropAttachmentSystem(this, 'prop_clipboard')
 *   sys.attach(characterSprite)
 *   runtime.propSystem = sys
 *
 *   // Every frame (inside scene update()):
 *   runtime.propSystem.update()
 *
 *   // When work starts / ends (inside _setWorkstationAnim):
 *   runtime.propSystem.setVisible(working)
 *
 *   // On scene shutdown:
 *   runtime.propSystem.destroy()
 */

import { getSocketOffset } from '../utils/PropSocketConfig.js'

export class PropAttachmentSystem {
  /**
   * @param {Phaser.Scene} scene          Scene that owns this system.
   * @param {string}       propTextureKey Texture key for the prop image.
   */
  constructor(scene, propTextureKey) {
    /** @private @type {Phaser.Scene} */
    this._scene = scene

    /** @private @type {Phaser.GameObjects.Sprite|null} Character sprite to track. */
    this._sprite = null

    /**
     * The prop image — a separate game object positioned each frame via update().
     * @private @type {Phaser.GameObjects.Image}
     */
    this._prop = scene.add
      .image(0, 0, propTextureKey)
      .setOrigin(0.5, 1)
      .setDepth(0)
      .setVisible(false)
      .setScale(0.8)
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * attach
   *
   * Binds a character sprite to this system.  After calling attach(), every
   * update() call will read the sprite's position and current animation frame
   * to compute the prop's world position via the socket registry.
   *
   * @param {Phaser.GameObjects.Sprite} characterSprite
   */
  attach(characterSprite) {
    this._sprite = characterSprite
  }

  /**
   * update
   *
   * Synchronises the prop's world position and depth with the character's
   * current socket offset.  Call once per frame from the scene's update().
   *
   * If the prop is hidden (setVisible(false)) or the character sprite is
   * inactive, the method returns immediately without touching any game objects.
   */
  update() {
    if (!this._sprite?.active) return
    if (!this._prop?.active)   return
    if (!this._prop.visible)   return

    const animKey    = this._sprite.anims?.currentAnim?.key ?? ''
    // currentFrame.index is the 0-based position within the animation sequence,
    // which is exactly what getSocketOffset() expects.
    const frameIndex = this._sprite.anims?.currentFrame?.index ?? 0

    const { dx, dy } = getSocketOffset(animKey, frameIndex)

    this._prop.setPosition(
      this._sprite.x + dx,
      this._sprite.y + dy,
    )

    // Render the prop one layer above its owning character to avoid z-fighting.
    this._prop.setDepth(this._sprite.depth + 1)
  }

  /**
   * setVisible
   *
   * Show or hide the prop.  Typically called when the workstation transitions
   * between working (prop visible) and idle (prop hidden) states.
   *
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._prop?.setVisible(visible)
  }

  /**
   * destroy
   *
   * Removes the prop image from the scene and releases all internal references.
   * Must be called on scene shutdown to prevent memory leaks.
   */
  destroy() {
    this._prop?.destroy()
    this._prop   = null
    this._sprite = null
  }
}
