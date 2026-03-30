import * as Phaser from 'phaser'

/**
 * PreloadScene
 *
 * Displays a colorful loading bar while assets load, then hands off to
 * PlayScene.  All visual assets in this game are created programmatically
 * (using Phaser's Graphics API) so no external image files are required.
 * When you want to swap in real artwork, replace the generateTextures() calls
 * with this.load.image() / this.load.spritesheet() calls in preload() and
 * remove the corresponding generateTextures() call from create().
 */
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // preload – kick off any real file loads here.
  // Right now everything is procedural, so this is only needed to trigger the
  // Phaser load-progress events that drive the progress bar.
  // ─────────────────────────────────────────────────────────────────────────
  preload() {
    const { width, height } = this.scale

    // ── Background ──────────────────────────────────────────────────────────
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x0a0e1a, 0x0a0e1a, 0x111827, 0x111827, 1)
    bg.fillRect(0, 0, width, height)

    // ── Title text ──────────────────────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.25, 'IDLE MATH TYCOON', {
        fontFamily: '"Orbitron", monospace',
        fontSize: `${Math.round(height * 0.07)}px`,
        color: '#7c3aed',
        stroke: '#4c1d95',
        strokeThickness: 4,
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height * 0.37, 'Loading…', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: `${Math.round(height * 0.04)}px`,
        color: '#94a3b8',
      })
      .setOrigin(0.5)

    // ── Progress bar container ───────────────────────────────────────────────
    const barW = width * 0.6
    const barH = height * 0.04
    const barX = (width - barW) / 2
    const barY = height * 0.5

    // Outer border
    const border = this.add.graphics()
    border.lineStyle(2, 0x7c3aed, 1)
    border.strokeRect(barX - 2, barY - 2, barW + 4, barH + 4)

    // Dark fill background
    const barBg = this.add.graphics()
    barBg.fillStyle(0x1e1b4b, 1)
    barBg.fillRect(barX, barY, barW, barH)

    // Animated fill bar
    const barFill = this.add.graphics()

    // ── Wire up the Phaser loader events ────────────────────────────────────
    this.load.on('progress', (value) => {
      barFill.clear()
      barFill.fillStyle(0x7c3aed, 1)
      barFill.fillRect(barX, barY, barW * value, barH)

      // Glowing leading edge
      barFill.fillStyle(0xc4b5fd, 0.8)
      barFill.fillRect(barX + barW * value - 4, barY, 4, barH)
    })

    this.load.on('complete', () => {
      barFill.clear()
      barFill.fillStyle(0x7c3aed, 1)
      barFill.fillRect(barX, barY, barW, barH)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // create – generate all programmatic textures, then start PlayScene.
  // ─────────────────────────────────────────────────────────────────────────
  create() {
    this.generateTextures()

    // Short delay so the player can see the completed bar before the game starts
    this.time.delayedCall(400, () => {
      this.scene.start('PlayScene')
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // generateTextures
  //
  // All assets are drawn with Phaser's Graphics API and then saved as
  // reusable textures.  To swap in real sprites just:
  //   1. Add a this.load.image() call in preload()
  //   2. Delete the corresponding block below
  // ─────────────────────────────────────────────────────────────────────────
  generateTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    // ── machine-bg  (96 × 80): rounded dark panel used as each machine body ─
    g.clear()
    g.fillStyle(0x1e293b, 1)
    g.fillRoundedRect(0, 0, 96, 80, 10)
    g.lineStyle(2, 0x334155, 1)
    g.strokeRoundedRect(0, 0, 96, 80, 10)
    g.generateTexture('machine-bg', 96, 80)

    // ── machine-active (96 × 80): bright border when clicked ─────────────────
    g.clear()
    g.fillStyle(0x1e293b, 1)
    g.fillRoundedRect(0, 0, 96, 80, 10)
    g.lineStyle(2, 0x7c3aed, 1)
    g.strokeRoundedRect(0, 0, 96, 80, 10)
    g.generateTexture('machine-active', 96, 80)

    // ── coin  (20 × 20): golden circle ────────────────────────────────────────
    g.clear()
    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(10, 10, 9)
    g.fillStyle(0xfde68a, 1)
    g.fillCircle(7, 7, 3)
    g.generateTexture('coin', 20, 20)

    // ── particle  (8 × 8): tiny star for coin-burst ───────────────────────────
    g.clear()
    g.fillStyle(0xfbbf24, 1)
    g.fillRect(3, 0, 2, 8)
    g.fillRect(0, 3, 8, 2)
    g.generateTexture('particle', 8, 8)

    // ── btn-upgrade  (180 × 44): gradient purple button ───────────────────────
    g.clear()
    g.fillGradientStyle(0x7c3aed, 0x6d28d9, 0x5b21b6, 0x4c1d95, 1)
    g.fillRoundedRect(0, 0, 180, 44, 10)
    g.lineStyle(2, 0xa78bfa, 1)
    g.strokeRoundedRect(0, 0, 180, 44, 10)
    g.generateTexture('btn-upgrade', 180, 44)

    // ── btn-upgrade-hover  (180 × 44): lighter on hover ───────────────────────
    g.clear()
    g.fillGradientStyle(0x8b5cf6, 0x7c3aed, 0x6d28d9, 0x5b21b6, 1)
    g.fillRoundedRect(0, 0, 180, 44, 10)
    g.lineStyle(2, 0xc4b5fd, 1)
    g.strokeRoundedRect(0, 0, 180, 44, 10)
    g.generateTexture('btn-upgrade-hover', 180, 44)

    // ── btn-upgrade-disabled  (180 × 44): greyed out ─────────────────────────
    g.clear()
    g.fillStyle(0x374151, 1)
    g.fillRoundedRect(0, 0, 180, 44, 10)
    g.lineStyle(2, 0x4b5563, 1)
    g.strokeRoundedRect(0, 0, 180, 44, 10)
    g.generateTexture('btn-upgrade-disabled', 180, 44)

    g.destroy()
  }
}
