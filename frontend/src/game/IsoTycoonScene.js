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

// ─── Hero spritesheet — 4-directional walking + idle  (Task 8) ───────────────
//
//  ┌──────────────── hero_iso.png layout ────────────────────────────────────┐
//  │  Row 0 (frames  0- 3): walk SOUTH  (4 frames)                          │
//  │  Row 1 (frames  4- 7): walk EAST   (4 frames)                          │
//  │  Row 2 (frames  8-11): walk NORTH  (4 frames)                          │
//  │  Row 3 (frames 12-15): walk WEST   (4 frames)                          │
//  │  Row 4 (frames 16-19): idle        (4 frames)                          │
//  │                                                                         │
//  │  ← Update HERO_FRAME_W / HERO_FRAME_H to match your sourced asset ──── │
//  └─────────────────────────────────────────────────────────────────────────┘
//
const HERO_FRAME_W          = 48   // ← set to your spritesheet frame width  (px)
const HERO_FRAME_H          = 64   // ← set to your spritesheet frame height (px)
const HERO_WALK_FRAMES_PER_DIR = 4 // walking frames per direction
const HERO_IDLE_FRAME_COUNT    = 4 // idle animation frame count
// Derived totals (update automatically when the four constants above change)
const HERO_FRAMES    = HERO_WALK_FRAMES_PER_DIR * 4 + HERO_IDLE_FRAME_COUNT  // 20

// Animation keys for the 4-directional hero (registered in _buildWorkstations)
const HERO_ANIM = {
  walkSouth: 'hero_walk_s',
  walkEast:  'hero_walk_e',
  walkNorth: 'hero_walk_n',
  walkWest:  'hero_walk_w',
  idle:      'hero_idle',
}

// ─── Server spritesheet — Logistics machine  (Task 5) ────────────────────────
const SVR_FRAME_W  = 40   // ← set to your server spritesheet frame width  (px)
const SVR_FRAME_H  = 56   // ← set to your server spritesheet frame height (px)
const SVR_FRAMES   = 8    // 4 idle-blink (0-3) + 4 active-blink (4-7)

// ─── Environment tileset  (Task 8) ───────────────────────────────────────────
//
//  office_tiles.png is used as a spritesheet.  Each cell in the sheet is one
//  isometric tile.  Update TILESET_FRAME_W / H to match the asset you source.
//
const TILESET_FRAME_W = 64   // ← tile cell width  in your tileset PNG (px)
const TILESET_FRAME_H = 32   // ← tile cell height in your tileset PNG (px)

// ─── Workstation machine-sprite dimensions  (Task 8) ─────────────────────────
//
//  desk_lvl*.png, server_lvl*.png, trading_lvl*.png are single-frame images.
//  Set these to the natural size of the PNGs you source so setDisplaySize()
//  can scale them to fit the tile without distortion.
//
const WS_SPRITE_W = 64   // ← workstation sprite source width  (px)
const WS_SPRITE_H = 80   // ← workstation sprite source height (px)

// ─── Isometric depth-sorting  (Task 9) ───────────────────────────────────────
//
//  All interactive sprites are stored in _depthSortGroup and re-sorted every
//  frame.  The base depth sits above the floor tiles (0-24) and below the HUD
//  (200) so all sorting happens in a clean, isolated band.
//
const DEPTH_SORT_BASE = 50  // depth floor for Y-sorted objects
//
//  WS_DEPTH_OFFSET: added to a workstation machine sprite's Y before sorting.
//  This makes the desk/server/terminal always appear IN FRONT of any character
//  sprite at the same isometric coordinate (hero walks behind the desk monitor).
//
const WS_DEPTH_OFFSET = 28

