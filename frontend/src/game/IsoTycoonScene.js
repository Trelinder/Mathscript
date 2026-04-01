import * as Phaser from 'phaser'

/**
 * IsoTycoonScene — MathScript Tycoon Isometric View
 * ─────────────────────────────────────────────────────────────────────────────
 * A hardware-accelerated (WebGL via Phaser.AUTO) scene that renders a 5×5
 * isometric floor grid, an animated character, and a live HUD.  All data is
 * sourced by polling the FastAPI backend — the scene is strictly a "dumb client"
 * that only renders state; it never modifies any backend logic.
 *
 * COMMANDS IMPLEMENTED
 * ─────────────────────
 *  Task 1  — Phaser init, dark background (#1a1a2e), monospace HUD text
 *             (Total Coins · Production Rate · Boost Active indicator).
 *  Task 2  — Isometric 5×5 grid with floor tiles; character sprite; `idle`
 *             (frames 0–3) and `working` (frames 4–7) animations.
 *  Task 3  — Async `_fetchStatus()` called every 3 s via Phaser TimerEvent;
 *             parses { total_coins, production_rate, is_boosting }.
 *  Task 4  — `is_boosting` controls animation state and Production Rate colour;
 *             transitions are idempotent (no anim restart if state unchanged).
 *
 * WIRING INTO A PHASER GAME
 * ─────────────────────────
 *  import IsoTycoonScene from './IsoTycoonScene'
 *
 *  new Phaser.Game({
 *    type:            Phaser.AUTO,          // WebGL with Canvas fallback
 *    backgroundColor: '#1a1a2e',
 *    scale: {
 *      mode:      Phaser.Scale.FIT,
 *      autoCenter: Phaser.Scale.CENTER_BOTH,
 *      width:  800,
 *      height: 600,
 *    },
 *    scene: [IsoTycoonScene],
 *  })
 *
 * ASSET FALLBACK POLICY
 * ─────────────────────
 *  The scene tries to load real PNGs first; if either file is missing (404 /
 *  network error during development) it silently falls back to procedural
 *  textures drawn with Phaser's Graphics API.  Drop in real artwork later by
 *  placing the files at:
 *    /public/assets/tile.png       (64 × 32 px isometric diamond)
 *    /public/assets/hero_iso.png   (spritesheet: 8 frames × 48 px wide, 64 px tall)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Isometric grid dimensions ────────────────────────────────────────────────
/** Pixel width of one isometric floor-tile texture (left to right vertex). */
const TILE_W = 64
/** Pixel height of one isometric floor-tile texture (top to bottom vertex). */
const TILE_H = 32
/** Number of tile columns in the grid. */
const GRID_COLS = 5
/** Number of tile rows in the grid. */
const GRID_ROWS = 5

// ─── Character spritesheet layout ────────────────────────────────────────────
/**
 * Width of one animation frame in pixels.
 * hero_iso.png must be HERO_FRAME_W × HERO_FRAMES wide and HERO_FRAME_H tall.
 */
const HERO_FRAME_W = 48
/** Height of one animation frame in pixels. */
const HERO_FRAME_H = 64
/** Total frames in the spritesheet (4 idle + 4 working). */
const HERO_FRAMES  = 8

// ─── Animations ───────────────────────────────────────────────────────────────
/** Phaser animation key used when the character is idle. */
const ANIM_IDLE    = 'idle'
/** Phaser animation key used when the character is working / boosting. */
const ANIM_WORKING = 'working'

// ─── Backend polling ──────────────────────────────────────────────────────────
/**
 * FastAPI endpoint.  The Vite dev server proxies `/api` → `http://localhost:8000`,
 * so this works in both local dev (via Vite) and direct testing against the live
 * server.  Override to `http://127.0.0.1:8000/api/tycoon/status` for raw local
 * testing without the Vite proxy.
 */
const STATUS_URL     = '/api/tycoon/status'
/** How often (ms) the scene polls the backend. */
const POLL_INTERVAL  = 3000
/** Network / parse timeout in ms before the fetch is aborted. */
const FETCH_TIMEOUT  = 5000

// ─── HUD colours ──────────────────────────────────────────────────────────────
const CLR_BG          = '#1a1a2e'   // scene background
const CLR_TEXT        = '#e2e8f0'   // default HUD text
const CLR_PROD_BOOST  = '#ff0055'   // Production Rate text when boosting
const CLR_COIN        = '#fbbf24'   // coin count accent
const CLR_BOOST_ON    = '#facc15'   // "BOOST ACTIVE" indicator
const CLR_DIM         = '#475569'   // subtle / dim text

