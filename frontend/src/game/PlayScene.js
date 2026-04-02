import * as Phaser from 'phaser'

/**
 * PlayScene  –  Math Script Tycoon  (ages 5-7)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ──────────────────────────────────────────────────────────────────────────
 *  ┌─────────────────────────────────────────────────────┐
 *  │  PlayScene                                          │
 *  │   ├─ MathMachine[]   (the "floors" of the tycoon)  │
 *  │   ├─ HUD             (coin counter + upgrade btn)   │
 *  │   └─ MilestoneTracker                               │
 *  └─────────────────────────────────────────────────────┘
 *
 *  The React ↔ Phaser bridge lives in the Phaser game registry:
 *    this.registry.get('onAnalogyMilestone')?.({ conceptId })
 *  GamePlayerPage.jsx stores the React callback there when the game boots.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * HOW TO SWAP IN REAL ASSETS
 * ──────────────────────────────────────────────────────────────────────────
 *  Every texture key used in this file maps to a programmatic texture that
 *  was generated in PreloadScene.generateTextures().  To replace one:
 *    1. Add a this.load.image('machine-bg', 'assets/machine.png') in
 *       PreloadScene.preload().
 *    2. Delete the corresponding g.generateTexture('machine-bg', …) block
 *       from PreloadScene.generateTextures().
 *  No changes to this file are needed.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants  –  tweak these to change game feel
// ─────────────────────────────────────────────────────────────────────────────

/** Base time (ms) for a machine to complete one cycle at speed level 1. */
const BASE_CYCLE_MS = 4000

/**
 * MathCoins produced per completed cycle, multiplied by the machine's
 * output level.
 */
const BASE_OUTPUT = 1

/**
 * Each upgrade increases output by this amount and decreases cycle time by
 * SPEED_REDUCTION_MS (until a minimum).
 */
const OUTPUT_STEP = 1
const SPEED_REDUCTION_MS = 400
const MIN_CYCLE_MS = 800

/** Upgrade cost in MathCoins.  Scales with the machine's current level. */
const BASE_UPGRADE_COST = 5
const UPGRADE_COST_SCALE = 3 // cost = BASE_UPGRADE_COST + level * UPGRADE_COST_SCALE

/** How many manual clicks trigger the first Analogy Milestone. */
const MILESTONE_CLICKS = 10

/** How many coins trigger the second Analogy Milestone. */
const MILESTONE_COINS = 25

/** localStorage key used to persist the Phaser game state between sessions. */
const PHASER_SAVE_KEY = 'mst_phaser'

/** Format a bin amount as a compact string (e.g. 65200000 → "65.2M"). */
function formatBinAmount(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'
  if (n >= 1e9)  return (n / 1e9 ).toFixed(1).replace(/\.0$/, '') + 'B'
  if (n >= 1e6)  return (n / 1e6 ).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1e3)  return (n / 1e3 ).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.floor(n))
}

// ─────────────────────────────────────────────────────────────────────────────
// MathMachine
//
// A single "floor" in the tycoon.  Each machine:
//   • auto-fills a progress bar at its own speed
//   • awards MathCoins when the bar is full
//   • can be tapped to instantly complete the current cycle
//   • can be upgraded to earn more coins faster
// ─────────────────────────────────────────────────────────────────────────────
class MathMachine {
  /**
   * @param {PlayScene} scene       – the owning Phaser scene
   * @param {number}    x           – centre X of the machine panel
   * @param {number}    y           – centre Y of the machine panel
   * @param {string}    label       – display name (e.g. "Add-o-Tron")
   * @param {function}  onCycle     – called with (coinsEarned) each cycle
   */
  constructor(scene, x, y, label, onCycle) {
    this.scene = scene
    this.x = x
    this.y = y
    this.label = label
    this.onCycle = onCycle

    // Stats (start at level 1)
    this.level = 1
    this.output = BASE_OUTPUT         // coins per cycle
    this.cycleMs = BASE_CYCLE_MS      // current auto-cycle duration

    // State
    this.progress = 0    // 0 → 1
    this.elapsed = 0     // ms elapsed in the current cycle
    this.active = false  // true while the flash effect plays

    this._build()
  }

  // ── Build all Phaser game objects ──────────────────────────────────────────