// ─── Three Pillars — workstation definitions (Task 5) ────────────────────────
//
//  col/row      : tile coordinates on the 5x5 isometric grid
//  spriteKey    : texture key for the animated character / machine sprite
//  animIdle/Work: Phaser animation keys — unique per pillar
//  accentNum/Str: accent colour as number (for tints) and string (for text)
//  machineKey   : level-1 machine backdrop texture (upgrades via Task 10)
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
    machineKey: 'desk_lvl1', baseCost: 50,   // texture swaps: desk_lvl1/2/3
  },
  {
    id: 'logistics', label: 'LOGISTICS', desc: 'Server Rack',
    col: 2, row: 2,
    spriteKey: 'server_iso',
    animIdle: 'log_idle', animWork: 'log_working',
    idleFrames: { start: 0, end: 3 }, workFrames: { start: 4, end: 7 },
    idleFps: 2, workFps: 12,
    accentNum: 0x0ea5e9, accentStr: '#0ea5e9',
    machineKey: 'server_lvl1', baseCost: 120, // texture swaps: server_lvl1/2/3
  },
  {
    id: 'sales', label: 'SALES', desc: 'Trading Desk',
    col: 4, row: 2,
    spriteKey: 'hero_iso',
    animIdle: 'sales_idle', animWork: 'sales_working',
    idleFrames: { start: 0, end: 3 }, workFrames: { start: 4, end: 7 },
    idleFps: 4, workFps: 10,
    accentNum: 0x22c55e, accentStr: '#22c55e',
    machineKey: 'trading_lvl1', baseCost: 200, // texture swaps: trading_lvl1/2/3
  },
]

