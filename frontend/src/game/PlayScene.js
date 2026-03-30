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

    // ── Restore saved state (must run after all game objects are created) ─────
    this._loadPhaserSave()
  }

  // ── Called every frame by Phaser ──────────────────────────────────────────
  update(_time, delta) {
    this._machines.forEach((m) => m.update(delta))
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
}