  _build() {
    const s = this.scene
    const panelW = 96
    const panelH = 80

    // ── Panel background (swap texture for real art) ──────────────────────
    this.panel = s.add
      .image(this.x, this.y, 'machine-bg')
      .setInteractive({ useHandCursor: true })

    // ── Machine emoji / icon  (swap with a real sprite later) ─────────────
    // A simple coloured circle acts as a placeholder "gear" icon.
    this.icon = s.add.graphics()
    this._drawIcon(false)

    // ── Machine label ──────────────────────────────────────────────────────
    this.labelText = s.add
      .text(this.x, this.y - panelH * 0.28, this.label, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '11px',
        color: '#cbd5e1',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)

    // ── Level badge ────────────────────────────────────────────────────────
    this.levelText = s.add
      .text(this.x + panelW * 0.38, this.y - panelH * 0.42, `Lv.${this.level}`, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '9px',
        color: '#a78bfa',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)

    // ── Progress bar background ────────────────────────────────────────────
    const barW = panelW - 16
    const barH = 8
    const barX = this.x - barW / 2
    const barY = this.y + panelH * 0.28

    this.barBg = s.add.graphics()
    this.barBg.fillStyle(0x0f172a, 1)
    this.barBg.fillRoundedRect(barX, barY, barW, barH, 3)

    // ── Progress bar fill ──────────────────────────────────────────────────
    this.barFill = s.add.graphics()
    this._redrawBar()

    // ── "Tap!" hint text (fades in/out) ───────────────────────────────────
    this.tapHint = s.add
      .text(this.x, this.y + panelH * 0.15, 'Tap!', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '10px',
        color: '#fbbf24',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0)

    // ── Pulse tween for the tap hint ──────────────────────────────────────
    s.tweens.add({
      targets: this.tapHint,
      alpha: { from: 0, to: 0.85 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // ── Click / tap handler ───────────────────────────────────────────────
    this.panel.on('pointerdown', () => this._onTap())
    this.panel.on('pointerover', () => {
      if (!this.active) this.panel.setTexture('machine-active')
    })
    this.panel.on('pointerout', () => {
      if (!this.active) this.panel.setTexture('machine-bg')
    })
  }

  // ── Draw the placeholder "gear" icon ──────────────────────────────────────
  _drawIcon(lit) {
    this.icon.clear()
    this.icon.fillStyle(lit ? 0xfbbf24 : 0x334155, 1)
    this.icon.fillCircle(this.x, this.y - 6, 12)
    this.icon.fillStyle(lit ? 0xfde68a : 0x1e293b, 1)
    this.icon.fillCircle(this.x, this.y - 6, 6)
  }

  // ── Redraw the progress bar fill ──────────────────────────────────────────
  _redrawBar() {
    const panelW = 96
    const barW = panelW - 16
    const barH = 8
    const barX = this.x - barW / 2
    const barY = this.y + 22

    this.barFill.clear()
    if (this.progress <= 0) return

    // Colour shifts green → yellow → orange as progress increases
    const r = Math.round(Phaser.Math.Linear(0x4a, 0xfb, this.progress))
    const g2 = Math.round(Phaser.Math.Linear(0xde, 0xbf, this.progress))
    const b = Math.round(Phaser.Math.Linear(0x80, 0x24, this.progress))
    const colour = (r << 16) | (g2 << 8) | b

    this.barFill.fillStyle(colour, 1)
    this.barFill.fillRoundedRect(barX, barY, barW * this.progress, barH, 3)
  }

  // ── Handle a manual tap ────────────────────────────────────────────────────
  _onTap() {
    // Instantly complete the cycle
    this.progress = 1
    this._completeCycle(true /* manual */)
    // Brief flash effect
    this._flash()
  }

  // ── Flash effect when tapped ───────────────────────────────────────────────
  _flash() {
    this.active = true
    this.panel.setTexture('machine-active')
    this._drawIcon(true)
    this.scene.time.delayedCall(200, () => {
      this.active = false
      this.panel.setTexture('machine-bg')
      this._drawIcon(false)
    })
  }

  // ── Called every game tick from PlayScene.update() ────────────────────────
  /**
   * @param {number} delta – ms since last frame (provided by Phaser)
   * @returns {{ manual: boolean }} | null – non-null if a cycle completed
   */
  update(delta) {
    if (this.progress >= 1) return null  // waiting for _completeCycle to reset

    this.elapsed += delta
    this.progress = Math.min(this.elapsed / this.cycleMs, 1)
    this._redrawBar()

    if (this.progress >= 1) {
      return this._completeCycle(false /* auto */)
    }
    return null
  }

  // ── Complete a cycle, reset progress, return result ───────────────────────
  _completeCycle(manual) {
    const coinsEarned = this.output
    // Reset for next cycle
    this.progress = 0
    this.elapsed = 0
    this._redrawBar()
    // Notify PlayScene
    this.onCycle(coinsEarned, manual)
    return { coinsEarned, manual }
  }

  // ── Upgrade the machine ────────────────────────────────────────────────────
  upgrade() {
    this.level += 1
    this.output += OUTPUT_STEP
    this.cycleMs = Math.max(this.cycleMs - SPEED_REDUCTION_MS, MIN_CYCLE_MS)
    // Update the level badge
    this.levelText.setText(`Lv.${this.level}`)
    // Brief scale bounce to give feedback
    this.scene.tweens.add({
      targets: [this.panel, this.icon],
      scaleX: { from: 1, to: 1.12 },
      scaleY: { from: 1, to: 1.12 },
      duration: 120,
      yoyo: true,
      ease: 'Bounce.easeOut',
    })
  }

  /** Cost to upgrade this machine to the next level. */
  get upgradeCost() {
    return BASE_UPGRADE_COST + this.level * UPGRADE_COST_SCALE
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayScene
// ─────────────────────────────────────────────────────────────────────────────
export default class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' })
  }

  // ── One-time setup ──────────────────────────────────────────────────────────
  create() {
    const { width, height } = this.scale

    // ── Milestone tracking ────────────────────────────────────────────────────
    this._manualClicks = 0          // total taps across all machines
    this._totalCoins = 0            // cumulative coins ever earned
    this._milestonesFired = new Set() // ids of already-fired milestones

    // ── Background gradient ────────────────────────────────────────────────────
    const bg = this.add.graphics()
    bg.fillGradientStyle(0x0a0e1a, 0x0a0e1a, 0x0f172a, 0x0f172a, 1)
    bg.fillRect(0, 0, width, height)

    // ── Title bar ──────────────────────────────────────────────────────────────
    const titleBar = this.add.graphics()
    titleBar.fillStyle(0x111827, 1)
    titleBar.fillRect(0, 0, width, height * 0.1)

    this.add
      .text(width / 2, height * 0.05, '✦ MATH SCRIPT TYCOON ✦', {
        fontFamily: '"Orbitron", monospace',
        fontSize: `${Math.round(height * 0.045)}px`,
        color: '#7c3aed',
      })
      .setOrigin(0.5)

    // ── Machines layout ────────────────────────────────────────────────────────
    // Place machines in a horizontal row in the centre of the screen.
    // To add more machines, push another config entry and adjust the x positions.
    const machineConfigs = [
      { label: 'Add-o-Tron',  x: width * 0.22 },
      { label: 'Multi-Maker', x: width * 0.50 },
      { label: 'Div-o-Bot',   x: width * 0.78 },
    ]

    this._machines = machineConfigs.map(({ label, x }) => {
      return new MathMachine(
        this,
        x,
        height * 0.48,
        label,
        (coins, manual) => this._onMachineCycle(coins, manual),
      )
    })

    // ── Track which machine is "selected" for the upgrade button ──────────────
    this._selectedMachine = this._machines[0]
    this._highlightSelected()
    // Allow clicking the panel to select it for upgrading
    this._machines.forEach((m, i) => {
      m.panel.on('pointerup', () => {
        this._selectedMachine = this._machines[i]
        this._highlightSelected()
        this._refreshUpgradeBtn()
      })
    })

    // ── HUD ────────────────────────────────────────────────────────────────────
    this._buildHUD()

    // ── Coin-burst particle emitter ───────────────────────────────────────────
    // Uses the tiny 'particle' texture generated in PreloadScene.
    // To swap to a real sprite: replace 'particle' with your image key.
    this._particles = this.add.particles(0, 0, 'particle', {
      speed: { min: 80, max: 220 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 600,
      gravityY: 280,
      tint: [0xfbbf24, 0xfde68a, 0xf59e0b],
      quantity: 0,       // emit on demand via explode()
      emitting: false,
    })

    // ── Floating "+N coin" text pool ──────────────────────────────────────────
    // Pre-create a handful of Text objects and recycle them.
    this._floatPool = Array.from({ length: 8 }, () =>
      this.add
        .text(0, 0, '', {
          fontFamily: '"Rajdhani", sans-serif',
          fontSize: '18px',
          color: '#fbbf24',
          fontStyle: 'bold',
          stroke: '#78350f',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setAlpha(0),
    )
    this._floatIndex = 0

    // ── Milestone overlay group (hidden until triggered) ──────────────────────
    this._milestoneGroup = this.add.group()
    this._milestoneGroup.setVisible(false)

    // ── Resource pile containers — one Graphics + Text per floor (by floorId) ──
    // Keyed by floorId string. Each entry: { gfx: Graphics, label: Text }
    this._pileMap = new Map()
    this._lastBinData = []   // cached to avoid unnecessary redraws

    // ── Restore saved state (must run after all game objects are created) ─────
    this._loadPhaserSave()
    this._lastBinSerial = ''   // JSON snapshot of last-rendered bin data

    // ── WebGL FX state (PreFX glow + PostFX camera shockwave) ─────────────────
    // _frenzyGlows: array of {glow, tween} pairs active during manager frenzy
    // _frenzyActive: gate to avoid double-applying the same FX state
    this._frenzyGlows  = []
    this._frenzyActive = false

    // Listen for React→Phaser FX signals pushed via the game registry bridge.
    // changedata-<key> fires whenever GamePlayerPage writes a new value.
    this.registry.events.on('changedata-managerFrenzyActive', (_parent, value) => {
      this._applyFrenzyGlow(!!value)
    }, this)
    this.registry.events.on('changedata-triggerRefactorFX', () => {
      this._triggerRefactorFX()
    }, this)
  }

  // ── Scene lifecycle — clean up registry listeners on shutdown ─────────────
  // Phaser calls shutdown() when the scene is stopped or restarted.
  // Removing the listeners here prevents duplicate handlers if the scene ever
  // restarts, and avoids potential memory leaks from lingering closures.
  shutdown() {
    this.registry.events.off('changedata-managerFrenzyActive', undefined, this)
    this.registry.events.off('changedata-triggerRefactorFX',  undefined, this)
    // Ensure any active frenzy glow is fully cleaned up
    this._applyFrenzyGlow(false)
    super.shutdown?.()
  }

  // ── Called every frame by Phaser ──────────────────────────────────────────
  update(_time, delta) {
    this._machines.forEach((m) => m.update(delta))

    // ── Sync resource pile visuals from React registry ────────────────────────
    // React creates a new array reference on every floor state change, so we
    // compare a lightweight JSON serial to avoid per-frame redraws when
    // the numbers haven't actually changed.
    const bins = this.registry.get('floorBins')
    if (!Array.isArray(bins)) return
    const serial = JSON.stringify(bins)
    if (serial === this._lastBinSerial) return
    this._lastBinSerial = serial

    const capacity = this.registry.get('busCapacity') ?? 30
    const { width, height } = this.scale
    // Show only unlocked floors (level > 0), up to 4 visible slots
    const unlocked = bins.filter(f => f.level > 0)
    const visible = unlocked.slice(0, 4)
    const total = visible.length
    visible.forEach((floor, idx) => {
      this.renderResourcePile(floor.id, floor.outputBin, idx, total, width, height, capacity)
    })
    // Hide piles for floors that are no longer in the visible set
    for (const [id, pile] of this._pileMap.entries()) {
      if (!visible.some(f => f.id === id)) {
        pile.gfx.setVisible(false)
        pile.label.setVisible(false)
        pile.warningIcon?.setVisible(false)
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Render (or update) a resource token badge for a single floor's outputBin.
   *
   * Renders exactly ONE server-box icon plus a compact count label (e.g. "📦 ×65.2K").
   * No stacked DOM/canvas elements — the badge is strictly contained within the
   * floor's vertical slice of the canvas.
   *
   * @param {string} floorId      - Unique floor identifier (e.g. 'spell-lab')
   * @param {number} binAmount    - Current value of the floor's outputBin
   * @param {number} slotIndex    - 0-based index within the visible floor list (0=bottom)
   * @param {number} totalSlots   - Total number of visible floors (for y positioning)
   * @param {number} canvasW      - Canvas width in pixels
   * @param {number} canvasH      - Canvas height in pixels
   * @param {number} busCapacity  - Elevator max capacity (used for overflow threshold)
   */
  renderResourcePile(floorId, binAmount, slotIndex, totalSlots, canvasW, canvasH, busCapacity) {
    // ── Layout constants ────────────────────────────────────────────────────
    const SHAFT_X    = canvasW * 0.25             // right edge of elevator shaft
    const ICON_W     = Math.max(10, canvasW * 0.04)
    const ICON_H     = Math.max(8,  canvasH * 0.025)
    const FLOOR_H    = canvasH / Math.max(1, totalSlots)
    const floorTop   = canvasH - (slotIndex + 1) * FLOOR_H   // top of this floor slot
    // Badge centre Y: vertically centred within floor, clamped to floor bounds
    const badgeCY    = Math.max(floorTop + ICON_H, Math.min(
      floorTop + FLOOR_H - ICON_H,
      floorTop + FLOOR_H / 2,
    ))
    const badgeCX    = SHAFT_X - ICON_W / 2 - 4  // just left of the shaft

    // ── Colour: green → orange → red based on overflow severity ─────────────
    const overflow = busCapacity > 0 ? binAmount / (busCapacity * 3) : 0
    let fillColour, strokeColour, textColor
    if (overflow < 0.5) {
      fillColour = 0x22c55e;  strokeColour = 0x15803d;  textColor = '#86efac'
    } else if (overflow < 1) {
      fillColour = 0xf59e0b;  strokeColour = 0xb45309;  textColor = '#fcd34d'
    } else {
      fillColour = 0xef4444;  strokeColour = 0xb91c1c;  textColor = '#fca5a5'
    }

    // ── Ensure pile entry exists ────────────────────────────────────────────
    if (!this._pileMap.has(floorId)) {
      const gfx = this.add.graphics().setDepth(10)
      const label = this.add.text(0, 0, '', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '8px',
        color: '#e2e8f0',
        fontStyle: 'bold',
        stroke: '#0f172a',
        strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(11)
      const warningIcon = this.add.text(0, 0, '⚠', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '9px',
        color: '#ef4444',
        fontStyle: 'bold',
        stroke: '#0f172a',
        strokeThickness: 2,
      }).setOrigin(0.5).setDepth(11).setVisible(false)
      this._pileMap.set(floorId, { gfx, label, warningIcon })
    }

    const { gfx, label, warningIcon } = this._pileMap.get(floorId)
    gfx.clear()
    const showWarning = overflow >= 1

    if (binAmount <= 0) {
      gfx.setVisible(false)
      label.setVisible(false)
      warningIcon.setVisible(false)
      return
    }

    // ── Draw a single server-box icon (rounded rect) ─────────────────────────
    gfx.setVisible(true)
    const ix = badgeCX - ICON_W / 2
    const iy = badgeCY - ICON_H / 2
    // Box body
    gfx.fillStyle(fillColour, 0.88)
    gfx.fillRoundedRect(ix, iy, ICON_W, ICON_H, 2)
    gfx.lineStyle(1, strokeColour, 0.8)
    gfx.strokeRoundedRect(ix, iy, ICON_W, ICON_H, 2)
    // Top highlight stripe
    gfx.fillStyle(0xffffff, 0.18)
    gfx.fillRoundedRect(ix + 1, iy + 1, ICON_W - 2, Math.max(1, ICON_H * 0.3), 1)

    // ── Count badge to the right of the icon ────────────────────────────────
    const countStr = formatBinAmount(binAmount)
    label.setVisible(true)
    label.setPosition(badgeCX + ICON_W / 2 + 3, badgeCY)
    label.setOrigin(0, 0.5)
    label.setText('×' + countStr)
    label.setColor(textColor)

    // ── Warning pulse for severe overflow ────────────────────────────────────
    warningIcon.setVisible(showWarning)
    if (showWarning) {
      warningIcon.setPosition(badgeCX, floorTop + 3)
      const t = (this.time?.now ?? 0) / 400
      warningIcon.setAlpha(0.6 + 0.4 * Math.sin(t))
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  // ── React to a machine completing a cycle ──────────────────────────────────
  _onMachineCycle(coins, manual) {
    this._totalCoins += coins
    if (manual) this._manualClicks += 1

    // Award coins and refresh the HUD
    this._addCoins(coins)

    // Find which machine just fired to position the burst
    // (we use the "active" machine state set just before onCycle is called)
    const machine = this._machines.find(
      (m) => m.progress === 0 && m.elapsed === 0,
    ) ?? this._selectedMachine

    // ── Coin-burst particle effect ────────────────────────────────────────────
    this._coinBurst(machine.x, machine.y)

    // ── Floating coin text ─────────────────────────────────────────────────────
    this._spawnFloatText(machine.x, machine.y - 40, `+${coins} 🪙`)

    // ── Milestone checks ──────────────────────────────────────────────────────
    this._checkMilestones()
  }

  // ── Add coins and refresh the counter ──────────────────────────────────────
  _addCoins(amount) {
    // Retrieve live coin balance from registry (shared with upgrade button)
    const prev = this.registry.get('coins') ?? 0
    const next = prev + amount
    this.registry.set('coins', next)
    this._coinText.setText(`🪙 ${next}`)
    this._refreshUpgradeBtn()
    this._savePhaserState()
  }

  // ── Build the HUD (coin counter + upgrade button) ─────────────────────────
  _buildHUD() {
    const { width, height } = this.scale

    // Initialise coin balance in the registry
    this.registry.set('coins', 0)

    // ── Coin counter ──────────────────────────────────────────────────────────
    const hudBg = this.add.graphics()
    hudBg.fillStyle(0x111827, 0.9)
    hudBg.fillRoundedRect(8, height * 0.12, 160, 32, 8)

    this._coinText = this.add
      .text(88, height * 0.12 + 16, '🪙 0', {
        fontFamily: '"Orbitron", monospace',
        fontSize: '16px',
        color: '#fbbf24',
      })
      .setOrigin(0.5)

    // ── Upgrade button ────────────────────────────────────────────────────────
    // Centred at the bottom of the screen.
    const btnX = width / 2
    const btnY = height * 0.88

    // Background image (swap texture 'btn-upgrade' for real art)
    this._upgradeBtn = this.add
      .image(btnX, btnY, 'btn-upgrade')
      .setInteractive({ useHandCursor: true })

    this._upgradeBtnLabel = this.add
      .text(btnX, btnY, `Upgrade  (${this._selectedMachine.upgradeCost} 🪙)`, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5)

    this._upgradeBtn.on('pointerover', () => {
      const coins = this.registry.get('coins') ?? 0
      if (coins >= this._selectedMachine.upgradeCost) {
        this._upgradeBtn.setTexture('btn-upgrade-hover')
      }
    })
    this._upgradeBtn.on('pointerout', () => {
      this._refreshUpgradeBtn()
    })
    this._upgradeBtn.on('pointerdown', () => {
      this._tryUpgrade()
    })

    // ── Selected machine indicator label ─────────────────────────────────────
    this._selectLabel = this.add
      .text(width / 2, height * 0.81, `Selected: ${this._selectedMachine.label}`, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '12px',
        color: '#94a3b8',
      })
      .setOrigin(0.5)

    // ── Click/tap counter (shown for milestone progress) ──────────────────────
    this._clickCounterText = this.add
      .text(width - 10, height * 0.12 + 16, `Taps: 0 / ${MILESTONE_CLICKS}`, {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: '11px',
        color: '#64748b',
      })
      .setOrigin(1, 0.5)
  }

  // ── Highlight the selected machine panel ──────────────────────────────────
  _highlightSelected() {
    this._machines.forEach((m) => m.panel.setAlpha(0.75))
    this._selectedMachine.panel.setAlpha(1)
    if (this._selectLabel) {
      this._selectLabel.setText(`Selected: ${this._selectedMachine.label}`)
    }
  }

  // ── Refresh the upgrade button state ──────────────────────────────────────
  _refreshUpgradeBtn() {
    if (!this._upgradeBtn) return
    const coins = this.registry.get('coins') ?? 0
    const cost = this._selectedMachine.upgradeCost
    const canAfford = coins >= cost

    this._upgradeBtn.setTexture(canAfford ? 'btn-upgrade' : 'btn-upgrade-disabled')
    this._upgradeBtnLabel.setText(
      `Upgrade ${this._selectedMachine.label}  (${cost} 🪙)`,
    )
    this._upgradeBtnLabel.setColor(canAfford ? '#e2e8f0' : '#6b7280')
  }

  // ── Attempt to upgrade the selected machine ────────────────────────────────
  _tryUpgrade() {
    const coins = this.registry.get('coins') ?? 0
    const cost = this._selectedMachine.upgradeCost

    if (coins < cost) {
      // Shake the button to indicate "not enough coins"
      this.tweens.add({
        targets: [this._upgradeBtn, this._upgradeBtnLabel],
        x: `+=6`,
        duration: 40,
        yoyo: true,
        repeat: 3,
        ease: 'Linear',
      })
      return
    }

    // Deduct coins
    this.registry.set('coins', coins - cost)
    this._coinText.setText(`🪙 ${coins - cost}`)

    // Upgrade the machine
    this._selectedMachine.upgrade()
    this._refreshUpgradeBtn()

    // Celebratory particles at button
    this._coinBurst(this._upgradeBtn.x, this._upgradeBtn.y)
    this._savePhaserState()
  }

  // ── Coin-burst particle effect ──────────────────────────────────────────────
  /**
   * Emit a burst of coin particles at (x, y).
   * @param {number} x
   * @param {number} y
   */
  _coinBurst(x, y) {
    // Move the emitter to the target position and fire 12 particles
    this._particles.setPosition(x, y)
    this._particles.explode(12)
  }

  // ── Persist Phaser game state to localStorage ─────────────────────────────
  _savePhaserState() {
    try {
      localStorage.setItem(PHASER_SAVE_KEY, JSON.stringify({
        coins: this.registry.get('coins') ?? 0,
        levels: this._machines?.map(m => m.level) ?? [],
      }))
    } catch { /* ignore — private browsing or storage full */ }
  }

  // ── Restore Phaser game state from localStorage ───────────────────────────
  _loadPhaserSave() {
    try {
      const raw = localStorage.getItem(PHASER_SAVE_KEY)
      if (!raw) return
      const { coins, levels } = JSON.parse(raw)

      // Restore coin balance
      if (typeof coins === 'number' && coins >= 0) {
        this.registry.set('coins', coins)
        this._coinText.setText(`🪙 ${coins}`)
        this._refreshUpgradeBtn()
      }

      // Restore machine levels (silently — no tween, no sound)
      if (Array.isArray(levels)) {
        this._machines.forEach((m, i) => {
          const target = Math.max(1, Math.min(levels[i] ?? 1, 50))
          for (let l = m.level; l < target; l++) {
            m.level += 1
            m.output += OUTPUT_STEP
            m.cycleMs = Math.max(m.cycleMs - SPEED_REDUCTION_MS, MIN_CYCLE_MS)
          }
          if (m.level > 1) m.levelText.setText(`Lv.${m.level}`)
        })
        this._refreshUpgradeBtn()
      }
    } catch { /* corrupt save — start fresh */ }
  }

  // ── Floating "+N coin" animation ───────────────────────────────────────────
  /**
   * Briefly shows a floating text label then fades it out.
   * Uses a small object pool to avoid creating new Text objects every cycle.
   * @param {number} x
   * @param {number} y
   * @param {string} msg
   */
  _spawnFloatText(x, y, msg) {
    const t = this._floatPool[this._floatIndex % this._floatPool.length]
    this._floatIndex += 1

    t.setPosition(x, y).setText(msg).setAlpha(1)

    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Milestone system
  //
  // When a threshold is reached, the scene pauses and fires an event up to
  // the parent React component via the game registry bridge.
  //
  // React can then display a TeachingAnalogyCard, resume the scene with:
  //   game.scene.resume('PlayScene')
  // ──────────────────────────────────────────────────────────────────────────
  _checkMilestones() {
    // Update on-screen tap counter
    this._clickCounterText.setText(
      `Taps: ${this._manualClicks} / ${MILESTONE_CLICKS}`,
    )

    const pending = []

    // Milestone 1 – first 10 manual taps  →  addition analogy
    if (
      this._manualClicks >= MILESTONE_CLICKS &&
      !this._milestonesFired.has('clicks-10')
    ) {
      pending.push({ id: 'clicks-10', conceptId: 'addition-intro' })
    }

    // Milestone 2 – 25 cumulative coins  →  multiplication analogy
    if (
      this._totalCoins >= MILESTONE_COINS &&
      !this._milestonesFired.has('coins-25')
    ) {
      pending.push({ id: 'coins-25', conceptId: 'multiplication-groups' })
    }

    // Fire the first un-fired milestone (one at a time)
    if (pending.length === 0) return
    const { id, conceptId } = pending[0]
    this._milestonesFired.add(id)
    this._fireMilestone(conceptId)
  }

  // ── Fire a single milestone ────────────────────────────────────────────────
  /**
   * Pauses the scene and emits SHOW_ANALOGY to React.
   * @param {string} conceptId  – opaque string consumed by TeachingAnalogyCard
   */
  _fireMilestone(conceptId) {
    // Pause auto-update so machines stop ticking while the analogy is shown
    this.scene.pause()

    // Notify React via the bridge stored in the game registry
    const cb = this.registry.get('onAnalogyMilestone')
    if (typeof cb === 'function') {
      cb({ conceptId, event: 'SHOW_ANALOGY' })
    }

    // Milestone overlay (visible while paused, dismissed when React calls resume)
    this._showMilestoneOverlay(conceptId)
  }

  // ── Dim overlay shown while the analogy card is up ────────────────────────
  _showMilestoneOverlay(conceptId) {
    const { width, height } = this.scale

    // Clean up any previous overlay
    this._milestoneGroup.clear(true, true)
    this._milestoneGroup.setVisible(true)

    const overlay = this.add.graphics()
    overlay.fillStyle(0x000000, 0.55)
    overlay.fillRect(0, 0, width, height)
    this._milestoneGroup.add(overlay)

    const msg = this.add
      .text(width / 2, height / 2, `🌟 Analogy Milestone!\n"${conceptId}"`, {
        fontFamily: '"Orbitron", monospace',
        fontSize: `${Math.round(height * 0.045)}px`,
        color: '#fbbf24',
        align: 'center',
        stroke: '#78350f',
        strokeThickness: 3,
        wordWrap: { width: width * 0.75 },
      })
      .setOrigin(0.5)
    this._milestoneGroup.add(msg)

    // "Continue" button for cases where React does not auto-dismiss
    const contBtn = this.add
      .text(width / 2, height * 0.68, '▶  Continue', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize: `${Math.round(height * 0.05)}px`,
        color: '#e2e8f0',
        backgroundColor: '#7c3aed',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    contBtn.on('pointerdown', () => {
      this._milestoneGroup.setVisible(false)
      this._milestoneGroup.clear(true, true)
      this.scene.resume()
    })
    this._milestoneGroup.add(contBtn)
  }

  // ── Task 2: Manager Frenzy — PreFX Glow on machine panels ────────────────
  /**
   * Applies (or removes) a pulsing neon-green glow to every machine panel
   * using Phaser's native PreFX pipeline.  Only runs when the WebGL renderer
   * is active; silently skips on Canvas renderer (preFX will be undefined).
   *
   * Called by the registry 'changedata-managerFrenzyActive' listener.
   *
   * @param {boolean} active – true to add glow, false to remove and clean up
   */
  _applyFrenzyGlow(active) {
    if (active === this._frenzyActive) return
    this._frenzyActive = active

    if (active) {
      // Add a pulsing neon-cyan PreFX glow to each machine panel sprite.
      this._frenzyGlows = this._machines.map(m => {
        // preFX is undefined on Canvas renderer — guard before use
        if (!m.panel.preFX) return null
        const glow = m.panel.preFX.addGlow(0x00ffcc, 1, 0, false)
        const tween = this.tweens.add({
          targets: glow,
          outerStrength: 6,
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        })
        return { glow, tween }
      }).filter(Boolean)
    } else {
      // Stop all pulsing tweens and clear the PreFX pipeline to free WebGL memory.
      this._frenzyGlows.forEach(({ tween }) => tween.stop())
      this._frenzyGlows = []
      this._machines.forEach(m => {
        if (m.panel.preFX) m.panel.preFX.clear()
      })
    }
  }

  // ── Task 3: Prime Refactor — PostFX camera shockwave ─────────────────────
  /**
   * Plays a "screen shockwave" sequence on the main camera using Phaser's
   * native PostFX pipeline:
   *   Phase 1 (300 ms) — barrel distortion ramps from 0 → 0.7 while the
   *                       screen flashes bright white via a ColorMatrix.
   *   Phase 2 (900 ms) — distortion retracts and brightness fades to normal.
   *   Cleanup           — postFX.clear() frees the WebGL shaders.
   *
   * Only runs in WebGL renderer; silently returns if postFX is unavailable.
   * Called by the registry 'changedata-triggerRefactorFX' listener.
   */
  _triggerRefactorFX() {
    const camera = this.cameras.main
    // PostFX is only available when Phaser is running in WebGL mode
    if (!camera.postFX) return

    // Clear any leftover effects from a previous (or interrupted) run
    camera.postFX.clear()

    // ── Barrel distortion ──────────────────────────────────────────────────
    // amount 0 = no distortion; 1 = full barrel warp
    const barrel = camera.postFX.addBarrel(0)

    // ── White flash via ColorMatrix brightness ─────────────────────────────
    // brightness() replaces the matrix each call (multiply=false by default),
    // so tweening the intermediate object and calling it in onUpdate is safe.
    const cmObj = { brightness: 3.0 }
    const colorMatrix = camera.postFX.addColorMatrix()
    colorMatrix.brightness(cmObj.brightness)

    // Phase 1: ramp up barrel distortion (white flash is already at max)
    this.tweens.add({
      targets: barrel,
      amount: 0.7,
      duration: 300,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // Phase 2a: fade brightness back to 1× (normal) over 900 ms
        this.tweens.add({
          targets: cmObj,
          brightness: 1.0,
          duration: 900,
          ease: 'Cubic.easeOut',
          onUpdate: () => colorMatrix.brightness(cmObj.brightness),
        })
        // Phase 2b: retract barrel distortion to 0 over 900 ms; clear FX on finish
        this.tweens.add({
          targets: barrel,
          amount: 0,
          duration: 900,
          ease: 'Cubic.easeOut',
          onComplete: () => camera.postFX.clear(),
        })
      },
    })
  }
}