// ─── Visual upgrade tiers  (Task 10) ─────────────────────────────────────────
//
//  Level thresholds that trigger a full workstation texture swap.
//  Adjust the numbers to tune the progression feel.
//
const VISUAL_TIERS = [
  { name: 'Garage',      minLevel: 1,  suffix: 'lvl1' },
  { name: 'Modern Office', minLevel: 10, suffix: 'lvl2' },
  { name: 'Cyber-Hub',   minLevel: 25, suffix: 'lvl3' },
]
// Map each workstation id to its machine-sprite texture prefix
const WS_TEXTURE_PREFIX = { production: 'desk', logistics: 'server', sales: 'trading' }

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
    this._assetsMissing  = new Set()
    this._isBoosting     = false
    this._polling        = false
    this._popup          = null
    this._popupBlocker   = null
    this._particles      = null    // upgrade-success emitter  (Task 7)
    this._bountyEmitter  = null    // Math Bounty emitter      (Task 11)
    /** @type {Array<{def,level,isWorking,sprite,machineSprite,screenX,screenY,currentTier}>} */
    this._workstations   = []
    /** @type {Array<{sprite:Phaser.GameObjects.GameObject,yOffset:number}>} */
    this._depthSortGroup = []      // Y-sorted interactive sprites (Task 9)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — preload  (Tasks 1 + 2 + 5)
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — preload  (Tasks 2, 5, 8)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * preload  (Task 8)
   *
   * Loads all external assets.  If any file is absent (404 in dev) the
   * loaderror handler records its key and _generateFallbackTextures() draws
   * a procedural replacement in create() — zero broken sprites in dev.
   *
   * HOW TO SWAP IN REAL ASSETS
   * ─────────────────────────────────────────────────────────────────────────
   *  1. Place your PNG files in /public/assets/
   *  2. The path strings below are the only things you need to change.
   *  3. Update the matching FRAME_W / FRAME_H constants at the top of this
   *     file to match the dimensions of your sourced artwork.
   *  4. No other code changes are required.
   * ─────────────────────────────────────────────────────────────────────────
   */
  preload() {
    this.load.on('loaderror', (file) => {
      this._assetsMissing.add(file.key)
      console.debug('[IsoTycoonScene] Asset unavailable, using procedural fallback:', file.key)
    })

    // ── Environment tileset ──────────────────────────────────────────────
    // Building shell background (7-floor isometric cross-section, Neo-Tokyo windows)
    this.load.image('building-bg', '/assets/building-bg.svg')

    // office_tiles.png: a grid of isometric floor-tile cells.
    // Frame dimensions: TILESET_FRAME_W × TILESET_FRAME_H  (default 64×32)
    this.load.spritesheet('office_tiles', '/assets/office_tiles.png', {
      frameWidth:  TILESET_FRAME_W,
      frameHeight: TILESET_FRAME_H,
    })

    // ── Hero spritesheet — 4-directional walking + idle  (Task 8) ───────
    // hero_iso.png layout (rows):
    //   Row 0 (frames  0-3): walk SOUTH  (HERO_WALK_FRAMES_PER_DIR frames)
    //   Row 1 (frames  4-7): walk EAST
    //   Row 2 (frames  8-11): walk NORTH
    //   Row 3 (frames 12-15): walk WEST
    //   Row 4 (frames 16-19): idle       (HERO_IDLE_FRAME_COUNT frames)
    // Frame dimensions: HERO_FRAME_W × HERO_FRAME_H  (default 48×64)
    this.load.spritesheet('hero_iso', '/assets/hero_iso.png', {
      frameWidth:  HERO_FRAME_W,
      frameHeight: HERO_FRAME_H,
    })

    // ── Server / Logistics machine spritesheet ────────────────────────────
    // server_iso.png: 8 frames (0-3 idle blink, 4-7 active blink)
    // Frame dimensions: SVR_FRAME_W × SVR_FRAME_H  (default 40×56)
    this.load.spritesheet('server_iso', '/assets/server_iso.png', {
      frameWidth:  SVR_FRAME_W,
      frameHeight: SVR_FRAME_H,
    })

    // ── Workstation machine sprites — three tiers × three pillars  (Task 8) ─
    // Each is a single-frame PNG.  Natural source size: WS_SPRITE_W × WS_SPRITE_H
    // Garage tier (level  1-9)
    this.load.image('desk_lvl1',    '/assets/desk_lvl1.png')     // production, garage
    this.load.image('server_lvl1',  '/assets/server_lvl1.png')   // logistics,  garage
    this.load.image('trading_lvl1', '/assets/trading_lvl1.png')  // sales,      garage
    // Modern Office tier (level 10-24)
    this.load.image('desk_lvl2',    '/assets/desk_lvl2.png')
    this.load.image('server_lvl2',  '/assets/server_lvl2.png')
    this.load.image('trading_lvl2', '/assets/trading_lvl2.png')
    // Cyber-Hub tier (level 25+)
    this.load.image('desk_lvl3',    '/assets/desk_lvl3.png')
    this.load.image('server_lvl3',  '/assets/server_lvl3.png')
    this.load.image('trading_lvl3', '/assets/trading_lvl3.png')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — create  (Tasks 1, 2, 5, 6, 7, 9, 11)
  // ═══════════════════════════════════════════════════════════════════════════

  create() {
    const { width, height } = this.scale

    // Dark background fallback (#0a0e1a) — shown when building-bg.svg is missing
    this.add.rectangle(0, 0, width, height, 0x0a0e1a).setOrigin(0, 0).setDepth(-2)

    // Building shell background (7-floor isometric cross-section)
    if (!this._assetsMissing.has('building-bg')) {
      this.add.image(width / 2, height / 2, 'building-bg')
        .setDisplaySize(width, height)
        .setDepth(-1)
    }

    // Procedural texture fallbacks (no-ops when real PNGs loaded)
    this._generateFallbackTextures()

    // 5x5 isometric floor grid
    this._buildIsoGrid()

    // Three workstations + Y-sort group population (Tasks 5, 6, 9)
    this._buildWorkstations()

    // HUD panel (Task 1)
    this._buildHUD()

    // Upgrade-success coin burst emitter (Task 7)
    this._buildParticleEmitter()

    // Math Bounty electric particle emitter (Task 11)
    this._buildBountyEmitter()

    // Begin polling (Tasks 3, 4, 5, 10)
    this._startPolling()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — update  (Task 9 — Y-sort depth every frame)
  // ═══════════════════════════════════════════════════════════════════════════

  update() {
    this._ySort()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — procedural texture generation  (Tasks 2 + 5)
  // ═══════════════════════════════════════════════════════════════════════════

  _generateFallbackTextures() {
    // Tile and character sheets
    if (this._assetsMissing.has('office_tiles') || !this.textures.exists('office_tiles')) this._genTile()
    if (this._assetsMissing.has('hero_iso')     || !this.textures.exists('hero_iso'))     this._genHeroSheet()
    if (this._assetsMissing.has('server_iso')   || !this.textures.exists('server_iso'))   this._genServerSheet()
    // Nine workstation tier textures (3 pillars × 3 tiers)
    this._genMachineSprites()
    // Particle textures
    this._genParticleTexture()   // gold coin dot   (Task 7 upgrade burst)
    this._genBountyParticle()    // electric star   (Task 11 Math Bounty)
  }

  // ── Floor tile — used as both 'tile' and 'office_tiles' fallback ─────────
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

    // Register under both keys so _buildIsoGrid() and office_tiles references work
    g.generateTexture('tile', TILE_W, TILE_H)
    g.destroy()

    // Copy 'tile' to 'office_tiles' if not already loaded
    if (!this.textures.exists('office_tiles')) {
      // Re-draw identically under the tileset key (frame 0 = the basic floor tile)
      const g2 = this.make.graphics({ x: 0, y: 0, add: false })
      g2.fillStyle(0x1e3a5f, 1)
      g2.fillPoints([{ x: hw, y: 0 }, { x: TILE_W, y: hh }, { x: hw, y: TILE_H }, { x: 0, y: hh }], true)
      g2.fillStyle(0x2d5a8e, 0.55)
      g2.fillPoints([{ x: hw, y: 4 }, { x: TILE_W - 4, y: hh }, { x: hw, y: TILE_H - 4 }, { x: 4, y: hh }], true)
      g2.generateTexture('office_tiles', TILE_W, TILE_H)
      g2.destroy()
    }
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
   * _genMachineSprites  (Tasks 5 + 8 + 10)
   *
   * Generates procedural fallback textures for all nine workstation machine
   * backdrops: three visual tiers (Garage / Modern Office / Cyber-Hub) for
   * each of the three pillars (production / logistics / sales).
   *
   * Texture key pattern: `{prefix}_lvl{1|2|3}`
   *   desk_lvl1 / desk_lvl2 / desk_lvl3
   *   server_lvl1 / server_lvl2 / server_lvl3
   *   trading_lvl1 / trading_lvl2 / trading_lvl3
   *
   * When real PNGs are loaded they override these keys automatically.
   */
  _genMachineSprites() {
    // [prefix, lvl, baseColour, borderColour, glowAlpha, glowColour]
    const specs = [
      // ── Garage (lvl1) — dark, rough, utilitarian ─────────────────────
      ['desk',    1, 0x1e1b4b, 0x312e81, 0,    0],
      ['server',  1, 0x0c2340, 0x0c4a6e, 0,    0],
      ['trading', 1, 0x0a2620, 0x14532d, 0,    0],
      // ── Modern Office (lvl2) — lighter, cleaner, professional ─────────
      ['desk',    2, 0x2e2a6b, 0x4c1d95, 0.12, 0x818cf8],
      ['server',  2, 0x0e3d6a, 0x1d6fa8, 0.12, 0x38bdf8],
      ['trading', 2, 0x0d3d25, 0x16a34a, 0.12, 0x4ade80],
      // ── Cyber-Hub (lvl3) — neon glow, futuristic ─────────────────────
      ['desk',    3, 0x1a0a3d, 0x7c3aed, 0.45, 0xa78bfa],
      ['server',  3, 0x041c35, 0x0284c7, 0.45, 0x38bdf8],
      ['trading', 3, 0x04200f, 0x16a34a, 0.45, 0x4ade80],
    ]

    const W = WS_SPRITE_W, H = WS_SPRITE_H

    specs.forEach(([prefix, lvl, base, border, glowA, glowC]) => {
      const key = `${prefix}_lvl${lvl}`
      if (this.textures.exists(key)) return

      const g = this.make.graphics({ x: 0, y: 0, add: false })

      // Base fill
      g.fillStyle(base, 1)
      g.fillRoundedRect(4, 4, W - 8, H - 8, 6)

      // Inner highlight strip (top)
      g.fillStyle(0xffffff, 0.05 + lvl * 0.02)
      g.fillRect(8, 8, W - 16, 5)

      // Neon glow overlay (lvl2/3 only)
      if (glowA > 0) {
        g.fillStyle(glowC, glowA * 0.25)
        g.fillRoundedRect(4, 4, W - 8, H - 8, 6)
      }

      // Border
      g.lineStyle(lvl === 3 ? 2 : 1, border, 1)
      g.strokeRoundedRect(4, 4, W - 8, H - 8, 6)

      // Cyber-Hub corner accents
      if (lvl === 3) {
        g.lineStyle(2, glowC, 0.8)
        g.beginPath(); g.moveTo(4, 14); g.lineTo(4, 4); g.lineTo(14, 4); g.strokePath()
        g.beginPath(); g.moveTo(W - 14, 4); g.lineTo(W - 4, 4); g.lineTo(W - 4, 14); g.strokePath()
      }

      // Status dot (top-right)
      const dotColor = lvl === 3 ? glowC : lvl === 2 ? border : 0x334155
      g.fillStyle(dotColor, 1)
      g.fillCircle(W - 12, 12, lvl === 3 ? 4 : 3)

      g.generateTexture(key, W, H)
      g.destroy()
    })
  }

  // ── Gold particle dot for the coin-burst emitter  (Task 7) ──────────────
  _genParticleTexture() {
    if (this.textures.exists('iso_particle')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xfbbf24, 1); g.fillCircle(4, 4, 4)
    g.generateTexture('iso_particle', 8, 8)
    g.destroy()
  }

  /**
   * _genBountyParticle  (Task 11)
   *
   * Procedural 4-pointed star / diamond for the Math Bounty electric effect.
   * No external asset file needed — drawn entirely with Phaser Graphics.
   * Bright cyan-white so it's visually distinct from the gold upgrade burst.
   */
  _genBountyParticle() {
    if (this.textures.exists('bounty_particle')) return
    const g  = this.make.graphics({ x: 0, y: 0, add: false })
    const cx = 6, cy = 6, r = 5

    // 4-pointed star: two overlapping thin diamonds
    g.fillStyle(0x00ffff, 1)
    g.fillPoints([
      { x: cx,     y: cy - r }, { x: cx + 1, y: cy - 1 },
      { x: cx + r, y: cy     }, { x: cx + 1, y: cy + 1 },
      { x: cx,     y: cy + r }, { x: cx - 1, y: cy + 1 },
      { x: cx - r, y: cy     }, { x: cx - 1, y: cy - 1 },
    ], true)

    // Bright white core
    g.fillStyle(0xffffff, 1)
    g.fillCircle(cx, cy, 1.5)

    g.generateTexture('bounty_particle', 12, 12)
    g.destroy()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — isometric grid  (Tasks 2, 8)
  // ═══════════════════════════════════════════════════════════════════════════

  _buildIsoGrid() {
    const { width, height } = this.scale
    this._isoOriginX = width  / 2
    this._isoOriginY = height * 0.26

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = this._isoPos(col, row)
        // Use office_tiles spritesheet (frame 0 = basic floor tile)
        // When a real office_tiles.png is loaded, change frame index to pick
        // different tile variants from the sheet (e.g. frame 1 for grass, etc.)
        this.add
          .image(x, y, 'office_tiles')
          .setOrigin(0.5, 0.5)
          .setTint((col + row) % 2 === 0 ? 0xffffff : 0xaad4ee)
          .setDepth(row * GRID_COLS + col)   // floor tiles stay at static depth 0-24
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
  // TASK 5 + 9 — Three Pillars workstations + Y-sort group population
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildWorkstations  (Tasks 5, 6, 8, 9)
   *
   * Creates three workstation runtime objects.  Each gets:
   *   • machine-base backdrop (desk/rack/terminal) — added to Y-sort group
   *   • animated character/machine sprite          — added to Y-sort group
   *   • floating label above the sprite
   *   • pointer events for the upgrade popup (Task 6)
   *
   * Machine sprites get WS_DEPTH_OFFSET added to their sort Y so they always
   * render IN FRONT of any character at the same isometric coordinate (the
   * hero appears behind the desk monitor — Task 9).
   *
   * Grid positions: Production(0,2), Logistics(2,2), Sales(4,2)
   */
  _buildWorkstations() {
    // Register per-pillar animation keys (4-directional hero anim keys also defined)
    WORKSTATION_DEFS.forEach((def) => {
      if (!this.anims.exists(def.animIdle)) {
        this.anims.create({ key: def.animIdle, frames: this.anims.generateFrameNumbers(def.spriteKey, def.idleFrames), frameRate: def.idleFps, repeat: -1 })
      }
      if (!this.anims.exists(def.animWork)) {
        this.anims.create({ key: def.animWork, frames: this.anims.generateFrameNumbers(def.spriteKey, def.workFrames), frameRate: def.workFps, repeat: -1 })
      }
    })

    // 4-directional hero animations (Task 8): used when a hero sprite walks around
    // the grid independently of a workstation.
    const dirAnims = [
      { key: HERO_ANIM.walkSouth, start: 0,  end: HERO_WALK_FRAMES_PER_DIR - 1 },
      { key: HERO_ANIM.walkEast,  start: 4,  end: 7 },
      { key: HERO_ANIM.walkNorth, start: 8,  end: 11 },
      { key: HERO_ANIM.walkWest,  start: 12, end: 15 },
      { key: HERO_ANIM.idle,      start: HERO_WALK_FRAMES_PER_DIR * 4,
                                   end: HERO_FRAMES - 1 },
    ]
    dirAnims.forEach(({ key, start, end }) => {
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers('hero_iso', { start, end }), frameRate: 6, repeat: -1 })
      }
    })

    WORKSTATION_DEFS.forEach((def) => {
      const { x, y } = this._isoPos(def.col, def.row)

      // Machine-base backdrop (desk / server cabinet / trading terminal)
      const machineSprite = this.add
        .image(x, y - TILE_H / 2, def.machineKey)
        .setOrigin(0.5, 1)
        .setTint(def.accentNum).setAlpha(0.88)
        // Initial depth set to 0; _ySort() takes over every frame
        .setDepth(DEPTH_SORT_BASE)

      // Character / machine animated sprite
      const isServer = def.spriteKey === 'server_iso'
      const spriteY  = y - TILE_H / 2 - (isServer ? 10 : 4)
      const sprite   = this.add
        .sprite(x, spriteY, def.spriteKey, 0)
        .setOrigin(0.5, 1).setScale(isServer ? 0.95 : 1.05)
        .setDepth(DEPTH_SORT_BASE).setTint(def.accentNum)

      sprite.play(def.animIdle)

      // Floating label — NOT in sort group (always visible above everything)
      this.add
        .text(x, spriteY - (isServer ? 62 : 72), def.label, {
          fontFamily: '"Orbitron", monospace', fontSize: '10px',
          color: def.accentStr, fontStyle: 'bold', align: 'center',
        })
        .setOrigin(0.5, 1).setDepth(180).setAlpha(0.9)

      // Idle float tween (characters only)
      if (!isServer) {
        this.tweens.add({
          targets: sprite, y: { from: sprite.y, to: sprite.y - 5 },
          duration: 1600 + def.col * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
      }

      // ── Task 9: add both sprites to the Y-sort group ──────────────────
      // machineSprite gets WS_DEPTH_OFFSET so it renders IN FRONT of the
      // character sprite when they share the same isometric position.
      this._depthSortGroup.push({ sprite: machineSprite, yOffset: WS_DEPTH_OFFSET })
      this._depthSortGroup.push({ sprite,                yOffset: 0 })

      // Runtime state
      const runtime = {
        def, level: 1, isWorking: false,
        sprite, machineSprite,
        screenX: x, screenY: spriteY,
        currentTier: 'Garage',   // Track tier to avoid redundant texture swaps
      }
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
  // TASK 9 — Y-sort depth (runs every frame from update())
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _ySort
   *
   * Implements isometric depth sorting via Phaser's setDepth() API.
   * Every frame, interactive sprites are sorted by their effective screen Y:
   *
   *   effectiveY = sprite.y + yOffset
   *
   * Objects with a HIGHER effectiveY (lower on screen = closer to viewer)
   * receive a HIGHER depth value and are drawn ON TOP.  This correctly
   * produces the isometric "3-D" illusion where foreground objects occlude
   * background ones.
   *
   * WS_DEPTH_OFFSET is added to workstation machine sprites so they always
   * render in front of any character that occupies the same grid tile (the
   * desk/terminal monitor appears IN FRONT of the hero — Task 9).
   *
   * Only setDepth() is called — no game objects are destroyed or re-created.
   * The sort runs on a small fixed-size array (6 elements for 3 workstations)
   * so performance cost is negligible even at 60 fps.
   */
  _ySort() {
    if (!this._depthSortGroup.length) return

    // Sort ascending by effectiveY; then assign increasing depth values
    // starting at DEPTH_SORT_BASE so they stay above floor tiles (0-24)
    // and below the HUD (200).
    this._depthSortGroup
      .slice()
      .sort((a, b) => (a.sprite.y + a.yOffset) - (b.sprite.y + b.yOffset))
      .forEach((item, idx) => {
        if (item.sprite?.active) {
          item.sprite.setDepth(DEPTH_SORT_BASE + idx)
        }
      })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 7 (support) — upgrade-success coin-burst emitter
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
  // TASK 11 — Math Bounty particle emitter
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildBountyEmitter  (Task 11)
   *
   * Creates a dedicated ParticleEmitter for the Math Bounty effect, separate
   * from the upgrade-success emitter so both can fire independently.
   *
   * Uses the procedural 'bounty_particle' star texture (4-pointed cyan star,
   * no external asset required — Task 11 constraint).
   *
   * The emitter starts with quantity=0 and emitting=false; triggerBountyEffect()
   * moves it to the target position and calls explode().
   */
  _buildBountyEmitter() {
    this._bountyEmitter = this.add.particles(0, 0, 'bounty_particle', {
      speed:    { min: 80, max: 280 },
      scale:    { start: 1.8, end: 0 },
      alpha:    { start: 1,   end: 0 },
      lifespan: 1100,
      gravityY: 180,
      // Electric plasma palette: cyan, white, lavender, hot-pink
      tint:     [0x00ffff, 0xffffff, 0xc4b5fd, 0xff44cc],
      quantity: 0,
      emitting: false,
    }).setDepth(310)  // above workstations and upgrade burst (300)
  }

  /**
   * triggerBountyEffect  (Task 11)
   *
   * Public function — call this whenever a "Math Bounty" or massive multiplier
   * fires.  Spawns a dramatic electric burst at (x, y) using the bounty emitter.
   *
   * Wired to:
   *   • is_boosting true transition (via _applyBoostState)
   *   • per-workstation is_working false → true transition (via _applyWorkstationStates)
   *
   * The effect is visually distinct from _burstParticles() (upgrade success):
   *   • Bounty: 40 particles, cyan/white/purple, longer lifespan (1100 ms)
   *   • Upgrade: 28 particles, gold/amber, shorter lifespan (800 ms)
   *
   * @param {number} x  – canvas X coordinate of the target
   * @param {number} y  – canvas Y coordinate of the target
   */
  triggerBountyEffect(x, y) {
    if (!this._bountyEmitter?.active) return
    this._bountyEmitter.setPosition(x, y)
    this._bountyEmitter.explode(40)
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
   * _fetchStatus  (Tasks 3, 4, 5, 10)
   *
   * Polls GET /api/tycoon/status every POLL_INTERVAL ms.
   * Fires-and-forgets; errors surface only in the HUD status bar.
   *
   * Extended JSON payload (Tasks 5, 10 — all new fields optional for compat):
   * {
   *   "total_coins":       1234,
   *   "production_rate":   56.7,
   *   "is_boosting":       false,
   *   "production_level":  7,     <- integer 1-50, drives visual tier (Task 10)
   *   "logistics_level":   12,
   *   "sales_level":       28,
   *   "workstations": [           <- per-pillar animation state (Task 5)
   *     { "workstation_id": "production", "is_working": true,  "level": 7  },
   *     { "workstation_id": "logistics",  "is_working": false, "level": 12 },
   *     { "workstation_id": "sales",      "is_working": true,  "level": 28 }
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

      // Task 3: HUD counters
      this._txtCoins?.setText(this._fmtCoins(data.total_coins ?? 0))
      this._txtProdRate?.setText(`${this._fmtRate(data.production_rate ?? 0)}/s`)
      this._txtNet?.setText(`Updated ${new Date().toLocaleTimeString()}`).setColor(CLR_DIM)

      // Task 4: legacy single-boost drives Production pillar + HUD
      this._applyBoostState(!!data.is_boosting)

      // Task 5: per-workstation animation states
      if (Array.isArray(data.workstations)) this._applyWorkstationStates(data.workstations)

      // Task 10: level-based visual tier upgrades
      if (data.production_level != null) this.updateWorkstationVisuals('production', data.production_level)
      if (data.logistics_level  != null) this.updateWorkstationVisuals('logistics',  data.logistics_level)
      if (data.sales_level      != null) this.updateWorkstationVisuals('sales',       data.sales_level)

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
    // Task 11: fire bounty effect on the Production workstation when boost activates
    if (boosting && prod) this.triggerBountyEffect(prod.screenX, prod.screenY)
    // HUD indicators
    this._txtProdRate?.setColor(boosting ? CLR_PROD_BOOST : CLR_TEXT)
    this._txtStatus?.setText(boosting ? 'BOOSTING' : 'IDLE').setColor(boosting ? CLR_BOOST_ON : CLR_DIM)
    this._txtBoost?.setVisible(boosting)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 5 — Per-workstation animation control
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _applyWorkstationStates  (Tasks 5, 11)
   *
   * Drives each pillar's animation and level independently.
   * On a false → true is_working transition, fires triggerBountyEffect()
   * over that workstation to signal a Math Bounty activation (Task 11).
   *
   * @param {Array<{workstation_id:string, is_working:boolean, level:number}>} states
   */
  _applyWorkstationStates(states) {
    states.forEach(({ workstation_id, is_working, level }) => {
      const runtime = this._workstations.find(w => w.def.id === workstation_id)
      if (!runtime) return
      if (typeof level === 'number') runtime.level = level

      const wasWorking = runtime.isWorking
      if (!!is_working !== wasWorking) {
        this._setWorkstationAnim(runtime, !!is_working)
        // Task 11: bounty burst when a workstation starts producing
        if (is_working) this.triggerBountyEffect(runtime.screenX, runtime.screenY)
      }
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
  // TASK 10 — Visual upgrade tiers (Garage → Modern Office → Cyber-Hub)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * updateWorkstationVisuals  (Task 10)
   *
   * Maps a backend level integer (1-50) to a visual tier and swaps the
   * machine-backdrop texture via sprite.setTexture() — the game object is
   * never destroyed or recreated; only the texture reference changes.
   *
   * Tier thresholds (configured in VISUAL_TIERS constant at the top):
   *   Level  1-9  → Garage        ('desk_lvl1' / 'server_lvl1' / 'trading_lvl1')
   *   Level 10-24 → Modern Office ('desk_lvl2' / 'server_lvl2' / 'trading_lvl2')
   *   Level 25+   → Cyber-Hub     ('desk_lvl3' / 'server_lvl3' / 'trading_lvl3')
   *
   * The function is idempotent: if the tier has not changed since the last
   * call it returns immediately, avoiding redundant texture swaps and tweens.
   *
   * @param {'production'|'logistics'|'sales'} pillar  – workstation id
   * @param {number} level                              – current level (1-50)
   */
  updateWorkstationVisuals(pillar, level) {
    const runtime = this._workstations.find(w => w.def.id === pillar)
    if (!runtime?.machineSprite?.active) return

    // Resolve target tier (highest tier whose minLevel <= level)
    const tier = [...VISUAL_TIERS]
      .reverse()
      .find(t => level >= t.minLevel) ?? VISUAL_TIERS[0]

    // Idempotent guard — skip if already at this tier
    if (tier.name === runtime.currentTier) return
    runtime.currentTier = tier.name

    // Build texture key: e.g. 'desk_lvl2', 'server_lvl3', 'trading_lvl1'
    const prefix  = WS_TEXTURE_PREFIX[pillar]
    const texKey  = prefix ? `${prefix}_${tier.suffix}` : null
    if (!texKey || !this.textures.exists(texKey)) return

    // Swap texture in-place — no destruction, no animation interruption
    runtime.machineSprite.setTexture(texKey)

    // Brief scale-pop tween to signal the visual upgrade to the player
    this.tweens.add({
      targets:  runtime.machineSprite,
      scaleX:   { from: 1, to: 1.18 },
      scaleY:   { from: 1, to: 1.18 },
      duration: 140,
      yoyo:     true,
      ease:     'Back.easeOut',
    })

    // Cyber-Hub tier: update tint to a brighter glow on the character sprite too
    if (tier.suffix === 'lvl3') {
      runtime.sprite?.setTint(runtime.def.accentNum)
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

