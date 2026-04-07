import * as Phaser from 'phaser'
import * as GameEventBus from '../utils/GameEventBus'
import { ObjectPool } from '../utils/ObjectPool.js'

/**
 * CombatScene — RPG battle arena rendered entirely inside the Phaser canvas.
 *
 * ─── Lifecycle ────────────────────────────────────────────────────────────────
 *  The scene is registered in the Phaser Game config and starts in a sleeping
 *  state.  IsoTycoonScene wakes it when 'combat:start' fires and puts it back
 *  to sleep when 'combat:end' fires.
 *
 * ─── Sub-systems ──────────────────────────────────────────────────────────────
 *  Background  – Space gradient + parallax star field (Graphics + Layer).
 *  Fighters    – Hero Image (left) + Boss Image (right) with idle float tweens.
 *  HP bars     – CanvasHealthBar instances above each fighter.
 *  Attacks     – Five particle preset types (slash/spell/impact/lightning/fire).
 *  Damage nums – ObjectPool of Phaser Text objects; tweened up and released.
 *  Flash/shake – Full-screen Graphics flash + camera shake on each hit.
 *  Timer bar   – Thin rect at top; updated every frame when gameType='timed'.
 *  Overlay     – Victory/defeat panel tweened in on 'combat:end'.
 *
 * ─── Event wiring ─────────────────────────────────────────────────────────────
 *  Listens: combat:start, combat:hp-update, combat:player-attack,
 *           combat:boss-attack, combat:end
 *  Emits:   combat:ui-ready
 */

// ─── Layout constants ─────────────────────────────────────────────────────────
const HERO_X_NORM  = 0.22   // normalised X position of hero (0-1 of canvas width)
const BOSS_X_NORM  = 0.78   // normalised X position of boss
const FIGHTER_Y    = 0.58   // normalised Y position of fighter midpoints
const HP_BAR_H     = 10     // pixels tall for the HP fill bar
const HP_BAR_W_NORM = 0.30  // fraction of canvas width per HP bar
const HP_HERO_X_NORM = 0.04 // left edge of hero HP bar (normalised)
const HP_BOSS_X_NORM = 0.66 // left edge of boss HP bar (normalised)
const HP_Y_NORM    = 0.08   // normalised Y for HP bars
const TIMER_H      = 5      // pixels tall for the timer bar

// ─── Depth bands ──────────────────────────────────────────────────────────────
const DEPTH_BG          = 0
const DEPTH_STARS       = 1
const DEPTH_FIGHTERS    = 10
const DEPTH_HP_BARS     = 20
const DEPTH_PARTICLES   = 30
const DEPTH_DAMAGE_NUMS = 35
const DEPTH_FLASH       = 40
const DEPTH_TIMER       = 45
const DEPTH_OVERLAY     = 50

// ─── Font ─────────────────────────────────────────────────────────────────────
const FONT_HUD    = '"Orbitron", monospace'
const FONT_COMBAT = '"Rajdhani", sans-serif'

// ─── Palette ──────────────────────────────────────────────────────────────────
const CLR_HP_TRACK = 0x111122
const CLR_HP_HIGH  = 0x22c55e
const CLR_HP_MID   = 0xfbbf24
const CLR_HP_LOW   = 0xef4444

// ─────────────────────────────────────────────────────────────────────────────
// CanvasHealthBar — a two-part Graphics-based HP bar that lives on the canvas.
// ─────────────────────────────────────────────────────────────────────────────

