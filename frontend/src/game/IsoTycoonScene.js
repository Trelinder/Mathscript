import * as Phaser from 'phaser'

/**
 * IsoTycoonScene — MathScript Tycoon Isometric View
 * ─────────────────────────────────────────────────────────────────────────────
 * Hardware-accelerated (WebGL via Phaser.AUTO) isometric view.  Strictly a
 * "dumb client" — renders state, never modifies backend logic.
 *
 * COMMANDS IMPLEMENTED
 * ─────────────────────
 *  Task 1  — Phaser init, dark #1a1a2e background, monospace HUD.
 *  Task 2  — Isometric 5×5 grid; hero spritesheet; idle / working anims.
 *  Task 3  — Async _fetchStatus() polled every 3 s via Phaser TimerEvent.
 *  Task 4  — is_boosting drives Production animation + Production Rate colour.
 *  Task 5  — Three distinct workstations (Production / Logistics / Sales) each
 *             with a unique machine sprite and independent animations driven by
 *             a workstations[] array in the polling response.
 *  Task 6  — Phaser pointer events on each workstation; click shows a Phaser
 *             Container popup (level, cost, Upgrade button, x close).
 *  Task 7  — Async POST /api/tycoon/upgrade; 400 -> coin flash + shake tween;
 *             200 -> particle burst at workstation + immediate re-poll.
 *
 * WIRING INTO A PHASER GAME
 * ─────────────────────────
 *  import IsoTycoonScene from './IsoTycoonScene'
 *
 *  new Phaser.Game({
 *    type:            Phaser.AUTO,
 *    backgroundColor: '#1a1a2e',
 *    parent:          'iso-game-container',
 *    scale: {
 *      mode:       Phaser.Scale.FIT,
 *      autoCenter: Phaser.Scale.CENTER_BOTH,
 *      width:  800,
 *      height: 600,
 *    },
 *    scene: [IsoTycoonScene],
 *  })
 *
 * ASSET FALLBACK POLICY
 * ─────────────────────
 *  All textures generated programmatically when real PNG files are absent.
 *  Drop-in replacements (no code change needed):
 *    /public/assets/tile.png        64x32  isometric diamond
 *    /public/assets/hero_iso.png    8-frame spritesheet 48x64 per frame
 *    /public/assets/server_iso.png  8-frame spritesheet 40x56 per frame
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Isometric grid ───────────────────────────────────────────────────────────
const TILE_W    = 64
const TILE_H    = 32
const GRID_COLS = 5
const GRID_ROWS = 5

// ─── Hero spritesheet (Production + Sales characters) ────────────────────────
const HERO_FRAME_W = 48
const HERO_FRAME_H = 64
const HERO_FRAMES  = 8   // 4 idle (0-3) + 4 working (4-7)

// ─── Server spritesheet (Logistics machine) ───────────────────────────────────
const SVR_FRAME_W  = 40
const SVR_FRAME_H  = 56
const SVR_FRAMES   = 8   // 4 idle-blink (0-3) + 4 active-blink (4-7)

// ─── Three Pillars — workstation definitions (Task 5) ────────────────────────
//
//  col/row      : tile coordinates on the 5x5 isometric grid
//  spriteKey    : texture key for the animated character / machine sprite
//  animIdle/Work: Phaser animation keys — unique per pillar
//  accentNum/Str: accent colour as number (for tints) and string (for text)
//  machineKey   : small desk/rack backdrop texture beneath the sprite
//  baseCost     : coin cost at level 1; formula = baseCost * 1.5^(level-1)
//
const WORKSTATION_DEFS = [
  {
    id: 'production', label: 'PRODUCTION', desc: 'Dev Desk',
    col: 0, row: 2,
    spriteKey: 'hero_iso',
    animIdle: 'prod_idle', animWork: 'prod_working',
    idleFrames: { start: 0, end: 3 }, workFrames: { start: 4, end: 7 },
    idleFps: 4, workFps: 10,
    accentNum: 0x7c3aed, accentStr: '#7c3aed',
    machineKey: 'desk_prod', baseCost: 50,
  },
  {
    id: 'logistics', label: 'LOGISTICS', desc: 'Server Rack',
    col: 2, row: 2,
    spriteKey: 'server_iso',
    animIdle: 'log_idle', animWork: 'log_working',
    idleFrames: { start: 0, end: 3 }, workFrames: { start: 4, end: 7 },
    idleFps: 2, workFps: 12,  // slow idle blink, rapid active blink
    accentNum: 0x0ea5e9, accentStr: '#0ea5e9',
    machineKey: 'desk_log', baseCost: 120,
  },
  {
    id: 'sales', label: 'SALES', desc: 'Trading Desk',
    col: 4, row: 2,
    spriteKey: 'hero_iso',
    animIdle: 'sales_idle', animWork: 'sales_working',
    idleFrames: { start: 0, end: 3 }, workFrames: { start: 4, end: 7 },
    idleFps: 4, workFps: 10,
    accentNum: 0x22c55e, accentStr: '#22c55e',
    machineKey: 'desk_sales', baseCost: 200,
  },
]

// ─── API endpoints ────────────────────────────────────────────────────────────
// Vite proxies /api -> http://localhost:8000 in dev.
// For raw local testing: 'http://127.0.0.1:8000/api/tycoon/status'
const STATUS_URL   = '/api/tycoon/status'
const UPGRADE_URL  = '/api/tycoon/upgrade'

// ─── Timing ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL   = 3_000
const FETCH_TIMEOUT   = 5_000
const UPGRADE_TIMEOUT = 8_000
const COIN_FLASH_MS   = 900

// ─── HUD colours ──────────────────────────────────────────────────────────────
const CLR_TEXT       = '#e2e8f0'
const CLR_PROD_BOOST = '#ff0055'
const CLR_COIN       = '#fbbf24'
const CLR_BOOST_ON   = '#facc15'
const CLR_DIM        = '#475569'
const CLR_ERROR      = '#ef4444'

// ─── Upgrade cost: baseCost * 1.5^(level-1) ──────────────────────────────────
const upgradeCost = (baseCost, level) =>
  Math.ceil(baseCost * Math.pow(1.5, Math.max(0, level - 1)))

// ─────────────────────────────────────────────────────────────────────────────
export default class IsoTycoonScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IsoTycoonScene' })
    this._assetsMissing = new Set()
    this._isBoosting    = false   // legacy Task-4 state for Production
    this._polling       = false
    this._popup         = null    // active popup Container | null
    this._popupBlocker  = null    // full-screen click-blocker rect | null
    this._particles     = null    // shared ParticleEmitter for bursts
    /** @type {Array<{def:object,level:number,isWorking:boolean,sprite:Phaser.GameObjects.Sprite,screenX:number,screenY:number}>} */
    this._workstations  = []
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — preload  (Tasks 1 + 2 + 5)
  // ═══════════════════════════════════════════════════════════════════════════

  preload() {
    this.load.on('loaderror', (file) => {
      this._assetsMissing.add(file.key)
      console.debug('[IsoTycoonScene] Asset unavailable, using procedural fallback:', file.key)
    })

    // Floor tile (isometric diamond, 64x32)
    this.load.image('tile', '/assets/tile.png')

    // Hero spritesheet: Production + Sales characters (8 frames, 48x64 each)
    this.load.spritesheet('hero_iso', '/assets/hero_iso.png', {
      frameWidth: HERO_FRAME_W, frameHeight: HERO_FRAME_H,
    })

    // Server spritesheet: Logistics machine (8 frames, 40x56 each)
    this.load.spritesheet('server_iso', '/assets/server_iso.png', {
      frameWidth: SVR_FRAME_W, frameHeight: SVR_FRAME_H,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — create  (Tasks 1 + 2 + 5 + 6 + 7)
  // ═══════════════════════════════════════════════════════════════════════════

  create() {
    const { width, height } = this.scale

    // Dark background (#1a1a2e)
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0, 0)

    // Procedural texture fallbacks (no-ops when real PNGs loaded)
    this._generateFallbackTextures()

    // 5x5 isometric floor grid
    this._buildIsoGrid()

    // Three workstations with interactive click zones (Tasks 5 + 6)
    this._buildWorkstations()

    // HUD panel (Task 1)
    this._buildHUD()

    // Shared particle emitter for upgrade bursts (Task 7)
    this._buildParticleEmitter()

    // Begin polling (Tasks 3 + 4 + 5)
    this._startPolling()
  }

  // eslint-disable-next-line no-unused-vars
  update(_time, _delta) {
    // All logic is event-driven (timer callbacks + tweens).
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — procedural texture generation  (Tasks 2 + 5)
  // ═══════════════════════════════════════════════════════════════════════════

  _generateFallbackTextures() {
    if (this._assetsMissing.has('tile')       || !this.textures.exists('tile'))       this._genTile()
    if (this._assetsMissing.has('hero_iso')   || !this.textures.exists('hero_iso'))   this._genHeroSheet()
    if (this._assetsMissing.has('server_iso') || !this.textures.exists('server_iso')) this._genServerSheet()
    this._genMachineSprites()
    this._genParticleTexture()
  }

  // ── Floor tile — isometric diamond with highlight ─────────────────────────
  _genTile() {
    const g  = this.make.graphics({ x: 0, y: 0, add: false })
    const hw = TILE_W / 2, hh = TILE_H / 2

    g.fillStyle(0x1e3a5f, 1)
    g.fillPoints([{ x: hw, y: 0 }, { x: TILE_W, y: hh }, { x: hw, y: TILE_H }, { x: 0, y: hh }], true)
    g.fillStyle(0x2d5a8e, 0.55)
    g.fillPoints([{ x: hw, y: 4 }, { x: TILE_W - 4, y: hh }, { x: hw, y: TILE_H - 4 }, { x: 4, y: hh }], true)
    g.lineStyle(1, 0x0d2b4a, 0.85)
    g.beginPath()
    g.moveTo(hw, 0); g.lineTo(TILE_W, hh); g.lineTo(hw, TILE_H); g.lineTo(0, hh)
    g.closePath(); g.strokePath()

    g.generateTexture('tile', TILE_W, TILE_H)
    g.destroy()
  }

  /**
   * _genHeroSheet
   *
   * 8-frame hero spritesheet (48x64 px/frame, 384x64 total).
   * Frames 0-3: idle bob.  Frames 4-7: typing with arms raised.
   * Used for Production (purple tint) and Sales (green tint) workstations.
   */
  _genHeroSheet() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    for (let f = 0; f < HERO_FRAMES; f++) {
      const fx      = f * HERO_FRAME_W
      const working = f >= 4
      const bob     = Math.round(Math.sin((f % 4) * (Math.PI / 2)) * 2)
      const by      = 18 + bob

      g.fillStyle(working ? 0xfde68a : 0xfbbf24, 1); g.fillCircle(fx + 24, by, 10)
      g.fillStyle(0x0ea5e9, 1);                        g.fillRect(fx + 18, by - 3, 12, 4)
      g.fillStyle(working ? 0x0ea5e9 : 0x3b82f6, 1);  g.fillRoundedRect(fx + 15, by + 10, 18, 16, 3)

      g.fillStyle(working ? 0xfde68a : 0x60a5fa, 1)
      if (working) {
        const ab = Math.round(Math.sin((f % 4) * Math.PI) * 4)
        g.fillRect(fx + 6,  by + 10 - ab, 8, 12)
        g.fillRect(fx + 34, by + 10 - ab, 8, 12)
      } else {
        g.fillRect(fx + 6,  by + 12, 8, 14)
        g.fillRect(fx + 34, by + 12, 8, 14)
      }

      const ls = working ? Math.round(Math.sin((f % 4) * (Math.PI / 2)) * 3) : 0
      g.fillStyle(0x1e3a5f, 1)
      g.fillRect(fx + 16, by + 26, 8, 14 + ls)
      g.fillRect(fx + 25, by + 26, 8, 14 - ls)
      g.fillStyle(0x0f172a, 1)
      g.fillRect(fx + 14, by + 40 + ls, 10, 4)
      g.fillRect(fx + 25, by + 40 - ls, 10, 4)
    }

    g.generateTexture('hero_iso', HERO_FRAME_W * HERO_FRAMES, HERO_FRAME_H)
    g.destroy()
    const tex = this.textures.get('hero_iso')
    for (let i = 0; i < HERO_FRAMES; i++) tex.add(i, 0, i * HERO_FRAME_W, 0, HERO_FRAME_W, HERO_FRAME_H)
  }

  /**
   * _genServerSheet (Task 5 — Logistics workstation)
   *
   * 8-frame server rack (40x56 px/frame, 320x56 total).
   * Frames 0-3: idle — single LED row cycling green (slow).
   * Frames 4-7: active — multi-colour LED storm (fast).
   */
  _genServerSheet() {
    const g   = this.make.graphics({ x: 0, y: 0, add: false })
    const fw  = SVR_FRAME_W, fh = SVR_FRAME_H
    const ledRows = [10, 22, 34, 46]
    const ledCols = [6, 12, 18, 24, 30]

    for (let f = 0; f < SVR_FRAMES; f++) {
      const fx      = f * fw
      const working = f >= 4

      // Rack body
      g.fillStyle(0x1e293b, 1)
      g.fillRoundedRect(fx + 2, 2, fw - 4, fh - 4, 4)
      g.lineStyle(1, working ? 0x0ea5e9 : 0x334155, 1)
      g.strokeRoundedRect(fx + 2, 2, fw - 4, fh - 4, 4)

      // Drive-bay dividers
      g.lineStyle(1, 0x0d1a2e, 0.7)
      ledRows.forEach((ly) => {
        g.beginPath(); g.moveTo(fx + 4, ly - 4); g.lineTo(fx + fw - 4, ly - 4); g.strokePath()
      })

      // LED indicators
      ledRows.forEach((ly, ri) => {
        ledCols.forEach((lx, ci) => {
          let col = 0x1a2535   // off
          if (working) {
            col = [0x00ff88, 0x00ccff, 0xff6600, 0xff2288][(ri + ci + f) % 4]
          } else {
            col = ri === (f % 4) ? 0x22c55e : 0x1a2535
          }
          g.fillStyle(col, 1)
          g.fillRect(fx + lx, ly, 4, 4)
        })
      })

      // Power LED (top-right)
      g.fillStyle(working ? 0x00ff88 : 0x334155, 1)
      g.fillCircle(fx + fw - 8, 8, 3)
    }

    g.generateTexture('server_iso', SVR_FRAME_W * SVR_FRAMES, SVR_FRAME_H)
    g.destroy()
    const tex = this.textures.get('server_iso')
    for (let i = 0; i < SVR_FRAMES; i++) tex.add(i, 0, i * SVR_FRAME_W, 0, SVR_FRAME_W, SVR_FRAME_H)
  }

  /**
   * _genMachineSprites (Task 5)
   *
   * Small isometric-style machine-base sprites for each workstation:
   * purple developer desk, blue server cabinet, green trading counter.
   * They sit ON the floor tiles, beneath the character/machine sprite.
   */
  _genMachineSprites() {
    const cfgs = [
      { key: 'desk_prod',  colour: 0x312e81, w: 52, h: 24 },
      { key: 'desk_log',   colour: 0x0c4a6e, w: 44, h: 44 },
      { key: 'desk_sales', colour: 0x14532d, w: 56, h: 20 },
    ]
    cfgs.forEach(({ key, colour, w, h }) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      g.fillStyle(colour, 1);    g.fillRoundedRect(4, 4, w - 8, h - 8, 4)
      g.fillStyle(0xffffff, 0.07); g.fillRect(6, 6, w - 12, 4)
      g.lineStyle(1, colour + 0x111111, 0.9); g.strokeRoundedRect(4, 4, w - 8, h - 8, 4)
      g.generateTexture(key, w, h)
      g.destroy()
    })
  }

  // ── Gold particle dot for the coin-burst emitter ──────────────────────────
  _genParticleTexture() {
    if (this.textures.exists('iso_particle')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xfbbf24, 1); g.fillCircle(4, 4, 4)
    g.generateTexture('iso_particle', 8, 8)
    g.destroy()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — isometric grid  (Task 2)
  // ═══════════════════════════════════════════════════════════════════════════

  _buildIsoGrid() {
    const { width, height } = this.scale
    this._isoOriginX = width  / 2
    this._isoOriginY = height * 0.26

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = this._isoPos(col, row)
        this.add
          .image(x, y, 'tile').setOrigin(0.5, 0.5)
          .setTint((col + row) % 2 === 0 ? 0xffffff : 0xaad4ee)
          .setDepth(row * GRID_COLS + col)
      }
    }
  }

  /**
   * 2:1 isometric projection — grid (col, row) -> canvas (x, y).
   * @param {number} col @param {number} row
   * @returns {{ x: number, y: number }}
   */
  _isoPos(col, row) {
    return {
      x: this._isoOriginX + (col - row) * (TILE_W / 2),
      y: this._isoOriginY + (col + row) * (TILE_H / 2),
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5 — Three Pillars workstations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildWorkstations
   *
   * Creates three workstation runtime objects — Production, Logistics, Sales.
   * Each gets a machine-base backdrop, an animated sprite, a floating label,
   * and an interactive hit-area that opens the upgrade popup (Task 6).
   *
   * Grid layout (col, row):
   *   Production  (0, 2) — left
   *   Logistics   (2, 2) — centre
   *   Sales       (4, 2) — right
   *
   * All three share the same row=2 so they form a diagonal line in isometric
   * perspective, reading naturally from lower-left to upper-right.
   */
  _buildWorkstations() {
    // Register unique animation keys for each pillar (guarded against re-register)
    WORKSTATION_DEFS.forEach((def) => {
      if (!this.anims.exists(def.animIdle)) {
        this.anims.create({ key: def.animIdle, frames: this.anims.generateFrameNumbers(def.spriteKey, def.idleFrames), frameRate: def.idleFps, repeat: -1 })
      }
      if (!this.anims.exists(def.animWork)) {
        this.anims.create({ key: def.animWork, frames: this.anims.generateFrameNumbers(def.spriteKey, def.workFrames), frameRate: def.workFps, repeat: -1 })
      }
    })

    WORKSTATION_DEFS.forEach((def) => {
      const { x, y } = this._isoPos(def.col, def.row)
      const baseDepth = def.row * GRID_COLS + def.col + 10   // above floor tiles

      // Machine-base backdrop (desk / server cabinet / trading counter)
      this.add
        .image(x, y - TILE_H / 2, def.machineKey)
        .setOrigin(0.5, 1).setDepth(baseDepth)
        .setTint(def.accentNum).setAlpha(0.85)

      // Character / machine animated sprite
      const isServer  = def.spriteKey === 'server_iso'
      const spriteY   = y - TILE_H / 2 - (isServer ? 10 : 4)
      const sprite    = this.add
        .sprite(x, spriteY, def.spriteKey, 0)
        .setOrigin(0.5, 1).setScale(isServer ? 0.95 : 1.05)
        .setDepth(baseDepth + 1).setTint(def.accentNum)

      sprite.play(def.animIdle)

      // Floating workstation label
      this.add
        .text(x, spriteY - (isServer ? 62 : 72), def.label, {
          fontFamily: '"Orbitron", monospace', fontSize: '10px',
          color: def.accentStr, fontStyle: 'bold', align: 'center',
        })
        .setOrigin(0.5, 1).setDepth(baseDepth + 2).setAlpha(0.9)

      // Idle float tween (characters only — servers are stationary machines)
      if (!isServer) {
        this.tweens.add({
          targets: sprite, y: { from: sprite.y, to: sprite.y - 5 },
          duration: 1600 + def.col * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
      }

      // Runtime state (mutated by polling + upgrade responses)
      const runtime = { def, level: 1, isWorking: false, sprite, screenX: x, screenY: spriteY }
      this._workstations.push(runtime)

      // ── Task 6: pointer events — click opens upgrade popup ────────────
      sprite
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => sprite.setAlpha(0.78))
        .on('pointerout',  () => sprite.setAlpha(1.0))
        .on('pointerdown', () => this._buildPopup(runtime))
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1 — HUD
  // ═══════════════════════════════════════════════════════════════════════════

  _buildHUD() {
    const { width, height } = this.scale
    const panelH = Math.round(height * 0.20)
    const panelY = height - panelH
    const D      = 200   // HUD depth — above tiles + workstations, below popup

    this.add.rectangle(0, panelY, width, panelH, 0x0d1117, 0.90).setOrigin(0, 0).setDepth(D)
    this.add.rectangle(0, panelY, width, 2, 0x1e3a5f).setOrigin(0, 0).setDepth(D)

    const col1 = width * 0.17, col2 = width * 0.50, col3 = width * 0.83
    const lY   = panelY + panelH * 0.20
    const vY   = panelY + panelH * 0.54
    const bY   = panelY + panelH * 0.83

    const lSty = { fontFamily: '"Orbitron", monospace', fontSize: `${Math.round(height * 0.021)}px`, color: CLR_DIM,  align: 'center' }
    const vSty = { fontFamily: '"Orbitron", monospace', fontSize: `${Math.round(height * 0.036)}px`, color: CLR_TEXT, align: 'center', fontStyle: 'bold' }

    this.add.text(col1, lY, 'TOTAL COINS', lSty).setOrigin(0.5).setDepth(D)
    this.add.circle(col1 - 56, vY, 7, 0xfbbf24).setDepth(D)
    this._txtCoins = this.add.text(col1, vY, '0', { ...vSty, color: CLR_COIN }).setOrigin(0.5).setDepth(D)

    this.add.text(col2, lY, 'PRODUCTION /s', lSty).setOrigin(0.5).setDepth(D)
    this._txtProdRate = this.add.text(col2, vY, '0', vSty).setOrigin(0.5).setDepth(D)

    this.add.text(col3, lY, 'STATUS', lSty).setOrigin(0.5).setDepth(D)
    this._txtStatus = this.add.text(col3, vY, 'IDLE', { ...vSty, color: CLR_DIM }).setOrigin(0.5).setDepth(D)
    this._txtBoost  = this.add
      .text(col3, bY, 'BOOST ACTIVE', {
        fontFamily: '"Orbitron", monospace', fontSize: `${Math.round(height * 0.021)}px`,
        color: CLR_BOOST_ON, fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5).setDepth(D).setVisible(false)

    this.tweens.add({ targets: this._txtBoost, alpha: { from: 0.55, to: 1 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this._txtNet = this.add
      .text(width / 2, height - 5, 'Connecting...', {
        fontFamily: '"Rajdhani", sans-serif', fontSize: `${Math.round(height * 0.018)}px`,
        color: CLR_DIM, align: 'center',
      })
      .setOrigin(0.5, 1).setDepth(D)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7 (support) — shared particle emitter
  // ═══════════════════════════════════════════════════════════════════════════

  _buildParticleEmitter() {
    this._particles = this.add.particles(0, 0, 'iso_particle', {
      speed: { min: 60, max: 220 }, scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 }, lifespan: 800, gravityY: 320,
      tint: [0xfbbf24, 0xfde68a, 0xf59e0b, 0xa78bfa],
      quantity: 0, emitting: false,
    }).setDepth(300)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 3 — Backend polling
  // ═══════════════════════════════════════════════════════════════════════════

  _startPolling() {
    if (this._polling) return
    this._polling = true
    this._fetchStatus()
    this.time.addEvent({ delay: POLL_INTERVAL, loop: true, callback: () => { this._fetchStatus() }, callbackScope: this })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASKS 3 + 4 + 5 — Async status fetch
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _fetchStatus
   *
   * Polls GET /api/tycoon/status every POLL_INTERVAL ms.
   * Fires-and-forgets from the Phaser timer; errors surface in the status bar.
   *
   * Expected JSON (all fields optional for backward compat):
   * {
   *   "total_coins":    1234,
   *   "production_rate": 56.7,
   *   "is_boosting":     false,
   *   "workstations": [
   *     { "workstation_id": "production", "is_working": true,  "level": 3 },
   *     { "workstation_id": "logistics",  "is_working": false, "level": 1 },
   *     { "workstation_id": "sales",      "is_working": true,  "level": 2 }
   *   ]
   * }
   */
  async _fetchStatus() {
    const ctrl    = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
    try {
      const res = await fetch(STATUS_URL, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

      const data = await res.json()

      // Task 3: update HUD counters
      this._txtCoins?.setText(this._fmtCoins(data.total_coins ?? 0))
      this._txtProdRate?.setText(`${this._fmtRate(data.production_rate ?? 0)}/s`)
      this._txtNet?.setText(`Updated ${new Date().toLocaleTimeString()}`).setColor(CLR_DIM)

      // Task 4: legacy single-boost state drives Production pillar + HUD
      this._applyBoostState(!!data.is_boosting)

      // Task 5: per-workstation states from backend array
      if (Array.isArray(data.workstations)) this._applyWorkstationStates(data.workstations)

    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error')
      this._txtNet?.setText(`! ${msg}`).setColor(CLR_ERROR)
      console.debug('[IsoTycoonScene] Poll error:', msg)
    } finally {
      clearTimeout(timeout)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 4 — Legacy single boost state
  // ═══════════════════════════════════════════════════════════════════════════

  _applyBoostState(boosting) {
    if (boosting === this._isBoosting) return
    this._isBoosting = boosting
    // Drive the Production workstation animation
    const prod = this._workstations.find(w => w.def.id === 'production')
    if (prod) this._setWorkstationAnim(prod, boosting)
    // HUD indicators
    this._txtProdRate?.setColor(boosting ? CLR_PROD_BOOST : CLR_TEXT)
    this._txtStatus?.setText(boosting ? 'BOOSTING' : 'IDLE').setColor(boosting ? CLR_BOOST_ON : CLR_DIM)
    this._txtBoost?.setVisible(boosting)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5 — Per-workstation animation control
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _applyWorkstationStates
   *
   * Drives each pillar's animation and level independently from the backend
   * workstations array.  Unknown IDs are silently skipped.
   *
   * @param {Array<{workstation_id:string, is_working:boolean, level:number}>} states
   */
  _applyWorkstationStates(states) {
    states.forEach(({ workstation_id, is_working, level }) => {
      const runtime = this._workstations.find(w => w.def.id === workstation_id)
      if (!runtime) return
      if (typeof level === 'number') runtime.level = level
      if (!!is_working !== runtime.isWorking) this._setWorkstationAnim(runtime, !!is_working)
    })
  }

  /**
   * _setWorkstationAnim
   *
   * Switches idle <-> working animation.  Idempotent: no restart if already
   * playing the target animation (prevents frame-reset flicker on every poll).
   *
   * @param {{ def:object, isWorking:boolean, sprite:Phaser.GameObjects.Sprite }} runtime
   * @param {boolean} working
   */
  _setWorkstationAnim(runtime, working) {
    runtime.isWorking    = working
    const targetAnim     = working ? runtime.def.animWork : runtime.def.animIdle
    if (runtime.sprite?.anims.currentAnim?.key !== targetAnim) {
      runtime.sprite?.play(targetAnim, true)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 6 — Upgrade popup
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildPopup
   *
   * Creates a Phaser Container layered above everything else.  The container
   * holds a full-screen dimmer (closes popup on outside click), a dark rounded
   * panel, workstation info, and an interactive Upgrade button.
   *
   * Background animations continue uninterrupted — the popup is purely additive.
   *
   * @param {{ def:object, level:number, screenX:number, screenY:number }} runtime
   */
  _buildPopup(runtime) {
    this._closePopup()   // destroy any existing popup first

    const { width, height } = this.scale
    const def  = runtime.def
    const lvl  = runtime.level
    const cost = upgradeCost(def.baseCost, lvl + 1)
    const PD   = 500   // depth above HUD (200)

    // Full-screen dimmer / click-blocker
    this._popupBlocker = this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.50)
      .setInteractive().setDepth(PD)
      .on('pointerdown', () => this._closePopup())

    // Popup container (centred on canvas)
    const pw = 292, ph = 232
    this._popup = this.add.container(width / 2, height / 2).setDepth(PD + 1)

    // Panel background
    const bg = this.add.graphics()
    bg.fillStyle(0x0d1117, 0.97)
    bg.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 14)
    bg.lineStyle(2, def.accentNum, 0.9)
    bg.strokeRoundedRect(-pw / 2, -ph / 2, pw, ph, 14)
    this._popup.add(bg)

    // Accent top bar
    const topBar = this.add.graphics()
    topBar.fillStyle(def.accentNum, 0.30)
    topBar.fillRoundedRect(-pw / 2, -ph / 2, pw, 36, { tl: 14, tr: 14, bl: 0, br: 0 })
    this._popup.add(topBar)

    // Workstation title
    this._popup.add(this.add.text(0, -ph / 2 + 18, `${def.label}  -  ${def.desc}`, {
      fontFamily: '"Orbitron", monospace', fontSize: '12px',
      color: def.accentStr, fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5))

    // Current level (large)
    this._popup.add(this.add.text(0, -42, `LEVEL  ${lvl}`, {
      fontFamily: '"Orbitron", monospace', fontSize: '30px',
      color: CLR_TEXT, fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5))

    // Upgrade cost
    this._popup.add(this.add.text(0, 8, `Upgrade cost:  ${this._fmtCoins(cost)} coins`, {
      fontFamily: '"Rajdhani", sans-serif', fontSize: '14px', color: CLR_COIN, align: 'center',
    }).setOrigin(0.5))

    // Upgrade button
    const btnBg = this.add.graphics()
    btnBg.fillStyle(def.accentNum, 1)
    btnBg.fillRoundedRect(-78, 46, 156, 40, 8)
    this._popup.add(btnBg)

    const btnZone = this.add.zone(0, 66, 156, 40).setInteractive({ useHandCursor: true })
    btnZone.on('pointerover', () => btnBg.setAlpha(0.72))
    btnZone.on('pointerout',  () => btnBg.setAlpha(1.0))
    btnZone.on('pointerdown', () => this._postUpgrade(def.id, lvl + 1, runtime))
    this._popup.add(btnZone)

    this._popup.add(this.add.text(0, 66, 'UPGRADE', {
      fontFamily: '"Orbitron", monospace', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5))

    // Close (x) button — top-right corner
    const closeTxt = this.add.text(pw / 2 - 18, -ph / 2 + 17, 'x', {
      fontFamily: 'sans-serif', fontSize: '18px', color: CLR_DIM,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
    closeTxt.on('pointerover', () => closeTxt.setColor('#f87171'))
    closeTxt.on('pointerout',  () => closeTxt.setColor(CLR_DIM))
    closeTxt.on('pointerdown', () => this._closePopup())
    this._popup.add(closeTxt)
  }

  _closePopup() {
    this._popup?.destroy();       this._popup        = null
    this._popupBlocker?.destroy(); this._popupBlocker = null
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7 — POST upgrade request + feedback
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _postUpgrade
   *
   * Sends POST /api/tycoon/upgrade with { workstation_id, requested_upgrade_level }.
   *
   *   400 Bad Request — insufficient coins or invalid level.
   *                     Calls _flashCoinsRed() (red flash + horizontal shake).
   *
   *   200 OK          — upgrade accepted.
   *                     Fires _burstParticles() at the workstation, closes the
   *                     popup, then immediately re-polls so the HUD and level
   *                     sync without waiting for the next 3-second interval.
   *
   * @param {string}  workstationId
   * @param {number}  requestedLevel
   * @param {{ def:object, screenX:number, screenY:number }} runtime
   */
  async _postUpgrade(workstationId, requestedLevel, runtime) {
    const ctrl    = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), UPGRADE_TIMEOUT)
    try {
      const res = await fetch(UPGRADE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workstation_id: workstationId, requested_upgrade_level: requestedLevel }),
        signal: ctrl.signal,
      })

      if (res.status === 400) {
        // Insufficient coins / bad request
        this._closePopup()
        this._flashCoinsRed()
        return
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

      // Upgrade successful
      this._closePopup()
      this._burstParticles(runtime.screenX, runtime.screenY)
      this._fetchStatus()   // sync immediately, don't wait for next poll

    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Upgrade timed out' : (err.message || 'Network error')
      this._closePopup()
      this._flashCoinsRed()
      this._txtNet?.setText(`! ${msg}`).setColor(CLR_ERROR)
      console.debug('[IsoTycoonScene] Upgrade error:', msg)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * _flashCoinsRed  (Task 7 — 400 error feedback)
   *
   * Turns the coin counter red and applies a rapid horizontal shake tween,
   * then resets after COIN_FLASH_MS milliseconds.
   */
  _flashCoinsRed() {
    if (!this._txtCoins?.active) return
    const origX = this._txtCoins.x
    this._txtCoins.setColor(CLR_ERROR)
    this.tweens.add({
      targets: this._txtCoins,
      x: { from: origX - 7, to: origX + 7 },
      duration: 55, yoyo: true, repeat: 4, ease: 'Linear',
      onComplete: () => { if (this._txtCoins?.active) this._txtCoins.x = origX },
    })
    this.time.delayedCall(COIN_FLASH_MS, () => { this._txtCoins?.setColor(CLR_COIN) })
  }

  /**
   * _burstParticles  (Task 7 — 200 success feedback)
   *
   * Fires a one-shot coin-coloured particle explosion at the workstation
   * position to celebrate a successful upgrade.
   *
   * @param {number} x  canvas X of workstation sprite
   * @param {number} y  canvas Y of workstation sprite
   */
  _burstParticles(x, y) {
    if (!this._particles?.active) return
    this._particles.setPosition(x, y)
    this._particles.explode(28)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — formatting helpers
  // ═══════════════════════════════════════════════════════════════════════════

  _fmtCoins(n) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return Math.floor(n).toString()
  }

  _fmtRate(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toFixed(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE GAME CONFIG
// ─────────────────────────────────────────────────────────────────────────────
//
//   import Phaser         from 'phaser'
//   import IsoTycoonScene from './IsoTycoonScene'
//
//   new Phaser.Game({
//     type:            Phaser.AUTO,           // WebGL with Canvas fallback
//     backgroundColor: '#1a1a2e',
//     parent:          'iso-game-container',  // id of a <div> in the DOM
//     scale: {
//       mode:       Phaser.Scale.FIT,
//       autoCenter: Phaser.Scale.CENTER_BOTH,
//       width:  800,
//       height: 600,
//     },
//     scene: [IsoTycoonScene],
//   })
//
// STATUS_URL  and UPGRADE_URL use '/api/...' which Vite proxies to
// http://localhost:8000 in dev.  For raw local testing without Vite,
// change them to 'http://127.0.0.1:8000/api/tycoon/...' at the top of this file.