// ─────────────────────────────────────────────────────────────────────────────
export default class IsoTycoonScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IsoTycoonScene' })
    /** Tracks which asset keys failed to load so we can generate fallbacks. */
    this._assetsMissing = new Set()
    /** Last known `is_boosting` state — prevents redundant animation restarts. */
    this._isBoosting = false
    /** Whether the polling timer is currently active. */
    this._polling = false
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1 + TASK 2 (a) — preload
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * preload
   *
   * Attempts to load the real PNG assets.  Failures (404s during dev) are
   * caught silently; `_generateFallbackTextures()` in `create()` then draws
   * them programmatically.
   *
   * Swap in real art:
   *   1. Place files at /public/assets/tile.png  and  /public/assets/hero_iso.png
   *   2. No other changes needed — the scene automatically prefers real files
   *      over the procedural fallback.
   */
  preload() {
    // Track failed loads so we can generate procedural replacements
    this.load.on('loaderror', (file) => {
      this._assetsMissing.add(file.key)
      console.debug('[IsoTycoonScene] Asset unavailable, using procedural fallback:', file.key)
    })

    // ── Floor tile (isometric diamond, 64 × 32 px) ─────────────────────────
    this.load.image('tile', '/assets/tile.png')

    // ── Hero spritesheet (8 frames × 48 wide, 64 tall) ─────────────────────
    this.load.spritesheet('hero_iso', '/assets/hero_iso.png', {
      frameWidth:  HERO_FRAME_W,
      frameHeight: HERO_FRAME_H,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1 + TASK 2 (b) — create
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * create
   *
   * One-time scene setup:
   *   1. Dark background
   *   2. Fallback texture generation (when PNGs are absent)
   *   3. 5 × 5 isometric floor grid
   *   4. Character sprite + animations
   *   5. HUD text objects
   *   6. 3-second backend polling timer
   */
  create() {
    const { width, height } = this.scale

    // ── Step 1: Background ──────────────────────────────────────────────────
    this.add.rectangle(0, 0, width, height, 0x1a1a2e).setOrigin(0, 0)

    // ── Step 2: Generate procedural textures if real assets failed ──────────
    this._generateFallbackTextures()

    // ── Step 3: Build the isometric grid ───────────────────────────────────
    this._buildIsoGrid()

    // ── Step 4: Place the character sprite and define animations ───────────
    this._buildCharacter()

    // ── Step 5: Build the HUD ──────────────────────────────────────────────
    this._buildHUD()

    // ── Step 6: Start backend polling ──────────────────────────────────────
    this._startPolling()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Standard Phaser lifecycle — update
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * update
   *
   * The isometric view is event-driven (polling timer + tweens handle all
   * motion), so the update loop is intentionally lightweight.  Extend this
   * method to add real-time effects (particle trails, camera shake, etc.).
   */
  // eslint-disable-next-line no-unused-vars
  update(_time, _delta) {
    // Reserved for future real-time effects.
    // Polling, text, and animation are all managed via timer events and
    // callbacks so there is nothing to do here per-frame.
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — texture generation
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _generateFallbackTextures
   *
   * Procedurally draws textures for any asset that failed to load.
   * Produces the same texture keys (`tile`, `hero_iso`) that real PNGs would
   * occupy, so the rest of the scene code is identical regardless of which
   * path is taken.
   */
  _generateFallbackTextures() {
    if (this._assetsMissing.has('tile') || !this.textures.exists('tile')) {
      this._generateTileTexture()
    }

    if (this._assetsMissing.has('hero_iso') || !this.textures.exists('hero_iso')) {
      this._generateHeroSpritesheet()
    }
  }

  /**
   * _generateTileTexture
   *
   * Draws a single isometric diamond floor tile using Phaser Graphics.
   * Produces a 3-face illusion (top, left slope, right slope) with a subtle
   * neon-blue palette to complement the dark background.
   */
  _generateTileTexture() {
    const g   = this.make.graphics({ x: 0, y: 0, add: false })
    const hw  = TILE_W / 2  // half-width
    const hh  = TILE_H / 2  // half-height

    // ── Top face of the iso cube (the floor the character stands on) ─────
    g.fillStyle(0x1e3a5f, 1)
    g.fillPoints([
      { x: hw,      y: 0       },   // top vertex
      { x: TILE_W,  y: hh      },   // right vertex
      { x: hw,      y: TILE_H  },   // bottom vertex
      { x: 0,       y: hh      },   // left vertex
    ], true)

    // ── Top-face highlight (lighter centre strip for depth) ───────────────
    g.fillStyle(0x2d5a8e, 0.6)
    g.fillPoints([
      { x: hw,          y: 4        },
      { x: TILE_W - 4,  y: hh       },
      { x: hw,          y: TILE_H - 4 },
      { x: 4,           y: hh       },
    ], true)

    // ── Grid edge lines ──────────────────────────────────────────────────
    g.lineStyle(1, 0x0d2b4a, 0.9)
    g.beginPath()
    g.moveTo(hw, 0)
    g.lineTo(TILE_W, hh)
    g.lineTo(hw, TILE_H)
    g.lineTo(0, hh)
    g.closePath()
    g.strokePath()

    g.generateTexture('tile', TILE_W, TILE_H)
    g.destroy()
  }

  /**
   * _generateHeroSpritesheet
   *
   * Draws an 8-frame character spritesheet (4 idle + 4 working) into a single
   * HERO_FRAME_W × HERO_FRAMES wide by HERO_FRAME_H tall texture, then
   * registers each frame's pixel bounds so Phaser's animation system can
   * reference individual frames by integer index.
   *
   * Frame layout:  [0][1][2][3] = idle   [4][5][6][7] = working
   */
  _generateHeroSpritesheet() {
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    for (let f = 0; f < HERO_FRAMES; f++) {
      const fx        = f * HERO_FRAME_W          // left edge of this frame
      const isWorking = f >= 4                     // frames 4–7 are "working"
      // Vertical bob: gentle sine oscillation makes the idle animation feel alive
      const bob       = Math.round(Math.sin((f % 4) * (Math.PI / 2)) * 2)
      const bodyY     = 18 + bob

      // ── Head ─────────────────────────────────────────────────────────────
      g.fillStyle(isWorking ? 0xfde68a : 0xfbbf24, 1)   // warmer tint when working
      g.fillCircle(fx + 24, bodyY, 10)

      // ── Visor / eyes ─────────────────────────────────────────────────────
      g.fillStyle(0x0ea5e9, 1)
      g.fillRect(fx + 18, bodyY - 3, 12, 4)

      // ── Torso ─────────────────────────────────────────────────────────────
      g.fillStyle(isWorking ? 0x0ea5e9 : 0x3b82f6, 1)
      g.fillRoundedRect(fx + 15, bodyY + 10, 18, 16, 3)

      // ── Arms: raised when working, relaxed when idle ───────────────────
      g.fillStyle(isWorking ? 0xfbbf24 : 0x60a5fa, 1)
      if (isWorking) {
        // Arms raised — typing / building gesture
        const armBob = Math.round(Math.sin((f % 4) * Math.PI) * 3)
        g.fillRect(fx + 6,  bodyY + 10 - armBob, 8, 10)   // left arm up
        g.fillRect(fx + 34, bodyY + 10 - armBob, 8, 10)   // right arm up
      } else {
        // Arms at sides
        g.fillRect(fx + 6,  bodyY + 12, 8, 14)
        g.fillRect(fx + 34, bodyY + 12, 8, 14)
      }

      // ── Legs ──────────────────────────────────────────────────────────────
      const legStep = isWorking ? Math.round(Math.sin((f % 4) * (Math.PI / 2)) * 3) : 0
      g.fillStyle(0x1e3a5f, 1)
      g.fillRect(fx + 16, bodyY + 26,      8, 14 + legStep)   // left leg
      g.fillRect(fx + 25, bodyY + 26,      8, 14 - legStep)   // right leg

      // ── Feet ──────────────────────────────────────────────────────────────
      g.fillStyle(0x0f172a, 1)
      g.fillRect(fx + 14, bodyY + 40 + legStep,  10, 4)
      g.fillRect(fx + 25, bodyY + 40 - legStep,  10, 4)
    }

    // Generate the full spritesheet texture
    g.generateTexture('hero_iso', HERO_FRAME_W * HERO_FRAMES, HERO_FRAME_H)
    g.destroy()

    // Register individual frame bounds so the animation system can index them
    const texture = this.textures.get('hero_iso')
    for (let i = 0; i < HERO_FRAMES; i++) {
      texture.add(i, 0, i * HERO_FRAME_W, 0, HERO_FRAME_W, HERO_FRAME_H)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — isometric grid
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildIsoGrid
   *
   * Places GRID_COLS × GRID_ROWS floor tiles using the isometric projection:
   *   screenX = originX + (col − row) × (TILE_W / 2)
   *   screenY = originY + (col + row) × (TILE_H / 2)
   *
   * The origin is chosen so the grid is centred horizontally and sits in the
   * upper-centre area of the canvas, leaving space for the HUD panel below.
   */
  _buildIsoGrid() {
    const { width, height } = this.scale

    // Grid visual centre — leave HUD panel at the bottom ~20 %
    this._isoOriginX = width  / 2
    this._isoOriginY = height * 0.30

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = this._isoPos(col, row)
        this.add
          .image(x, y, 'tile')
          .setOrigin(0.5, 0.5)
          // Alternate colour tint on even tiles for a checkerboard-like depth cue
          .setTint((col + row) % 2 === 0 ? 0xffffff : 0xaaccee)
      }
    }
  }

  /**
   * _isoPos
   *
   * Converts a grid coordinate (col, row) to screen pixel coordinates using
   * the standard 2:1 isometric projection centred on `_isoOriginX/Y`.
   *
   * @param {number} col  – zero-based column index (left → right in grid space)
   * @param {number} row  – zero-based row index    (top  → bottom in grid space)
   * @returns {{ x: number, y: number }}
   */
  _isoPos(col, row) {
    return {
      x: this._isoOriginX + (col - row) * (TILE_W / 2),
      y: this._isoOriginY + (col + row) * (TILE_H / 2),
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — character sprite + animations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildCharacter
   *
   * Places a character sprite on the centre tile (2, 2) of the 5×5 grid and
   * defines two looping animations:
   *
   *   `idle`    — frames 0–3, 4 fps — gentle bobbing at rest
   *   `working` — frames 4–7, 8 fps — arms-up typing / building pose
   *
   * The character's origin is set to (0.5, 1) so the bottom of the sprite
   * aligns with the centre of the tile, giving the appearance of standing on
   * the floor surface.
   */
  _buildCharacter() {
    // Position: centre tile of the 5×5 grid (col=2, row=2)
    const { x, y } = this._isoPos(2, 2)

    // The tile's "standing surface" is at tile-centre Y; shift up by tile
    // half-height so the sprite base sits on the diamond face.
    this._character = this.add
      .sprite(x, y - TILE_H / 2, 'hero_iso', 0)
      .setOrigin(0.5, 1)
      .setScale(1.1)         // slight upscale improves readability on small screens

    // ── Animation: idle (frames 0–3) ──────────────────────────────────────
    if (!this.anims.exists(ANIM_IDLE)) {
      this.anims.create({
        key:       ANIM_IDLE,
        frames:    this.anims.generateFrameNumbers('hero_iso', { start: 0, end: 3 }),
        frameRate: 4,
        repeat:    -1,   // loop forever
      })
    }

    // ── Animation: working (frames 4–7) ───────────────────────────────────
    if (!this.anims.exists(ANIM_WORKING)) {
      this.anims.create({
        key:       ANIM_WORKING,
        frames:    this.anims.generateFrameNumbers('hero_iso', { start: 4, end: 7 }),
        frameRate: 8,    // faster — conveys urgency during boost
        repeat:    -1,
      })
    }

    // Start in idle state
    this._character.play(ANIM_IDLE)
    this._currentAnim = ANIM_IDLE

    // Subtle depth-float tween to give life to the idle pose
    this.tweens.add({
      targets:  this._character,
      y:        { from: this._character.y, to: this._character.y - 4 },
      duration: 1400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 1 — HUD construction
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildHUD
   *
   * Creates a translucent dark panel at the bottom of the canvas and adds
   * three text objects:
   *   • Total Coins      — populated by `_fetchStatus`
   *   • Production Rate  — colour changes when boost is active
   *   • Boost Active     — hidden by default; revealed on `is_boosting`
   */
  _buildHUD() {
    const { width, height } = this.scale
    const panelH = Math.round(height * 0.22)
    const panelY = height - panelH

    // ── Panel background ──────────────────────────────────────────────────
    this.add
      .rectangle(0, panelY, width, panelH, 0x0d1117, 0.88)
      .setOrigin(0, 0)

    // Subtle top border line
    this.add
      .rectangle(0, panelY, width, 2, 0x1e3a5f)
      .setOrigin(0, 0)

    // ── Column layout: three evenly-spaced stat blocks ─────────────────────
    const col1X = width * 0.20
    const col2X = width * 0.50
    const col3X = width * 0.80
    const labelY = panelY + panelH * 0.22
    const valueY = panelY + panelH * 0.56
    const boostY = panelY + panelH * 0.82

    const labelStyle = {
      fontFamily: '"Orbitron", monospace',
      fontSize:   `${Math.round(height * 0.022)}px`,
      color:      CLR_DIM,
      align:      'center',
    }
    const valueStyle = {
      fontFamily: '"Orbitron", monospace',
      fontSize:   `${Math.round(height * 0.038)}px`,
      color:      CLR_TEXT,
      fontStyle:  'bold',
      align:      'center',
    }

    // ── Coin counter ───────────────────────────────────────────────────────
    this.add.text(col1X, labelY, 'TOTAL COINS', labelStyle).setOrigin(0.5)
    this._coinDot = this.add.circle(col1X - 58, valueY, 8, 0xfbbf24)  // fixed offset
    this._txtCoins = this.add
      .text(col1X, valueY, '0', { ...valueStyle, color: CLR_COIN })
      .setOrigin(0.5)

    // ── Production rate ────────────────────────────────────────────────────
    this.add.text(col2X, labelY, 'PRODUCTION /s', labelStyle).setOrigin(0.5)
    this._txtProdRate = this.add
      .text(col2X, valueY, '0', valueStyle)
      .setOrigin(0.5)

    // ── Boost Active indicator (hidden until is_boosting is true) ──────────
    this.add.text(col3X, labelY, 'STATUS', labelStyle).setOrigin(0.5)
    this._txtStatus = this.add
      .text(col3X, valueY, 'IDLE', { ...valueStyle, color: CLR_DIM })
      .setOrigin(0.5)
    this._txtBoost = this.add
      .text(col3X, boostY, '⚡ BOOST ACTIVE', {
        fontFamily: '"Orbitron", monospace',
        fontSize:   `${Math.round(height * 0.022)}px`,
        color:      CLR_BOOST_ON,
        fontStyle:  'bold',
        align:      'center',
      })
      .setOrigin(0.5)
      .setVisible(false)   // hidden until is_boosting === true

    // Pulsing tween on the boost label for visual emphasis
    this.tweens.add({
      targets:  this._txtBoost,
      alpha:    { from: 0.6, to: 1.0 },
      duration: 600,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })

    // ── Bottom status bar for network feedback ─────────────────────────────
    this._txtNet = this.add
      .text(width / 2, height - 6, 'Connecting…', {
        fontFamily: '"Rajdhani", sans-serif',
        fontSize:   `${Math.round(height * 0.018)}px`,
        color:      CLR_DIM,
        align:      'center',
      })
      .setOrigin(0.5, 1)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 3 — Backend polling
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _startPolling
   *
   * Registers a repeating Phaser TimerEvent that fires every POLL_INTERVAL ms.
   * The timer calls `_fetchStatus()` which is async; Phaser doesn't await it,
   * so the callback is wrapped in an immediately-invoked async IIFE to allow
   * proper error handling without leaking unhandled promise rejections into the
   * Phaser event loop.
   *
   * The first fetch is triggered immediately (delay: 0) so the HUD populates
   * before the first timer tick.
   */
  _startPolling() {
    if (this._polling) return
    this._polling = true

    // Immediately fire the first fetch so the HUD is populated at startup
    this._fetchStatus()

    // Repeating timer — fires every POLL_INTERVAL ms thereafter
    this.time.addEvent({
      delay:    POLL_INTERVAL,
      loop:     true,
      callback: () => { this._fetchStatus() },
      callbackScope: this,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 3 + TASK 4 — Async data fetch & visual update
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _fetchStatus
   *
   * Fetches live economy data from the FastAPI backend and updates the Phaser
   * scene accordingly.  This method is async but is called fire-and-forget from
   * the Phaser timer — errors are caught internally and surfaced only in the
   * bottom status bar, never crashing the game loop.
   *
   * Expected JSON response shape:
   * ```json
   * { "total_coins": 1234, "production_rate": 56.7, "is_boosting": false }
   * ```
   *
   * @returns {Promise<void>}
   */
  async _fetchStatus() {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const res  = await fetch(STATUS_URL, { signal: controller.signal })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }

      /** @type {{ total_coins: number, production_rate: number, is_boosting: boolean }} */
      const data = await res.json()

      // ── Task 3: Update HUD text ─────────────────────────────────────────
      this._txtCoins.setText(this._formatCoins(data.total_coins ?? 0))
      this._txtProdRate.setText(`${this._formatRate(data.production_rate ?? 0)}/s`)
      this._txtNet.setText(`Last updated: ${new Date().toLocaleTimeString()}`)

      // ── Task 4: Data-driven animation + colour ──────────────────────────
      this._applyBoostState(!!data.is_boosting)

    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error')
      // Surface the error in the status bar without crashing
      if (this._txtNet?.active) {
        this._txtNet.setText(`⚠ ${msg}`)
        this._txtNet.setColor('#f87171')
      }
      console.debug('[IsoTycoonScene] Poll error:', msg)
    } finally {
      clearTimeout(timeout)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 4 — Boost-state animation + colour transitions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _applyBoostState
   *
   * Applies is_boosting to the scene visuals.  All transitions are idempotent:
   * if the boost state has not changed since the last poll, neither the
   * animation nor the text colour is modified, preventing redundant restarts.
   *
   * When is_boosting is true:
   *   • Character plays the `working` animation (faster, arms-up).
   *   • Production Rate text turns CLR_PROD_BOOST (#ff0055).
   *   • "⚡ BOOST ACTIVE" indicator becomes visible.
   *   • Status text reads "BOOSTING".
   *
   * When is_boosting is false:
   *   • Character reverts to `idle` animation.
   *   • Production Rate text resets to CLR_TEXT.
   *   • Boost indicator is hidden.
   *   • Status text reads "IDLE".
   *
   * @param {boolean} boosting – current is_boosting value from the backend
   */
  _applyBoostState(boosting) {
    // Guard: skip update if state hasn't changed (avoids anim restart + flicker)
    if (boosting === this._isBoosting) return
    this._isBoosting = boosting

    if (boosting) {
      // Switch to working animation only if not already playing it
      if (this._character?.anims.currentAnim?.key !== ANIM_WORKING) {
        this._character?.play(ANIM_WORKING, true)
      }
      this._txtProdRate?.setColor(CLR_PROD_BOOST)
      this._txtStatus?.setText('BOOSTING').setColor(CLR_BOOST_ON)
      this._txtBoost?.setVisible(true)
    } else {
      // Revert to idle animation
      if (this._character?.anims.currentAnim?.key !== ANIM_IDLE) {
        this._character?.play(ANIM_IDLE, true)
      }
      this._txtProdRate?.setColor(CLR_TEXT)
      this._txtStatus?.setText('IDLE').setColor(CLR_DIM)
      this._txtBoost?.setVisible(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE — formatting helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Format a coin count as a compact string with suffix (K / M / B).
   * @param {number} n
   * @returns {string}
   */
  _formatCoins(n) {
    if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`
    if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`
    return Math.floor(n).toString()
  }

  /**
   * Format a production rate, showing one decimal place for readability.
   * @param {number} n
   * @returns {string}
   */
  _formatRate(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toFixed(1)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE USAGE EXAMPLE
// ─────────────────────────────────────────────────────────────────────────────
//
// To spin up this scene as a standalone Phaser game (e.g. in a dedicated
// React component or as an independent HTML page), use the config below:
//
//   import Phaser          from 'phaser'
//   import IsoTycoonScene  from './IsoTycoonScene'
//
//   const isoGame = new Phaser.Game({
//     type:            Phaser.AUTO,      // WebGL with Canvas fallback for mobile
//     backgroundColor: '#1a1a2e',
//     parent:          'iso-game-container',   // id of a <div> in the DOM
//     scale: {
//       mode:       Phaser.Scale.FIT,
//       autoCenter: Phaser.Scale.CENTER_BOTH,
//       width:      800,
//       height:     600,
//     },
//     scene: [IsoTycoonScene],
//   })
//
// The Vite dev server already proxies /api → http://localhost:8000, so
// STATUS_URL = '/api/tycoon/status' works without any extra config during
// local development.  For standalone testing against a running FastAPI server
// without the Vite proxy, change STATUS_URL to:
//   'http://127.0.0.1:8000/api/tycoon/status'