class CanvasHealthBar {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x       Left edge pixel X.
   * @param {number} y       Top edge pixel Y.
   * @param {number} maxW    Full-width pixels.
   * @param {number} h       Height pixels.
   * @param {number} color   Phaser integer colour tint for the fill.
   * @param {string} label   Name displayed above bar.
   * @param {'left'|'right'} side  Alignment for the label/value text.
   */
  constructor(scene, x, y, maxW, h, color, label, side) {
    this._scene  = scene
    this._x      = x
    this._y      = y
    this._maxW   = maxW
    this._h      = h
    this._color  = color
    this._side   = side
    this._pct    = 1.0
    this._tweenVal = { pct: 1.0 }

    // Background track
    this._track = scene.add.graphics().setDepth(DEPTH_HP_BARS)
    this._track.fillStyle(CLR_HP_TRACK, 0.7)
    this._track.fillRoundedRect(x, y, maxW, h, 3)

    // Fill bar (redrawn in _draw)
    this._fill = scene.add.graphics().setDepth(DEPTH_HP_BARS)

    // Highlight sheen
    this._sheen = scene.add.graphics().setDepth(DEPTH_HP_BARS)

    // Name label
    const labelX  = side === 'left' ? x : x + maxW
    const anchor  = side === 'left' ? 0 : 1
    this._nameTxt = scene.add.text(labelX, y - 18, label.toUpperCase(), {
      fontFamily: FONT_HUD, fontSize: '9px', fontStyle: 'bold',
      color: '#9ca3af',
    }).setOrigin(anchor, 0).setDepth(DEPTH_HP_BARS)

    // HP value (e.g. "85/100")
    this._valueTxt = scene.add.text(labelX, y - 4, '', {
      fontFamily: FONT_HUD, fontSize: '11px', fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(anchor, 1).setDepth(DEPTH_HP_BARS)

    this._draw(1.0, 100, 100)
  }

  /** Instantly set HP values and smoothly tween the fill width. */
  setHP(current, max) {
    const targetPct = Math.max(0, Math.min(1, max > 0 ? current / max : 0))

    // Update value text immediately
    const fillColor = targetPct > 0.5 ? CLR_HP_HIGH : targetPct > 0.25 ? CLR_HP_MID : CLR_HP_LOW
    const hexStr = '#' + fillColor.toString(16).padStart(6, '0')
    this._valueTxt.setStyle({ color: hexStr })
    this._valueTxt.setText(`${Math.max(0, current)}/${max}`)

    // Tween the fill pct
    this._scene.tweens.addCounter({
      from: this._pct * 100,
      to:   targetPct * 100,
      duration: 400,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        const v = tween.getValue() / 100
        this._pct = v
        this._draw(v, current, max)
      },
    })
  }

  _draw(pct, current, max) {
    const fillW  = Math.max(0, Math.round(this._maxW * pct))
    const fillColor = pct > 0.5 ? CLR_HP_HIGH : pct > 0.25 ? CLR_HP_MID : CLR_HP_LOW

    this._fill.clear()
    if (fillW > 0) {
      this._fill.fillStyle(fillColor, 0.9)
      this._fill.fillRoundedRect(this._x, this._y, fillW, this._h, 3)
    }

    // Sheen: thin top highlight strip
    this._sheen.clear()
    if (fillW > 0) {
      this._sheen.fillStyle(0xffffff, 0.15)
      this._sheen.fillRect(this._x, this._y, fillW, Math.max(1, Math.floor(this._h / 3)))
    }
  }

  destroy() {
    this._track.destroy()
    this._fill.destroy()
    this._sheen.destroy()
    this._nameTxt.destroy()
    this._valueTxt.destroy()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CombatScene
// ─────────────────────────────────────────────────────────────────────────────

export default class CombatScene extends Phaser.Scene {
  constructor() {
    super({ key: 'CombatScene' })

    // Runtime state — populated by _startCombat() on each wake cycle
    this._heroName      = null
    this._heroColor     = 0xaaaaaa
    this._bossName      = null
    this._bossColor     = 0xef4444
    this._heroHP        = 100
    this._heroMaxHP     = 100
    this._bossHP        = 100
    this._bossMaxHP     = 100
    this._gameType      = 'quicktime'
    this._reduceEffects = false

    // Timed-game state
    this._timerActive   = false
    this._timerStart    = 0
    this._timerDuration = 0

    // GameEventBus unsubscribe handles
    this._unsubs = []
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // preload
  // ═══════════════════════════════════════════════════════════════════════════

  preload() {
    // Hero SVG portraits — same paths used by HERO_IMGS in MiniGame.jsx.
    const HERO_NAMES = [
      'Arcanos', 'Blaze', 'Shadow', 'Luna',
      'Titan', 'Webweaver', 'Volt', 'Tempest', 'Zenith',
    ]
    for (const name of HERO_NAMES) {
      const key = `combat_hero_${name.toLowerCase()}`
      if (!this.textures.exists(key)) {
        this.load.svg(key, `/assets/heroes/${name.toLowerCase()}.svg`, { width: 96, height: 96 })
      }
    }

    // Boss monster PNGs — same paths used by CYBER_BOSS_IMAGES in MiniGame.jsx.
    const BOSS_KEYS = [
      ['combat_boss_1', '/images/monster_1.png'],
      ['combat_boss_2', '/images/monster_2.png'],
      ['combat_boss_3', '/images/monster_3.png'],
      ['combat_boss_4', '/images/monster_4.png'],
      ['combat_boss_5', '/images/monster_5.png'],
      ['combat_boss_6', '/images/monster_6.png'],
    ]
    for (const [key, url] of BOSS_KEYS) {
      if (!this.textures.exists(key)) {
        this.load.image(key, url)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  create() {
    const { width, height } = this.scale

    // ── Background: deep-space gradient drawn with Graphics ──────────────────
    this._bgGfx = this.add.graphics().setDepth(DEPTH_BG)
    this._drawBackground()

    // ── Star field ───────────────────────────────────────────────────────────
    this._starGfx = this.add.graphics().setDepth(DEPTH_STARS)
    this._stars = this._generateStars(this._reduceEffects ? 20 : 60)
    this._drawStars()

    // ── Floor line ───────────────────────────────────────────────────────────
    this._floorGfx = this.add.graphics().setDepth(DEPTH_BG + 1)
    this._drawFloor()

    // ── HP bars (created once; setHP() is called each wake cycle) ────────────
    this._heroBar = null  // created in _startCombat()
    this._bossBar = null

    // ── Fighter images (ImageTexture placeholders; swapped in _startCombat) ──
    this._heroImg = this.add.image(width * HERO_X_NORM, height * FIGHTER_Y, '__DEFAULT')
      .setDisplaySize(90, 90)
      .setDepth(DEPTH_FIGHTERS)
      .setVisible(false)

    this._bossImg = this.add.image(width * BOSS_X_NORM, height * FIGHTER_Y, '__DEFAULT')
      .setDisplaySize(100, 120)
      .setDepth(DEPTH_FIGHTERS)
      .setVisible(false)

    // ── Idle bob tweens (looping; started in _startFighterIdle) ──────────────
    this._heroIdleTween = null
    this._bossIdleTween = null

    // ── Full-screen flash overlay ─────────────────────────────────────────────
    this._flashGfx = this.add.graphics().setDepth(DEPTH_FLASH)
    this._flashGfx.fillStyle(0xffffff, 0)
    this._flashGfx.fillRect(0, 0, width, height)
    this._flashGfx.setAlpha(0)

    // ── Timer bar ─────────────────────────────────────────────────────────────
    this._timerTrackGfx = this.add.graphics().setDepth(DEPTH_TIMER)
    this._timerFillGfx  = this.add.graphics().setDepth(DEPTH_TIMER)
    this._timerTrackGfx.setVisible(false)
    this._timerFillGfx.setVisible(false)

    // ── "VS" intro label ──────────────────────────────────────────────────────
    this._vsText = this.add.text(width / 2, height * 0.47, 'FIGHT!', {
      fontFamily: FONT_HUD,
      fontSize:   `${Math.round(width * 0.06)}px`,
      fontStyle:  'bold',
      color:      '#fbbf24',
      stroke:     '#78350f',
      strokeThickness: 4,
      align:      'center',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY).setAlpha(0)

    // ── Damage-number pool: 20 pre-allocated Text objects ─────────────────────
    this._dmgNumPool = new ObjectPool(
      () => this.add.text(0, 0, '', {
        fontFamily: FONT_HUD,
        fontSize:   '26px',
        fontStyle:  'bold',
        color:      '#ef4444',
        stroke:     '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(DEPTH_DAMAGE_NUMS).setVisible(false),
      20,
    )

    // ── Attack label pool: 8 pre-allocated Text objects ───────────────────────
    this._attackLabelPool = new ObjectPool(
      () => this.add.text(0, 0, '', {
        fontFamily: FONT_HUD,
        fontSize:   '12px',
        fontStyle:  'bold',
        color:      '#ffffff',
        stroke:     '#000000',
        strokeThickness: 2,
        letterSpacing: 2,
      }).setOrigin(0.5, 0).setDepth(DEPTH_DAMAGE_NUMS).setVisible(false),
      8,
    )

    // ── Particle textures (generated once) ───────────────────────────────────
    this._buildParticleTextures()

    // ── Particle emitters for each attack type ────────────────────────────────
    this._buildParticleEmitters()

    // ── Victory / defeat overlay (hidden until combat:end) ───────────────────
    this._buildResultOverlay()

    // ── GameEventBus listeners ────────────────────────────────────────────────
    this._unsubs = [
      GameEventBus.on('combat:start',          (p) => this._startCombat(p)),
      GameEventBus.on('combat:hp-update',       (p) => this._onHpUpdate(p)),
      GameEventBus.on('combat:player-attack',   (p) => this._onPlayerAttack(p)),
      GameEventBus.on('combat:boss-attack',     (p) => this._onBossAttack(p)),
      GameEventBus.on('combat:end',             (p) => this._onCombatEnd(p)),
    ]

    // Start sleeping — IsoTycoonScene wakes us when combat begins.
    this.scene.sleep()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // update (called each frame while scene is running)
  // ═══════════════════════════════════════════════════════════════════════════

  update(time, _delta) {
    // Parallax star drift
    if (!this._reduceEffects) {
      this._starScrollY = (this._starScrollY || 0) + 0.12
      if (this._starScrollY > this.scale.height) this._starScrollY = 0
      this._drawStars()
    }

    // Timer bar countdown
    if (this._timerActive && this._timerDuration > 0) {
      const elapsed = time - this._timerStart
      const pct = Math.max(0, 1 - elapsed / this._timerDuration)
      this._drawTimerBar(pct)
      if (pct <= 0) {
        this._timerActive = false
        this._timerFillGfx.clear()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // shutdown
  // ═══════════════════════════════════════════════════════════════════════════

  shutdown() {
    this._unsubs.forEach(unsub => unsub())
    this._unsubs = []

    this._stopFighterIdle()

    // Destroy all pooled Text objects
    if (this._dmgNumPool) {
      for (const txt of this._dmgNumPool.all) txt.destroy()
      this._dmgNumPool = null
    }
    if (this._attackLabelPool) {
      for (const txt of this._attackLabelPool.all) txt.destroy()
      this._attackLabelPool = null
    }

    this._heroBar?.destroy()
    this._heroBar = null
    this._bossBar?.destroy()
    this._bossBar = null

    super.shutdown()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── Private helpers ────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Background ──────────────────────────────────────────────────────────────

  _drawBackground() {
    const { width, height } = this.scale
    const g = this._bgGfx
    g.clear()

    // Multi-stop vertical gradient approximated with horizontal filled strips
    const stops = [
      { y: 0,            pct: 0,    color: 0x050810 },
      { y: height * 0.25, pct: 0.25, color: 0x0c1025 },
      { y: height * 0.5,  pct: 0.5,  color: 0x151835 },
      { y: height * 0.75, pct: 0.75, color: 0x1a1540 },
      { y: height,        pct: 1,    color: 0x0f0d18 },
    ]
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]
      const b = stops[i + 1]
      const segH = b.y - a.y
      const steps = Math.ceil(segH / 4)
      for (let s = 0; s < steps; s++) {
        const t  = s / steps
        const r1 = (a.color >> 16) & 0xff, g1 = (a.color >> 8) & 0xff, b1 = a.color & 0xff
        const r2 = (b.color >> 16) & 0xff, g2 = (b.color >> 8) & 0xff, b2 = b.color & 0xff
        const r  = Math.round(r1 + (r2 - r1) * t)
        const gc = Math.round(g1 + (g2 - g1) * t)
        const bc = Math.round(b1 + (b2 - b1) * t)
        const col = (r << 16) | (gc << 8) | bc
        g.fillStyle(col, 1)
        const sy = a.y + (segH / steps) * s
        g.fillRect(0, sy, width, Math.ceil(segH / steps) + 1)
      }
    }

    // Radial spotlight blobs for atmosphere
    g.fillStyle(0xa855f7, 0.06)
    g.fillCircle(width * 0.15, height * 0.2, height * 0.35)
    g.fillStyle(0xef4444, 0.06)
    g.fillCircle(width * 0.85, height * 0.25, height * 0.35)
    g.fillStyle(0x3b82f6, 0.04)
    g.fillCircle(width * 0.5, height * 0.9, height * 0.4)
  }

  _generateStars(count) {
    return Array.from({ length: count }, () => ({
      x:    Math.random(),
      y:    Math.random(),
      r:    0.5 + Math.random() * 1.0,
      a:    0.15 + Math.random() * 0.35,
    }))
  }

  _drawStars() {
    const { width, height } = this.scale
    const g = this._starGfx
    const scrollY = this._starScrollY || 0
    g.clear()
    g.fillStyle(0xffffff)
    for (const s of this._stars) {
      const py = (s.y * height + scrollY) % height
      g.fillStyle(0xffffff, s.a)
      g.fillCircle(s.x * width, py, s.r)
    }
  }

  _drawFloor() {
    const { width, height } = this.scale
    const g = this._floorGfx
    g.clear()
    const floorY = height * 0.80
    // Horizon ground gradient strip
    g.fillStyle(0x0f0d18, 0.8)
    g.fillRect(0, floorY, width, height - floorY)
    // Ground line with a slight glow
    g.fillStyle(0xa855f7, 0.25)
    g.fillRect(0, floorY, width, 2)
    g.fillStyle(0xef4444, 0.25)
    g.fillRect(0, floorY, width * 0.25, 2)
    g.fillStyle(0xa855f7, 0.15)
    g.fillRect(0, floorY + 2, width, 1)
  }

  // ── Fighter sprites ──────────────────────────────────────────────────────────

  _getHeroTextureKey(heroName) {
    const key = `combat_hero_${heroName.toLowerCase()}`
    return this.textures.exists(key) ? key : null
  }

  _getBossTextureKey(bossName) {
    const BOSS_MAP = {
      'Matrix-Web Spider': 'combat_boss_1',
      'Geometric-Golem':   'combat_boss_2',
      'Cipher-Serpent':    'combat_boss_3',
      'Glitch-Worm':       'combat_boss_4',
      'Error-Imp':         'combat_boss_5',
      'Fractal-Phoenix':   'combat_boss_6',
    }
    const key = BOSS_MAP[bossName]
    return key && this.textures.exists(key) ? key : null
  }

  _stopFighterIdle() {
    this._heroIdleTween?.stop()
    this._heroIdleTween = null
    this._bossIdleTween?.stop()
    this._bossIdleTween = null
  }

  _startFighterIdle() {
    this._stopFighterIdle()
    if (this._reduceEffects) return
    this._heroIdleTween = this.tweens.add({
      targets:  this._heroImg,
      y:        `+=${6}`,
      duration: 1200,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })
    this._bossIdleTween = this.tweens.add({
      targets:  this._bossImg,
      y:        `+=${4}`,
      duration:  900,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })
  }

  // ── HP bars ───────────────────────────────────────────────────────────────────

  _buildHPBars(heroName, heroColor, heroHP, heroMaxHP, bossName, bossColor, bossHP, bossMaxHP) {
    const { width, height } = this.scale
    const barW = Math.round(width * HP_BAR_W_NORM)
    const barY = Math.round(height * HP_Y_NORM)

    this._heroBar?.destroy()
    this._heroBar = new CanvasHealthBar(
      this,
      Math.round(width * HP_HERO_X_NORM), barY,
      barW, HP_BAR_H,
      this._cssHexToInt(heroColor),
      heroName,
      'left',
    )
    this._heroBar.setHP(heroHP, heroMaxHP)

    this._bossBar?.destroy()
    this._bossBar = new CanvasHealthBar(
      this,
      Math.round(width * HP_BOSS_X_NORM), barY,
      barW, HP_BAR_H,
      this._cssHexToInt(bossColor),
      bossName,
      'right',
    )
    this._bossBar.setHP(bossHP, bossMaxHP)
  }

  _cssHexToInt(hex) {
    return parseInt((hex || '#ffffff').replace('#', ''), 16)
  }

  // ── Particles ─────────────────────────────────────────────────────────────────

  _buildParticleTextures() {
    // Slash mark: two crossing diagonal lines as an 8×8 texture
    if (!this.textures.exists('combat_particle_slash')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.lineStyle(2, 0xffffff, 1)
      g.lineBetween(0, 0, 8, 8)
      g.lineBetween(8, 0, 0, 8)
      g.generateTexture('combat_particle_slash', 8, 8)
      g.destroy()
    }

    // Circle: soft glowing dot as 10×10 texture
    if (!this.textures.exists('combat_particle_dot')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xffffff, 0.9)
      g.fillCircle(5, 5, 5)
      g.generateTexture('combat_particle_dot', 10, 10)
      g.destroy()
    }

    // Star: four-pointed burst 12×12
    if (!this.textures.exists('combat_particle_star')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xffffff, 0.9)
      g.fillTriangle(6, 0, 4, 5, 8, 5)
      g.fillTriangle(6, 12, 4, 7, 8, 7)
      g.fillTriangle(0, 6, 5, 4, 5, 8)
      g.fillTriangle(12, 6, 7, 4, 7, 8)
      g.generateTexture('combat_particle_star', 12, 12)
      g.destroy()
    }
  }

  _buildParticleEmitters() {
    // All emitters share the dot texture; tint is supplied at burst-time.
    // They start with quantity 0 and emitting:false so they are dormant.
    const base = {
      alpha:    { start: 1, end: 0 },
      scale:    { start: 1, end: 0.1 },
      quantity: 0,
      emitting: false,
    }

    this._emitterSlash = this.add.particles(0, 0, 'combat_particle_slash', {
      ...base,
      speedX: { min: -180, max: 180 },
      speedY: { min: -200, max: -60 },
      rotate: { min: 0, max: 360 },
      lifespan: 500,
    }).setDepth(DEPTH_PARTICLES)

    this._emitterSpell = this.add.particles(0, 0, 'combat_particle_dot', {
      ...base,
      speedX:  { min: -240, max: 240 },
      speedY:  { min: -240, max: -80 },
      scale:   { start: 1.2, end: 0 },
      lifespan: 700,
    }).setDepth(DEPTH_PARTICLES)

    this._emitterImpact = this.add.particles(0, 0, 'combat_particle_star', {
      ...base,
      speedX:   { min: -280, max: 280 },
      speedY:   { min: -260, max: 40 },
      gravityY: 180,
      lifespan:  600,
    }).setDepth(DEPTH_PARTICLES)

    this._emitterLightning = this.add.particles(0, 0, 'combat_particle_dot', {
      ...base,
      speedX:   { min: -60, max: 60 },
      speedY:   { min: -320, max: -100 },
      scaleX:   { start: 0.4, end: 0.1 },
      scaleY:   { start: 2.0, end: 0.2 },
      lifespan:  400,
    }).setDepth(DEPTH_PARTICLES)

    this._emitterFire = this.add.particles(0, 0, 'combat_particle_dot', {
      ...base,
      speedX:   { min: -80, max: 80 },
      speedY:   { min: -300, max: -120 },
      scale:    { start: 1.5, end: 0 },
      alpha:    { start: 0.9, end: 0 },
      lifespan:  650,
    }).setDepth(DEPTH_PARTICLES)
  }

  _burstParticles(type, x, y, color, isCrit) {
    const colorInt = this._cssHexToInt(color)
    const count    = isCrit ? (this._reduceEffects ? 6 : 18) : (this._reduceEffects ? 4 : 12)

    const emitterMap = {
      slash:     this._emitterSlash,
      spell:     this._emitterSpell,
      impact:    this._emitterImpact,
      lightning: this._emitterLightning,
      fire:      this._emitterFire,
    }
    const emitter = emitterMap[type] || this._emitterSpell
    emitter.setPosition(x, y)
    emitter.setParticleTint(colorInt)
    emitter.explode(count)
  }

  // ── Screen flash ─────────────────────────────────────────────────────────────

  _screenFlash(color) {
    const colorInt = this._cssHexToInt(color)
    this._flashGfx.clear()
    this._flashGfx.fillStyle(colorInt, 0.5)
    const { width, height } = this.scale
    this._flashGfx.fillRect(0, 0, width, height)
    this._flashGfx.setAlpha(0.6)
    this.tweens.add({
      targets:  this._flashGfx,
      alpha:    0,
      duration: 300,
      ease:     'Power2',
    })
  }

  // ── Damage numbers ────────────────────────────────────────────────────────────

  _spawnDamageNumber(value, x, y, color, isCrit) {
    const txt = this._dmgNumPool?.acquire()
    if (!txt) return

    const colorInt = this._cssHexToInt(color)
    const hexStr   = '#' + colorInt.toString(16).padStart(6, '0')

    txt.setPosition(x, y)
    txt.setText(`${isCrit ? 'CRIT! ' : ''}-${value}`)
    txt.setStyle({
      color:           hexStr,
      fontSize:        isCrit ? '32px' : '26px',
      strokeThickness: 3,
    })
    txt.setAlpha(1)
    txt.setScale(isCrit ? 0.3 : 0.5)
    txt.setVisible(true)

    this.tweens.add({
      targets:  txt,
      y:        y - 80,
      alpha:    0,
      scale:    isCrit ? 2.0 : 1.4,
      duration: this._reduceEffects ? 800 : 1400,
      ease:     'Power2.easeOut',
      onComplete: () => {
        txt.setVisible(false)
        this._dmgNumPool?.release(txt)
      },
    })
  }

  // ── Attack label ──────────────────────────────────────────────────────────────

  _spawnAttackLabel(text, color, x, y) {
    const lbl = this._attackLabelPool?.acquire()
    if (!lbl) return

    const hexStr = '#' + this._cssHexToInt(color).toString(16).padStart(6, '0')
    lbl.setPosition(x, y)
    lbl.setText(text.toUpperCase())
    lbl.setStyle({ color: hexStr, letterSpacing: 2 })
    lbl.setAlpha(0)
    lbl.setScale(0.5)
    lbl.setVisible(true)

    this.tweens.add({
      targets:  lbl,
      alpha:    1,
      scale:    1,
      y:        y - 10,
      duration: this._reduceEffects ? 150 : 300,
      ease:     'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets:  lbl,
          alpha:    0,
          y:        y - 30,
          duration: this._reduceEffects ? 200 : 400,
          delay:    500,
          onComplete: () => {
            lbl.setVisible(false)
            this._attackLabelPool?.release(lbl)
          },
        })
      },
    })
  }

  // ── Timer bar ─────────────────────────────────────────────────────────────────

  _startTimerBar(durationMs) {
    const { width } = this.scale
    this._timerTrackGfx.clear()
    this._timerTrackGfx.fillStyle(0x111122, 0.6)
    this._timerTrackGfx.fillRect(0, 0, width, TIMER_H)
    this._timerTrackGfx.setVisible(true)
    this._timerFillGfx.setVisible(true)
    this._timerStart    = this.time.now
    this._timerDuration = durationMs
    this._timerActive   = true
    this._drawTimerBar(1.0)
  }

  _stopTimerBar() {
    this._timerActive = false
    this._timerFillGfx.clear()
    this._timerTrackGfx.setVisible(false)
    this._timerFillGfx.setVisible(false)
  }

  _drawTimerBar(pct) {
    const { width } = this.scale
    const fillW     = Math.round(width * pct)
    const color     = pct > 0.3 ? 0x3b82f6 : 0xef4444
    this._timerFillGfx.clear()
    if (fillW > 0) {
      this._timerFillGfx.fillStyle(color, 0.85)
      this._timerFillGfx.fillRect(0, 0, fillW, TIMER_H)
    }
  }

  // ── Result overlay ────────────────────────────────────────────────────────────

  _buildResultOverlay() {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    // Semi-transparent panel background
    this._resultPanelGfx = this.add.graphics()
      .setDepth(DEPTH_OVERLAY)
      .setAlpha(0)
      .setVisible(false)
    this._resultPanelGfx.fillStyle(0x000000, 0.75)
    this._resultPanelGfx.fillRoundedRect(cx - 130, cy - 70, 260, 140, 16)

    // Main outcome text (VICTORY! / DEFEAT…)
    this._resultTitleTxt = this.add.text(cx, cy - 30, '', {
      fontFamily: FONT_HUD,
      fontSize:   `${Math.round(width * 0.055)}px`,
      fontStyle:  'bold',
      color:      '#fbbf24',
      stroke:     '#78350f',
      strokeThickness: 3,
      align:      'center',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY).setAlpha(0).setVisible(false)

    // Sub-title
    this._resultSubTxt = this.add.text(cx, cy + 10, '', {
      fontFamily: FONT_COMBAT,
      fontSize:   '16px',
      fontStyle:  'bold',
      color:      '#e0e0e0',
      align:      'center',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY).setAlpha(0).setVisible(false)

    // Reward line
    this._resultRewardTxt = this.add.text(cx, cy + 36, '', {
      fontFamily: FONT_HUD,
      fontSize:   '20px',
      fontStyle:  'bold',
      color:      '#fbbf24',
      align:      'center',
    }).setOrigin(0.5).setDepth(DEPTH_OVERLAY).setAlpha(0).setVisible(false)
  }

  _showResultOverlay(outcome, bossName, rewardCoins) {
    const isVictory = outcome === 'victory'

    const titleText  = isVictory ? 'VICTORY!' : 'DEFEATED...'
    const titleColor = isVictory ? '#fbbf24' : '#ef4444'
    const subText    = isVictory
      ? `${bossName} defeated!`
      : 'The enemy proved too strong...'
    const rewardText = isVictory ? `+${rewardCoins} Gold!` : ''

    this._resultTitleTxt.setText(titleText).setStyle({ color: titleColor })
    this._resultSubTxt.setText(subText)
    this._resultRewardTxt.setText(rewardText)

    // Reveal panel and texts with a tween
    this._resultPanelGfx.setVisible(true)
    this._resultTitleTxt.setVisible(true)
    this._resultSubTxt.setVisible(true)
    this._resultRewardTxt.setVisible(true)

    this.tweens.add({
      targets:  [this._resultPanelGfx, this._resultTitleTxt, this._resultSubTxt, this._resultRewardTxt],
      alpha:    1,
      duration: this._reduceEffects ? 200 : 500,
      ease:     'Power2.easeOut',
    })

    // Scale bounce on title
    if (!this._reduceEffects) {
      this._resultTitleTxt.setScale(0.3)
      this.tweens.add({
        targets:  this._resultTitleTxt,
        scale:    1,
        duration: 500,
        ease:     'Back.easeOut(2)',
      })
    }

    // Confetti on victory
    if (isVictory && this._confettiEmitter?.active) {
      this._confettiEmitter.explode(50)
      this.time.delayedCall(300, () => {
        if (this._confettiEmitter?.active) this._confettiEmitter.explode(50)
      }, [], this)
    }
  }

  _hideResultOverlay() {
    this._resultPanelGfx.setVisible(false).setAlpha(0)
    this._resultTitleTxt.setVisible(false).setAlpha(0)
    this._resultSubTxt.setVisible(false).setAlpha(0)
    this._resultRewardTxt.setVisible(false).setAlpha(0)
  }

  // ── Confetti emitter ─────────────────────────────────────────────────────────

  _buildConfettiEmitter() {
    const { width, height } = this.scale

    if (!this.textures.exists('combat_confetti')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(0xffffff)
      g.fillRect(0, 0, 8, 5)
      g.generateTexture('combat_confetti', 8, 5)
      g.destroy()
    }

    this._confettiEmitter = this.add.particles(width / 2, height * 0.1, 'combat_confetti', {
      x:        { min: -width / 2, max: width / 2 },
      speedY:   { min: 100, max: 300 },
      speedX:   { min: -120, max: 120 },
      gravityY: 200,
      rotate:   { min: 0, max: 360 },
      scale:    { min: 0.8, max: 1.6 },
      alpha:    { start: 1, end: 0 },
      lifespan: 2500,
      tint:     [0xff4444, 0xff8800, 0xffdd00, 0x44dd44, 0x00ddff, 0x4488ff, 0xaa44ff, 0xff44cc],
      quantity: 0,
      emitting: false,
    }).setDepth(DEPTH_OVERLAY + 5)
  }

  // ── Combat lifecycle ──────────────────────────────────────────────────────────

  _startCombat(payload) {
    const {
      hero, heroColor, bossName, bossColor,
      heroHP, heroMaxHP, bossHP, bossMaxHP,
      gameType, reduceEffects,
    } = payload

    this._heroName      = hero
    this._heroColor     = heroColor
    this._bossName      = bossName
    this._bossColor     = bossColor
    this._heroHP        = heroHP
    this._heroMaxHP     = heroMaxHP
    this._bossHP        = bossHP
    this._bossMaxHP     = bossMaxHP
    this._gameType      = gameType
    this._reduceEffects = !!reduceEffects

    const { width, height } = this.scale

    // Reset fighter positions
    this._heroImg.setPosition(width * HERO_X_NORM, height * FIGHTER_Y)
    this._bossImg.setPosition(width * BOSS_X_NORM, height * FIGHTER_Y)

    // Swap fighter textures
    const heroKey = this._getHeroTextureKey(hero)
    if (heroKey) {
      this._heroImg.setTexture(heroKey).setDisplaySize(90, 90)
    } else {
      // Procedural fallback: coloured rect with name initial
      this._heroImg.setTexture('__DEFAULT').setDisplaySize(90, 90)
    }
    this._heroImg.setVisible(true).setAlpha(0)

    const bossKey = this._getBossTextureKey(bossName)
    if (bossKey) {
      this._bossImg.setTexture(bossKey).setDisplaySize(100, 120)
    } else {
      this._bossImg.setTexture('__DEFAULT').setDisplaySize(100, 120)
    }
    this._bossImg.setVisible(true).setAlpha(0)

    // Build HP bars
    this._buildHPBars(hero, heroColor, heroHP, heroMaxHP, bossName, bossColor, bossHP, bossMaxHP)

    // Hide result overlay from any previous fight
    this._hideResultOverlay()

    // Ensure confetti emitter exists
    if (!this._confettiEmitter) {
      this._buildConfettiEmitter()
    }

    // Stop any lingering idle tweens from last fight
    this._stopFighterIdle()

    // ── Intro slide-in tween ─────────────────────────────────────────────────
    const introDur = this._reduceEffects ? 350 : 700

    const heroStartX = -100
    const bossStartX = width + 100

    this._heroImg.setX(heroStartX)
    this._bossImg.setX(bossStartX)

    this.tweens.add({
      targets:  this._heroImg,
      x:        width * HERO_X_NORM,
      alpha:    1,
      duration: introDur,
      ease:     'Power3.easeOut',
    })

    this.tweens.add({
      targets:  this._bossImg,
      x:        width * BOSS_X_NORM,
      alpha:    1,
      duration: introDur,
      ease:     'Power3.easeOut',
      onComplete: () => {
        // Show FIGHT! text
        this._vsText.setAlpha(0).setScale(3).setVisible(true)
        this.tweens.add({
          targets:  this._vsText,
          alpha:    1,
          scale:    1,
          duration: this._reduceEffects ? 200 : 400,
          ease:     'Back.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets:  this._vsText,
              alpha:    0,
              delay:    500,
              duration: this._reduceEffects ? 150 : 300,
              onComplete: () => {
                this._vsText.setVisible(false)
                this._startFighterIdle()

                // Start timer bar if timed game type
                if (this._gameType === 'timed') {
                  const timeLimit = payload.timeLimit || 10
                  this._startTimerBar(timeLimit * 1000)
                }

                // Signal React that the arena is ready for answer buttons
                GameEventBus.emit('combat:ui-ready', {})
              },
            })
          },
        })
      },
    })
  }

  _onHpUpdate({ heroHP, bossHP }) {
    this._heroHP = heroHP
    this._bossHP = bossHP
    this._heroBar?.setHP(heroHP, this._heroMaxHP)
    this._bossBar?.setHP(bossHP, this._bossMaxHP)
  }

  _onPlayerAttack({ damage, isCrit, attackType, color }) {
    const { width, height } = this.scale
    const bossX = this._bossImg.x
    const bossY = this._bossImg.y

    this._spawnAttackLabel(
      isCrit ? `CRIT ${attackType}!` : attackType,
      color,
      width / 2,
      height * 0.15,
    )

    // Hero lunge towards boss
    const heroOrigX = this._heroImg.x
    if (!this._reduceEffects) {
      this.tweens.add({
        targets:  this._heroImg,
        x:        heroOrigX + 80,
        y:        this._heroImg.y - 10,
        scaleX:   1.15,
        duration: 200,
        ease:     'Power3.easeIn',
        yoyo:     true,
        hold:     80,
        onComplete: () => {
          this._heroImg.setX(heroOrigX)
          this._heroImg.setScale(1)
        },
      })
    } else {
      this.tweens.add({
        targets:  this._heroImg,
        x:        heroOrigX + 55,
        scaleX:   1.08,
        duration: 120,
        ease:     'Power3.easeIn',
        yoyo:     true,
        onComplete: () => { this._heroImg.setX(heroOrigX).setScale(1) },
      })
    }

    // Impact at boss after lunge delay
    const delay = this._reduceEffects ? 180 : 280
    this.time.delayedCall(delay, () => {
      this._burstParticles(attackType || 'spell', bossX, bossY, color, isCrit)
      this._screenFlash(color)
      if (!this._reduceEffects) this.cameras.main.shake(200, 0.008)

      // Boss recoil
      this.tweens.add({
        targets:  this._bossImg,
        x:        bossX + 15,
        scaleX:   0.9,
        duration: 100,
        ease:     'Power3.easeOut',
        yoyo:     true,
        onComplete: () => { this._bossImg.setX(bossX).setScaleX(1) },
      })

      this._spawnDamageNumber(damage, bossX, bossY - 30, color, isCrit)
    }, [], this)
  }

  _onBossAttack({ damage }) {
    const { width, height } = this.scale
    const heroX = this._heroImg.x
    const heroY = this._heroImg.y
    const bossOrigX = this._bossImg.x

    this._spawnAttackLabel('Boss Strike!', '#ef4444', width / 2, height * 0.15)

    // Boss lunge towards hero
    if (!this._reduceEffects) {
      this.tweens.add({
        targets:  this._bossImg,
        x:        bossOrigX - 60,
        y:        this._bossImg.y - 5,
        scaleX:   1.1,
        duration: 180,
        ease:     'Power3.easeIn',
        yoyo:     true,
        hold:     60,
        onComplete: () => {
          this._bossImg.setX(bossOrigX)
          this._bossImg.setScale(1)
        },
      })
    } else {
      this.tweens.add({
        targets:  this._bossImg,
        x:        bossOrigX - 45,
        scaleX:   1.05,
        duration: 120,
        ease:     'Power3.easeIn',
        yoyo:     true,
        onComplete: () => { this._bossImg.setX(bossOrigX).setScale(1) },
      })
    }

    // Impact at hero
    const delay = this._reduceEffects ? 180 : 240
    this.time.delayedCall(delay, () => {
      this._burstParticles('impact', heroX, heroY, '#ef4444', false)
      this._screenFlash('#ef4444')
      if (!this._reduceEffects) this.cameras.main.shake(180, 0.007)

      // Hero recoil
      this.tweens.add({
        targets:  this._heroImg,
        x:        heroX - 15,
        scaleX:   0.92,
        duration: 100,
        ease:     'Power3.easeOut',
        yoyo:     true,
        onComplete: () => { this._heroImg.setX(heroX).setScaleX(1) },
      })

      this._spawnDamageNumber(damage, heroX, heroY - 30, '#ef4444', false)
    }, [], this)
  }

  _onCombatEnd({ outcome, rewardCoins }) {
    this._stopTimerBar()
    this._stopFighterIdle()

    // Brief pause then show overlay, then sleep after the player has time to read
    this.time.delayedCall(this._reduceEffects ? 300 : 600, () => {
      this._showResultOverlay(outcome, this._bossName, rewardCoins)

      // Sleep scene after overlay is visible for ~2 s
      this.time.delayedCall(2200, () => {
        this.scene.sleep()
      }, [], this)
    }, [], this)
  }
}
