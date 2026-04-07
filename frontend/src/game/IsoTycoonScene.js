import * as Phaser from 'phaser'
import * as GameEventBus from '../utils/GameEventBus'
import { FLOORS as ECONOMY_FLOORS, isUpgradeBlocked, INFRA_ROOMS, aggregateInfraLevel, HQ_PRESTIGE_TIERS, computeHqTier } from '../utils/EconomyEngine'
import { FloatingTextManager } from '../utils/FloatingTextManager'
import { ObjectPool } from '../utils/ObjectPool.js'
import { PropAttachmentSystem } from './PropAttachmentSystem.js'
import { NpcSpeechBubble } from './NpcSpeechBubble.js'
import { easeOutBack, easeInQuad } from '../utils/easings.js'
import { createWorkerTree, Status } from '../utils/WorkerBehaviorTree.js'
import { playClick, playCoin, playUpgrade } from '../utils/SoundEngine'
import { PET_DEFS_MAP } from '../utils/MascotSystem.js'
import { findPath, GRID_COLS, GRID_ROWS } from '../utils/PathfindingEngine.js'
import { computeMoodMultiplier } from '../utils/HRManager.js'
import { simToCanvas, buildFloorCoords, buildInfraOrig } from '../utils/SimulationCoordSpace.js'

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
 *  Phase 5 — Camera click-drag pan + setBounds; FLOOR_COORDINATES constant;
 *             spawnWorkstation(pillarName, floorNumber) public API;
 *             attachHeroToWorkstation(key, ws, offsetX, offsetY) public API.
 *  Phase 6 — Fredoka One bubbly font; _fitText() auto-scaling utility;
 *             Tutorial overlay: speech bubble + bouncing hand, 2-step sequence.
 *  Phase 7 — Resource pipeline: spawnResource() Math Token tween (Task 1);
 *             Elevator state machine IDLE→RISING→COLLECTING→DESCENDING→CASH_OUT
 *             with setElevatorSpeed() / setElevatorCapacity() upgrade hooks (Task 2);
 *             _spawnCashPopup() +$X overlay, triggerConfetti() Prime Refactor
 *             screen-wide celebration emitter (Task 3).
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

// ─── Floor grid coordinates  (Phase 5, Task 3 / Phase 3A) ───────────────────
//
//  Maps building floor number (1 = ground floor, 7 = penthouse) to the canvas
//  pixel position used as the isometric Y-origin for that floor's tile plane.
//  Calibrated for the 800 × 450 game canvas and the 7-floor building-bg.svg.
//  The 2:1 isometric projection (TILE_W:TILE_H = 2:1) is baked into these values.
//
//  Floor coordinates are now computed dynamically at scene-create time via
//  _buildFloorCoords() using normalised origins from SimulationCoordSpace.js.
//  This removes the dependency on the fixed 800×450 canvas size.
//  Instance property: this._floorCoords — replaces the old module-level constant.
//

// ─── Infrastructure room positions — basement row below ground floor ──────────
//
//  Three diegetic rooms anchored to the secondary-resource pipelines:
//    power  → Energy / production buffer (⚡)
//    server → Maintenance / compiler queue (⚙️)
//    hr     → Scheduling / data-bus transfer (🛗)
//
//  Infrastructure coords are now computed dynamically at scene-create time via
//  _buildInfraCoords() using buildInfraOrig() from SimulationCoordSpace.js.
//  Instance property: this._infraCoords — replaces the old module-level constants.
//
// ─── Isometric column pattern for 7 floors across a 5-column grid ────────────
//
//  Floors are spread across columns 0, 2, 4 (left, centre, right) in a
//  repeating pattern so all 7 workstations are visible without overlap.
//  Each stacked ECONOMY_FLOORS entry (index 0-6) occupies its own building
//  floor (floorNumber 1-7) so the scene matches the React economy's floor order.
//
const _FLOOR_COLS = [0, 2, 4, 1, 3, 0, 2]   // col per FLOORS array index (0-6)

// Guard: catch configuration mismatches at module load time.
if (_FLOOR_COLS.length !== ECONOMY_FLOORS.length) {
  throw new Error(
    `[IsoTycoonScene] _FLOOR_COLS length (${_FLOOR_COLS.length}) must match ` +
    `ECONOMY_FLOORS length (${ECONOMY_FLOORS.length})`
  )
}

// ─── Workstation definitions: generated from the 7 ECONOMY_FLOORS  (Phase 3A) ─
//
//  Each entry maps one economy floor to an isometric workstation.  The
//  accent colour is taken directly from the hero floor definition so the
//  Phaser tint matches the React UI colour.
//
//  Fields consumed by _buildWorkstations:
//    id, label, col, row, floorNumber, spriteKey,
//    animIdle, animWork, idleFrames, workFrames, idleFps, workFps,
//    accentNum, accentStr, machineKey, baseCost
//
const WORKSTATION_DEFS = ECONOMY_FLOORS.map((def, i) => {
  // Parse the CSS hex colour string from EconomyEngine into a Phaser-compatible
  // integer tint (e.g. '#a855f7' → 0xa855f7).
  const accentNum = parseInt(def.color.replace('#', ''), 16)
  return {
    id:          def.id,
    label:       def.short,
    desc:        def.desc,
    col:         _FLOOR_COLS[i],
    row:         2,
    floorNumber: i + 1,                 // floor 1 (ground) = FLOORS[0], floor 7 = FLOORS[6]
    spriteKey:   'hero_iso',            // all 7 hero floors use the same character sheet
    animIdle:    `${def.id}_idle`,
    animWork:    `${def.id}_work`,
    idleFrames:  { start: 0, end: 3 },
    workFrames:  { start: 4, end: 7 },
    idleFps:     4,
    workFps:     10,
    accentNum,
    accentStr:   def.color,
    machineKey:  'desk_lvl1',           // upgrades via VISUAL_TIERS (all desks at start)
    baseCost:    def.baseCost,
    roomTheme:   def.roomTheme,
  }
})

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
// Map each workstation id to its machine-sprite texture prefix (all hero floors → 'desk')
const WS_TEXTURE_PREFIX = Object.fromEntries(ECONOMY_FLOORS.map(f => [f.id, 'desk']))

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

// ─── Fonts  (Phase 6) ─────────────────────────────────────────────────────────
//
//  FONT_BUBBLE: bubbly rounded cartoon font for labels, HUD values, and tutorial.
//               "Fredoka One" (Google Fonts, imported in index.html).
//               Falls back gracefully to the system sans-serif if not yet loaded.
//
//  FONT_HUD:    slightly more technical font for secondary HUD labels and
//               the status indicator row.  "Rajdhani" continues to be used here
//               for its narrow, techy feel that does not clash with the bubbles.
//
const FONT_BUBBLE  = '"Fredoka One", "Patrick Hand", cursive'
const FONT_HUD     = '"Rajdhani", sans-serif'

// ─── Upgrade cost: baseCost * 1.5^(level-1) ──────────────────────────────────
const upgradeCost = (baseCost, level) =>
  Math.ceil(baseCost * Math.pow(1.5, Math.max(0, level - 1)))

// ─── Resource Pipeline constants  (Tasks 1 + 2 + 3) ─────────────────────────
//
//  All X values assume the 800 × 450 nominal canvas.  Adjust ELEVATOR_SHAFT_X
//  and PICKUP_ZONE_X to align with the visual shaft in building-bg.svg.
//
//  Pipeline flow:
//    Production desk  →  pickup zone  →  elevator  →  sales desk  →  HUD cash
//
const ELEVATOR_SHAFT_X    = 100   // horizontal centre of the elevator shaft
const PICKUP_ZONE_X       = 175   // x where tokens queue for the elevator
const RESOURCE_DEPTH      = 160   // above workstations, below HUD (200)
const ELEVATOR_DEPTH      = 162   // elevator car above waiting tokens
const CASH_POPUP_DEPTH    = 195   // floating "+$X" text — just below HUD (200)
const CONFETTI_DEPTH      = 305   // above bounty emitter (310-1) — full-screen

// Default pipeline speeds — all overridable at runtime via setXxx() methods
// or when the backend returns `production_speed` / `elevator_speed` fields.
const DEFAULT_PROD_SPEED    = 2000   // ms to tween one token from desk to pickup
const DEFAULT_ELEV_SPEED    = 900    // ms per floor of elevator travel
const DEFAULT_ELEV_CAPACITY = 5      // max tokens loaded per elevator trip

// ─── Cash popup formatting thresholds ────────────────────────────────────────
const CASH_MILLION = 1_000_000
const CASH_THOUSAND = 1_000
const ELEV_RISING      = 'RISING'
const ELEV_COLLECTING  = 'COLLECTING'
const ELEV_DESCENDING  = 'DESCENDING'
const ELEV_CASH_OUT    = 'CASH_OUT'

// ─── Room Theme Manager ───────────────────────────────────────────────────────
//
//  Maps each floor's roomTheme identifier to a distinct visual configuration.
//  instantiate() draws a themed isometric room tile at the given canvas position.
//
const ROOM_THEME_DEPTH = 30   // above grid tiles (0-24), below workstations (50+)

// ─── Construction Phase ───────────────────────────────────────────────────────
//
//  Duration (ms) of the visual construction phase that plays between the cost
//  deduction and the revenue-multiplier being applied.  Tuned to feel like
//  meaningful progress without frustrating the player.
//
const CONSTRUCTION_DURATION_MS = 8_000
const CONSTRUCTION_DEPTH       = 200  // above workstations (50+) + HUD (200 — render ON TOP)

/**
 * ConstructionOverlay
 *
 * 2.5D procedural construction prefab that sits above a workstation grid cell
 * while a floor upgrade is pending.  Draws scaffolding poles, crossbeams, and
 * paint-bucket props using Phaser Graphics, then animates a progress bar using
 * the scene's delta time so it stays frame-rate independent.
 *
 * Lifecycle:
 *   1. Instantiated by IsoTycoonScene when 'floor:construction:start' fires.
 *   2. Ticked every frame via ConstructionOverlay.update(delta).
 *   3. When elapsed >= duration, fires 'floor:construction:complete' and
 *      destroys all its owned Phaser objects.
 *
 * Design notes:
 *   • The overlay is drawn in screen space (same coordinate system as the
 *     bubble containers) so it moves correctly with camera pans.
 *   • All geometry is procedural — no external texture files required.
 */
class ConstructionOverlay {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}       screenX   – Canvas X of the workstation centre.
   * @param {number}       screenY   – Canvas Y of the workstation sprite top.
   * @param {number}       duration  – Total construction time (ms).
   * @param {string}       floorId   – Workstation id — forwarded in the complete event.
   * @param {number}       newLevel  – Target level after construction finishes.
   * @param {number}       accentNum – Accent colour tint (from workstation def).
   */
  constructor(scene, screenX, screenY, duration, floorId, newLevel, accentNum) {
    this._scene    = scene
    this._screenX  = screenX
    this._screenY  = screenY
    this._duration = duration
    this._elapsed  = 0
    this._floorId  = floorId
    this._newLevel = newLevel
    this._accent   = accentNum
    this._done     = false

    /** @private @type {Phaser.GameObjects.Container|null} */
    this._container = null
    /** @private @type {Phaser.GameObjects.Graphics|null} Progress bar fill. */
    this._barFill   = null

    this._build()
  }

  // ── Public ──────────────────────────────────────────────────────────────────

  /**
   * Advance the construction timer.  Call from IsoTycoonScene.update() every
   * frame while the overlay is active.
   * @param {number} delta – Frame delta in milliseconds.
   */
  update(delta) {
    if (this._done || !this._container?.active) return

    this._elapsed = Math.min(this._elapsed + delta, this._duration)
    const progress = this._elapsed / this._duration  // 0 → 1

    // Animate the progress bar fill width
    if (this._barFill?.active) {
      const maxW = CONSTRUCTION_BAR_W - 4
      this._barFill.clear()
      this._barFill.fillStyle(this._accent, 1)
      this._barFill.fillRoundedRect(0, 0, maxW * progress, CONSTRUCTION_BAR_H - 4, 3)
    }

    // Pulse the scaffolding alpha for a lively feel
    const pulse = 0.75 + 0.25 * Math.sin(this._elapsed / 300)
    if (this._container?.active) this._container.setAlpha(pulse)

    if (this._elapsed >= this._duration) this._complete()
  }

  /**
   * Immediately destroy the overlay without firing the complete event.
   * Used during scene shutdown or prestige resets.
   */
  destroy() {
    this._done = true
    this._destroyObjects()
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** @private */
  _build() {
    const cx = this._screenX
    const cy = this._screenY

    this._container = this._scene.add
      .container(cx, cy)
      .setDepth(CONSTRUCTION_DEPTH)

    const gfx = this._scene.add.graphics()
    this._drawScaffolding(gfx)
    this._container.add(gfx)

    // ── Timer bar (background + fill) ────────────────────────────────────────
    const bx = -CONSTRUCTION_BAR_W / 2
    const by = CONSTRUCTION_BAR_OFFSET_Y

    const barBg = this._scene.add.graphics()
    barBg.fillStyle(0x1a1a2e, 0.9)
    barBg.fillRoundedRect(bx, by, CONSTRUCTION_BAR_W, CONSTRUCTION_BAR_H, 4)
    barBg.lineStyle(1, 0x444466, 1)
    barBg.strokeRoundedRect(bx, by, CONSTRUCTION_BAR_W, CONSTRUCTION_BAR_H, 4)
    this._container.add(barBg)

    this._barFill = this._scene.add.graphics()
    // Position fill slightly inset from the bg
    this._barFill.setPosition(bx + 2, by + 2)
    this._container.add(this._barFill)

    // ── "BUILDING…" label ─────────────────────────────────────────────────────
    const label = this._scene.add.text(0, by + CONSTRUCTION_BAR_H + 4, 'BUILDING…', {
      fontFamily: '"Fredoka One", cursive',
      fontSize:   '9px',
      color:      '#fbbf24',
      align:      'center',
    }).setOrigin(0.5, 0)
    this._container.add(label)

    // Entrance pop tween
    this._container.setAlpha(0)
    this._scene.tweens.add({
      targets:  this._container,
      alpha:    1,
      duration: 250,
      ease:     'Back.easeOut',
    })
  }

  /**
   * @private Draw scaffolding poles, crossbeams, and paint buckets.
   * All coordinates are relative to the container origin (workstation centre).
   * @param {Phaser.GameObjects.Graphics} g
   */
  _drawScaffolding(g) {
    const W = TILE_W * 0.9
    const H = TILE_H * 3.2
    const top = -H
    const leftPole  = -W / 2 + 6
    const rightPole =  W / 2 - 6

    // ── Outer vertical poles ──────────────────────────────────────────────────
    g.lineStyle(4, 0xf59e0b, 0.9)
    g.strokeRect(leftPole,  top,     4, H)  // left pole
    g.strokeRect(rightPole, top,     4, H)  // right pole

    // ── Horizontal crossbeams (evenly spaced) ─────────────────────────────────
    g.lineStyle(3, 0xf59e0b, 0.7)
    const BEAM_COUNT = 4
    for (let i = 0; i <= BEAM_COUNT; i++) {
      const by = top + (H * i) / BEAM_COUNT
      g.strokeLineShape(new Phaser.Geom.Line(leftPole, by, rightPole + 4, by))
    }

    // ── Diagonal braces ───────────────────────────────────────────────────────
    g.lineStyle(2, 0xf59e0b, 0.5)
    for (let i = 0; i < BEAM_COUNT; i++) {
      const y1 = top + (H * i) / BEAM_COUNT
      const y2 = top + (H * (i + 1)) / BEAM_COUNT
      // alternating direction
      if (i % 2 === 0) {
        g.strokeLineShape(new Phaser.Geom.Line(leftPole, y1, rightPole + 4, y2))
      } else {
        g.strokeLineShape(new Phaser.Geom.Line(rightPole + 4, y1, leftPole, y2))
      }
    }

    // ── Paint buckets (small coloured cylinders at base) ──────────────────────
    const bucketY = -12
    const buckets = [
      { x: leftPole  + 10, color: 0xff6666 },
      { x: leftPole  + 22, color: 0x66aaff },
      { x: rightPole - 16, color: 0xffdd44 },
    ]
    buckets.forEach(({ x, color }) => {
      g.fillStyle(color, 0.9)
      g.fillEllipse(x, bucketY - 4, 10, 5)      // bucket top
      g.fillRect(x - 5, bucketY - 4, 10, 9)     // bucket body
      g.fillStyle(color, 0.6)
      g.fillEllipse(x, bucketY + 5, 10, 5)      // bucket bottom
    })

    // ── Hardhat sign ─────────────────────────────────────────────────────────
    g.fillStyle(0xffdd44, 0.95)
    g.fillRoundedRect(-18, top + 6, 36, 14, 3)
    g.lineStyle(1, 0x111111, 0.8)
    g.strokeRoundedRect(-18, top + 6, 36, 14, 3)
  }

  /** @private */
  _complete() {
    if (this._done) return
    this._done = true

    // Fade out before destroying.
    // The construction timer is now owned by the React simulation layer
    // (a plain setTimeout in GamePlayerPage.handleBuyFloor).  This overlay
    // is purely cosmetic — it does not fire any event that affects economy state.
    this._scene.tweens.add({
      targets:  this._container,
      alpha:    0,
      duration: 300,
      ease:     'Sine.easeIn',
      onComplete: () => this._destroyObjects(),
    })
  }

  /** @private */
  _destroyObjects() {
    if (this._container?.active) this._container.destroy()
    this._container = null
    this._barFill   = null
  }
}

// ── Layout constants for ConstructionOverlay (extracted for clarity) ──────────
const CONSTRUCTION_BAR_W        = 72    // px — timer bar total width
const CONSTRUCTION_BAR_H        = 10    // px — timer bar height
const CONSTRUCTION_BAR_OFFSET_Y = 8     // px below container origin → below scaffolding

class RoomThemeManager {
  static THEMES = {
    SpellLab:   { fill: 0x3d0070, stroke: 0xa855f7 },
    BattleDojo: { fill: 0x5c1a00, stroke: 0xf97316 },
    MoonStudio: { fill: 0x4d0030, stroke: 0xec4899 },
    SpeedDesk:  { fill: 0x4d3000, stroke: 0xf59e0b },
    PowerCore:  { fill: 0x003d1a, stroke: 0x22c55e },
    StormLab:   { fill: 0x001a5c, stroke: 0x3b82f6 },
    ShadowDen:  { fill: 0x003d4d, stroke: 0x00c8ff },
  }

  /**
   * Draws a themed isometric room tile at the given canvas coordinates.
   * @param {Phaser.Scene} scene
   * @param {keyof typeof RoomThemeManager.THEMES} roomTheme  - theme identifier (e.g. 'SpellLab', 'BattleDojo')
   * @param {number} x          - canvas x centre of the tile
   * @param {number} y          - canvas y centre of the tile
   * @returns {Phaser.GameObjects.Graphics}
   */
  static instantiate(scene, roomTheme, x, y) {
    const theme   = RoomThemeManager.THEMES[roomTheme]
    const hw      = TILE_W / 2
    const hh      = TILE_H / 2
    const diamond = [
      { x: x,      y: y - hh },
      { x: x + hw, y: y      },
      { x: x,      y: y + hh },
      { x: x - hw, y: y      },
    ]
    const gfx = scene.add.graphics()
    gfx.fillStyle(theme.fill, 0.85)
    gfx.fillPoints(diamond, true)
    gfx.lineStyle(2, theme.stroke, 1)
    gfx.strokePoints(diamond, true)
    gfx.setDepth(ROOM_THEME_DEPTH)
    return gfx
  }
}

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
    /** @type {Array<{def,level,isWorking,sprite,machineSprite,screenX,screenY,currentTier,constructionOverlay}>} */
    this._workstations   = []
    /** @type {Array<{sprite:Phaser.GameObjects.GameObject,yOffset:number}>} */
    this._depthSortGroup = []      // Y-sorted interactive sprites (Task 9)
    /** @type {Map<string, {sprite:Phaser.GameObjects.Sprite, petId:string, roamTimer:Phaser.Time.TimerEvent}>} */
    this._mascots        = new Map() // petId → mascot runtime
    /** @type {Map<string, {sprite:Phaser.GameObjects.GameObject,yOffset:number}>} */
    this._managerNpcs    = new Map() // floorId → supervisor NPC (diegetic manager)

    // ── Resource pipeline state  (Tasks 1 + 2 + 3) ───────────────────────
    this._productionSpeed    = DEFAULT_PROD_SPEED    // ms/token tween
    this._elevatorSpeed      = DEFAULT_ELEV_SPEED    // ms/floor of travel
    this._elevatorCapacity   = DEFAULT_ELEV_CAPACITY // tokens per trip
    this._elevatorCar        = null    // Phaser Image — elevator car sprite
    this._elevatorState      = ELEV_IDLE
    this._elevatorFloor      = 1       // floor the car is currently at
    this._elevatorPayload    = 0       // tokens currently aboard
    /** @type {Map<number, {tokens: Phaser.GameObjects.Image[], x: number, y: number}>} */
    this._pickupZones        = new Map()
    this._confettiEmitter    = null    // Prime Refactor celebration emitter
    this._lastCoins          = 0       // previous poll total_coins (for delta popup)
    this._prodSpawnEvent     = null    // repeating Phaser TimerEvent for auto-spawn
    this._floatingTextMgr    = null    // overlay canvas floating-text manager
    this._cashPopupPool      = null    // ObjectPool<Phaser.GameObjects.Text> for +$X popups
    this._infraLevel         = 1       // infrastructure room level; raised by status poll
    // Environmental boost props (Command 3)
    this._coffeeProp         = null    // clickable coffee machine → OVERDRIVE
    this._vipProp            = null    // clickable VIP investor NPC → FRENZY
    this._coffeeSteam        = null    // looping steam emitter on coffee machine
    this._vipSparkle         = null    // looping sparkle emitter on VIP investor
    this._boostPropPollEvent = null    // 500 ms timer for ready-state updates
    // Infrastructure rooms (Command 1)
    this._infraRoomSprites   = {}      // roomId → Phaser.GameObjects.Image
    this._infraRoomLevels    = { power: 1, server: 1, hr: 1 }
    // Parallax background layers (Exterior Environments)
    this._parallaxLayers     = []      // [{tileSprite, autoSpeed, parallaxFactor}]
    this._parallaxCamX       = 0       // camera scrollX from last frame (parallax delta)
    this._parallaxCamY       = 0       // camera scrollY from last frame (parallax delta)
    // HQ prestige visual tier — updated by sim:hq-tier event from React
    this._hqTier             = 0       // current HQ tier index (0–3)
    this._hqTierApplied      = false   // true after first _applyHqTier() call
    this._skyGfx             = null    // sky gradient Graphics — redrawn by _applyHqTier
    this._frameGfx           = null    // exterior frame Graphics — redrawn by _applyHqTier
    // Floor-navigation camera controller
    this._activeCamFloor = 1    // 1 = ground floor (lowest visible); 7 = penthouse
    this._floorNavTween  = null // active camera pan tween; killed before starting a new one
    this._floorNavBtns   = {}   // { up: GameObject, down: GameObject } for enabled/dim states
    this._floorLabelTxt  = null // text object showing "FLOOR 1 / 7"
  }

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

    // ── Prop attachment asset ─────────────────────────────────────────────
    // prop_clipboard.png: small clipboard/crate held by workers during the
    // "working" state.  Falls back to a procedural 16×20 clipboard shape.
    this.load.image('prop_clipboard', '/assets/prop_clipboard.png')

    // ── NPC character portraits — for speech bubble left-side display ──────
    // Each workstation hero has a unique SVG portrait at /assets/heroes/*.svg.
    // The texture key follows the pattern `portrait_${floorId}` so that
    // showNpcBubble() can look it up by workstation id.
    // A procedural coloured-swatch fallback is generated in
    // _genNpcPortraitFallbacks() for any key that fails to load.
    ECONOMY_FLOORS.forEach(floor => {
      if (floor.img) this.load.image(`portrait_${floor.id}`, floor.img)
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — create  (Tasks 1, 2, 5, 6, 7, 9, 11)
  // ═══════════════════════════════════════════════════════════════════════════

  create() {
    const { width, height } = this.scale

    // Dark background fallback (#0a0e1a) — absolute last resort, rendered furthest back
    this.add.rectangle(0, 0, width, height, 0x0a0e1a).setOrigin(0, 0).setDepth(-20)

    // Building shell background (7-floor isometric cross-section)
    if (!this._assetsMissing.has('building-bg')) {
      this.add.image(width / 2, height / 2, 'building-bg')
        .setDisplaySize(width, height)
        .setDepth(-1)
    }

    // Procedural texture fallbacks (no-ops when real PNGs loaded)
    this._generateFallbackTextures()

    // Exterior environment: sky gradient, parallax cloud bands, building frame
    // Must run AFTER _generateFallbackTextures() so cloud textures are available.
    this._buildParallaxBackground()

    // Compute floor and infra pixel coords from normalised SimulationCoordSpace
    // origins so no raw canvas dimensions are hardcoded in the layout.
    this._buildFloorCoords()
    this._buildInfraCoords()

    // 5x5 isometric floor grid
    this._buildIsoGrid()

    // Three workstations + Y-sort group population (Tasks 5, 6, 9)
    this._buildWorkstations()

    // ── GameEventBus sim:* subscriptions ──────────────────────────────────────
    // These replace the former Phaser registry side-channel.  React emits each
    // event whenever simulation state changes; the scene caches the latest value
    // and responds visually.  Initial state is delivered via 'sim:*' events that
    // React emits in response to the 'render:scene-ready' event emitted below.

    // Diegetic Manager NPCs — spawn supervisor sprites for already-hired managers
    // and watch for future hires / dismissals (e.g. Prime Refactor).
    this._onManagersChanged = ({ floorIds }) => {
      const hired = new Set(Array.isArray(floorIds) ? floorIds : [])
      for (const floorId of [...this._managerNpcs.keys()]) {
        if (!hired.has(floorId)) this._despawnManagerNpc(floorId)
      }
      for (const floorId of hired) this._spawnManagerNpc(floorId)
    }
    this._unsubManagers = GameEventBus.on('sim:managers', this._onManagersChanged)

    // Mascot pets — spawn roaming mascot sprites for newly-active pets and
    // despawn removed ones.
    this._onActivePetsChanged = ({ petIds }) => {
      const nowActive = new Set(Array.isArray(petIds) ? petIds : [])
      for (const petId of [...this._mascots.keys()]) {
        if (!nowActive.has(petId)) this._despawnMascot(petId)
      }
      for (const petId of nowActive) this._spawnMascot(petId)
    }
    this._unsubPets = GameEventBus.on('sim:pets', this._onActivePetsChanged)

    // "Sell Company" visual clear — fires when React triggers a prestige sale.
    this._onSellCompany = () => this._playSellCompanyAnimation()
    this._unsubSellCompany = GameEventBus.on('sim:sell-company', this._onSellCompany)

    // Floor visibility sync — called whenever floor-bin state changes (e.g.
    // after a prestige reset) so that only floors with level > 0 show sprites.
    this._onFloorBinsChanged = ({ bins }) => {
      this._syncWorkstationVisibility(bins)
      this._updateDocumentStacks(bins)
    }
    this._unsubFloorBins = GameEventBus.on('sim:floor-bins', this._onFloorBinsChanged)

    // HQ prestige tier — redraws the background environment palette when the
    // player's cumulative Prime Token count moves into a new tier band.
    this._onHqTierChanged = ({ tierIdx }) => this._applyHqTier(tierIdx)
    this._unsubHqTier = GameEventBus.on('sim:hq-tier', this._onHqTierChanged)

    // HUD panel (Task 1)
    this._buildHUD()

    // Orthographic floor-navigation buttons (▲ / ▼) anchored to right margin
    this._buildFloorNavButtons()

    // Upgrade-success coin burst emitter (Task 7)
    this._buildParticleEmitter()

    // Math Bounty electric particle emitter (Task 11)
    this._buildBountyEmitter()

    // Upward-floating currency emitter for floor-cycle feedback
    this._buildCurrencyEmitter()

    // Infrastructure rooms: Power Generator, Server/IT, HR/Scheduling (Command 1)
    this._buildInfraRooms()
    // Subscribe to infra-level updates so room tints + _infraLevel stay in sync.
    this._onInfraRoomLevelsChanged = ({ power, server, hr }) => {
      this._applyInfraRoomLevels({ power, server, hr })
    }
    this._unsubInfraLevels = GameEventBus.on('sim:infra-levels', this._onInfraRoomLevelsChanged)

    // Skill-state cache — updated via the bus so _tickBoostPropStates can read
    // it without touching the Phaser registry.
    this._skillState = null
    this._onSkillStateChanged = (state) => { this._skillState = state }
    this._unsubSkillState = GameEventBus.on('sim:skill-state', this._onSkillStateChanged)

    // Environmental boost props: coffee machine (OVERDRIVE) + VIP investor (FRENZY)
    this._buildWorldBoostProps()
    this._buildBoostParticles()
    // Poll every 500 ms to sync ready/active/cooldown visual state of the props.
    this._boostPropPollEvent = this.time.addEvent({
      delay: 500, loop: true,
      callback: this._tickBoostPropStates, callbackScope: this,
    })

    // Floating text overlay (HTML5 canvas + rAF loop, decoupled from Phaser)
    const gameParent = this.game.canvas.parentElement
    if (gameParent) {
      this._floatingTextMgr = new FloatingTextManager(gameParent, {
        logicalWidth:  this.scale.width,
        logicalHeight: this.scale.height,
      })
    }

    // Cash-popup object pool — 20 pre-allocated Phaser Text objects cover
    // simultaneous popups from all 7 floors with comfortable headroom.
    // Objects are hidden at rest and activated by _spawnCashPopup(); the
    // tween onComplete releases them back to the pool instead of destroying them.
    {
      const fontSize   = `${Math.round(this.scale.height * 0.044)}px`
      const textStyle  = {
        fontFamily:      FONT_BUBBLE,
        fontSize,
        fontStyle:       'bold',
        color:           '#4ade80',
        stroke:          '#065f46',
        strokeThickness: 3,
        align:           'center',
      }
      this._cashPopupPool = new ObjectPool(
        () => this.add.text(0, 0, '', textStyle)
               .setOrigin(0.5, 1)
               .setDepth(CASH_POPUP_DEPTH)
               .setVisible(false),
        20,
      )
    }

    // Resource pipeline: Math Tokens, elevator, confetti  (Tasks 1 + 2 + 3)
    this._buildResourcePipeline()

    // Click-and-drag camera pan + world bounds (Phase 5, Task 2)
    this._setupCameraDrag()

    // Tutorial onboarding overlay (Phase 6, Task 2)
    this._runTutorial()

    // Begin polling (Tasks 3, 4, 5, 10)
    this._startPolling()

    // Subscribe to economy events emitted by GamePlayerPage via GameEventBus.
    // This makes animation state reactive to the React economy engine without
    // the scene needing to poll or hold a reference to the React component.
    this._busUnsubs = [
      GameEventBus.on('floor:progress', ({ floorId, progress }) => {
        const ws = this._workstations.find(w => w.def.id === floorId)
        if (ws) this._updateAnimationState(ws, progress)
      }),
      GameEventBus.on('floor:cycle', ({ floorId, earned }) => {
        const ws = this._workstations.find(w => w.def.id === floorId)
        if (!ws) return

        // Audio feedback for NPC task completion / coin spawn.
        // playCoin() is a silent no-op when its sound URL is not configured.
        playCoin()

        // Particle burst at the workstation (existing behaviour)
        if (this._currencyEmitter?.active) {
          this._currencyEmitter.setPosition(ws.screenX, ws.screenY - 20)
          this._currencyEmitter.explode(8)
        }

        // Floating text feedback on the overlay canvas
        if (this._floatingTextMgr && earned > 0) {
          // Convert Phaser world coordinates → overlay canvas screen coordinates
          const cam = this.cameras.main
          const sx  = ws.screenX - cam.worldView.x
          const sy  = ws.screenY - cam.worldView.y - 20

          const label = earned >= CASH_MILLION  ? `+$${(earned / CASH_MILLION).toFixed(1)}M`
                      : earned >= CASH_THOUSAND ? `+$${(earned / CASH_THOUSAND).toFixed(1)}K`
                      : `+$${earned}`

          this._floatingTextMgr.spawn(label, sx, sy)
        }
      }),
      GameEventBus.on('floor:upgraded', ({ floorId, newLevel }) => {
        const ws = this._workstations.find(w => w.def.id === floorId)
        if (!ws) return
        // Audio feedback for upgrade finalisation
        playUpgrade()
        // Restore sprite alphas that were dimmed during construction, then swap tier.
        ws.machineSprite?.setAlpha(0.88)   // matches the initial alpha set in _buildWorkstations
        ws.sprite?.setAlpha(1.0)
        ws.constructionOverlay = null      // overlay already self-destroyed
        this.updateWorkstationVisuals(ws.def.id, newLevel)
      }),

      // ── Construction phase ───────────────────────────────────────────────
      // Spawns the ConstructionOverlay when the React layer deducts the upgrade
      // cost but hasn't yet applied the level increment.  The overlay ticks down
      // and emits 'floor:construction:complete' when done, which causes React to
      // apply the level and re-emit 'floor:upgraded' to complete the visual swap.
      GameEventBus.on('floor:construction:start', ({ floorId, newLevel, duration }) => {
        const ws = this._workstations.find(w => w.def.id === floorId)
        if (!ws?.sprite?.active) return

        // Tear down any pre-existing overlay for this workstation (e.g. rapid
        // re-purchase before previous construction finished — shouldn't normally
        // happen given the cost gate, but guard defensively).
        ws.constructionOverlay?.destroy()
        ws.constructionOverlay = null

        // Dim the existing machine and character sprites to signal "inactive"
        ws.machineSprite?.setAlpha(0.35)
        ws.sprite?.setAlpha(0.35)

        ws.constructionOverlay = new ConstructionOverlay(
          this,
          ws.screenX,
          ws.screenY,
          duration ?? CONSTRUCTION_DURATION_MS,
          floorId,
          newLevel,
          ws.def.accentNum,
        )
      }),

      // npc:mood — emitted by GamePlayerPage whenever an NPC's mood changes.
      // Scales the sprite's animation playback speed by computeMoodMultiplier(mood)
      // so unhappy NPCs visually slouch with slower animations.
      // The mood multiplier maps 0→0.5× speed and 1→1.0× normal speed.
      GameEventBus.on('npc:mood', ({ wsId, mood }) => {
        const ws = this._workstations.find(w => w.def.id === wsId)
        if (!ws?.sprite?.active) return
        const timeScale = computeMoodMultiplier(mood)
        if (ws.sprite.anims) ws.sprite.anims.timeScale = timeScale
      }),
    ]

    // Signal React that this scene is ready to receive sim:* state events.
    // React responds by emitting all current simulation state so the scene
    // can initialise its visuals without reading from the Phaser registry.
    GameEventBus.emit('render:scene-ready', {})
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — update  (Task 9 — Y-sort depth every frame)
  // ═══════════════════════════════════════════════════════════════════════════

  update(time, delta) {
    this._tickParallax(delta)
    this._ySort()
    this._tickBTs()
    // Sync each workstation's held prop with its character sprite socket.
    for (const ws of this._workstations) {
      ws.propSystem?.update()
      // Re-anchor speech bubble to the NPC's world position every frame so
      // it tracks camera pans without any extra state.
      if (ws.speechBubble?.isVisible && ws.sprite?.active) {
        const cam = this.cameras.main
        ws.speechBubble.update(ws.sprite.x, ws.sprite.y,
          { x: cam.worldView.x, y: cam.worldView.y, zoom: cam.zoom })
      }
      // Tick active construction overlays (delta-time driven timer bar).
      ws.constructionOverlay?.update(delta)
    }
  }

  /**
   * _tickBTs
   *
   * Advances each workstation's NPC Behavior Tree by one tick per frame.
   * The tree drives the NPC through its inter-floor transit sequence when
   * ctx.targetFloor differs from ctx.floorNumber, then navigates to the desk
   * and runs the work animation.
   *
   * Depth sorting is handled automatically: when onFloorChange fires it calls
   * sprite.setPosition() which updates sprite.y, and _ySort() (called just
   * before this method) will assign the correct depth on the very next frame.
   *
   * The BT runs entirely inside the Phaser update loop — zero coupling with
   * the EconomyEngine math thread or any backend polling.
   */
  _tickBTs() {
    for (const ws of this._workstations) {
      if (!ws.tree || !ws.btCtx) continue
      const status = ws.tree.tick(ws.btCtx)
      if (status !== Status.RUNNING) ws.tree.reset()
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE — shutdown  (Phase 2 — clean up GameEventBus subscriptions)
  // ═══════════════════════════════════════════════════════════════════════════

  shutdown() {
    // Unsubscribe all GameEventBus listeners to prevent duplicate handlers and
    // memory leaks if the scene is ever restarted.
    this._busUnsubs?.forEach(unsub => unsub())
    this._busUnsubs = []

    // Destroy per-workstation prop attachment systems, speech bubbles, and BTs.
    for (const ws of this._workstations) {
      ws.propSystem?.destroy()
      ws.propSystem = null
      ws.speechBubble?.destroy()
      ws.speechBubble = null
      ws.constructionOverlay?.destroy()
      ws.constructionOverlay = null
      ws.tree?.reset()
      ws.tree  = null
      ws.btCtx = null
    }

    // Stop the floating-text rAF loop and remove the overlay canvas from DOM
    this._floatingTextMgr?.destroy()
    this._floatingTextMgr = null

    // Destroy all Phaser Text objects held by the cash-popup pool.
    // Phaser destroys game objects with the scene automatically, but explicitly
    // destroying the pool's objects here keeps the scene's display list clean.
    if (this._cashPopupPool) {
      for (const txt of this._cashPopupPool.all) txt.destroy()
      this._cashPopupPool = null
    }

    // Despawn all mascots and remove the GameEventBus listener.
    for (const petId of [...this._mascots.keys()]) {
      this._despawnMascot(petId)
    }
    this._unsubPets?.()
    this._unsubPets = null
    this._onActivePetsChanged = null

    // Despawn all manager NPCs and remove the GameEventBus listener.
    for (const floorId of [...this._managerNpcs.keys()]) {
      this._despawnManagerNpc(floorId)
    }
    this._unsubManagers?.()
    this._unsubManagers = null
    this._onManagersChanged = null

    this._unsubSellCompany?.()
    this._unsubSellCompany = null
    this._onSellCompany = null

    this._unsubFloorBins?.()
    this._unsubFloorBins = null
    this._onFloorBinsChanged = null

    this._unsubHqTier?.()
    this._unsubHqTier = null
    this._onHqTierChanged = null

    // Stop the boost prop poll timer; emitters/sprites are auto-destroyed with scene
    if (this._boostPropPollEvent) {
      this._boostPropPollEvent.remove(false)
      this._boostPropPollEvent = null
    }

    // Infrastructure room GameEventBus listener
    this._unsubInfraLevels?.()
    this._unsubInfraLevels = null
    this._onInfraRoomLevelsChanged = null

    // Skill-state GameEventBus listener
    this._unsubSkillState?.()
    this._unsubSkillState = null
    this._onSkillStateChanged = null
    this._skillState = null

    this._infraRoomSprites = {}

    // Parallax background — clear layer refs (sprites are auto-destroyed with scene)
    this._parallaxLayers = []

    // Floor-navigation camera controller — stop any active pan tween
    if (this._floorNavTween?.isPlaying?.()) {
      this._floorNavTween.stop()
    }
    this._floorNavTween      = null
    this._floorNavBtns       = {}
    this._floorLabelTxt      = null
    this._refreshFloorNavBtns = null

    super.shutdown()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2 — Animation state machine driven by floor:progress float
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _updateAnimationState
   *
   * Receives the normalised production progress float (0.0–1.0) for a single
   * workstation and drives its character sprite animation accordingly.
   *
   * Rules:
   *   > 0.0 && < 1.0  → play work animation (character typing / operating)
   *   === 0.0          → after a short random delay, play idle animation
   *   >= 1.0           → cycle complete; spawnResource() is handled by the
   *                       floor:cycle listener; reset to idle
   *
   * @param {{ def:object, sprite:Phaser.GameObjects.Sprite, isWorking:boolean }} ws
   * @param {number} progress  0.0 – 1.0 normalised float
   */
  _updateAnimationState(ws, progress) {
    if (!ws.sprite) return
    if (progress > 0 && progress < 1) {
      this._setWorkstationAnim(ws, true)
    } else {
      this._setWorkstationAnim(ws, false)
    }
  }

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
    this._genBubblePanelTexture()// 9-slice speech bubble panel
    // Resource pipeline textures  (Tasks 1 + 2 + 3)
    this._genMathTokenTexture()  // glowing gold Math Token sprite
    this._genElevatorCarTexture()// metallic elevator car
    this._genConfettiTexture()   // tiny coloured rectangle for confetti
    // Prop attachment fallback
    const propMissing = this._assetsMissing.has('prop_clipboard')
    if (propMissing || !this.textures.exists('prop_clipboard')) this._genPropTexture()
    // Environmental boost prop textures (always procedural — no external assets)
    this._genCoffeeMachineTexture()
    this._genVipInvestorTexture()
    this._genBoostParticleTexture()
    // Infrastructure room textures (always procedural)
    this._genInfraRoomTextures()
    // Parallax cloud band textures (always procedural — Exterior Environments)
    this._genFarCloudTexture()
    this._genNearCloudTexture()
    // NPC portrait fallbacks — coloured rounded-square per workstation hero
    this._genNpcPortraitFallbacks()
  }

  // ── Prop clipboard — procedural fallback for 'prop_clipboard' ───────────
  /**
   * _genPropTexture
   *
   * Draws a 16×20 px clipboard sprite: cream body, grey clip, light ruling
   * lines.  Used as the held prop for workers in the "working" state.
   */
  _genPropTexture() {
    const key = 'prop_clipboard'
    if (this.textures.exists(key)) return

    const W = 16, H = 20
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    // Clipboard body (cream)
    g.fillStyle(0xf5f0e8, 1)
    g.fillRect(0, 3, W, H - 3)

    // Clip at top (grey metal bar)
    g.fillStyle(0x888888, 1)
    g.fillRect(W / 2 - 3, 0, 6, 5)

    // Ruling lines (light grey horizontal stripes)
    g.fillStyle(0xcccccc, 1)
    g.fillRect(2, 8,  12, 1)
    g.fillRect(2, 11, 12, 1)
    g.fillRect(2, 14, 8,  1)

    // Border
    g.lineStyle(1, 0x999988, 1)
    g.strokeRect(0, 3, W, H - 3)

    g.generateTexture(key, W, H)
    g.destroy()
  }

  // ── Coffee machine texture — 20×30 px cyan/teal dispenser prop ──────────
  _genCoffeeMachineTexture() {
    const key = 'coffee_machine'
    if (this.textures.exists(key)) return
    const W = 20, H = 30
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    // Machine body (dark teal)
    g.fillStyle(0x134e4a, 1)
    g.fillRect(2, 4, 16, 22)
    // Front panel highlight (slightly lighter)
    g.fillStyle(0x0d9488, 1)
    g.fillRect(4, 7, 12, 10)
    // Screen (cyan glow)
    g.fillStyle(0x00e5ff, 1)
    g.fillRect(5, 8, 10, 4)
    // Button row (two small buttons)
    g.fillStyle(0x22d3ee, 1)
    g.fillRect(5, 15, 4, 3)
    g.fillStyle(0x67e8f9, 1)
    g.fillRect(11, 15, 4, 3)
    // Cup tray at bottom
    g.fillStyle(0x0f766e, 1)
    g.fillRect(6, 26, 8, 3)
    g.fillRect(8, 23, 4, 4)
    // Side outline
    g.lineStyle(1, 0x0e7490, 1)
    g.strokeRect(2, 4, 16, 22)
    g.generateTexture(key, W, H)
    g.destroy()
  }

  // ── VIP investor texture — 16×28 px gold suit figure ────────────────────
  _genVipInvestorTexture() {
    const key = 'vip_investor'
    if (this.textures.exists(key)) return
    const W = 16, H = 28
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    // Head (gold skin)
    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(8, 5, 4)
    // Body (dark gold suit)
    g.fillStyle(0xb45309, 1)
    g.fillRect(4, 10, 8, 10)
    // Lapels / tie (bright gold)
    g.fillStyle(0xf59e0b, 1)
    g.fillTriangle(8, 10, 5, 10, 7, 18)
    g.fillTriangle(8, 10, 11, 10, 9, 18)
    // Briefcase
    g.fillStyle(0x92400e, 1)
    g.fillRect(10, 18, 5, 4)
    g.fillStyle(0xfbbf24, 1)
    g.fillRect(11, 17, 3, 1)
    // Legs
    g.fillStyle(0x78350f, 1)
    g.fillRect(4, 20, 3, 7)
    g.fillRect(9, 20, 3, 7)
    g.generateTexture(key, W, H)
    g.destroy()
  }

  // ── Boost prop particle texture — tiny 8×8 circle ───────────────────────
  _genBoostParticleTexture() {
    const key = 'boost_particle'
    if (this.textures.exists(key)) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffffff, 1)
    g.fillCircle(4, 4, 4)
    g.generateTexture(key, 8, 8)
    g.destroy()
  }

  // ── Infrastructure room textures — Power Generator, Server/IT, HR/Scheduling ─
  _genInfraRoomTextures() {
    const make = (key, drawFn) => {
      if (this.textures.exists(key)) return
      const g = this.make.graphics({ x: 0, y: 0, add: false })
      drawFn(g)
      g.destroy()
    }

    // Power Generator — amber/yellow; gear + lightning motif; 28×36 px
    make('room_power', g => {
      g.fillStyle(0x78350f, 1); g.fillRect(4, 6, 20, 26)   // dark amber body
      g.fillStyle(0xf59e0b, 1); g.fillRect(6, 8, 16, 14)   // bright amber panel
      g.fillStyle(0xfde68a, 1); g.fillRect(8, 10, 12, 10)  // inner glow rect
      g.fillStyle(0x431407, 1)                              // dark ventilation slots
      for (let i = 0; i < 3; i++) g.fillRect(7, 26 + i * 2, 14, 1)
      g.lineStyle(1, 0xb45309, 1); g.strokeRect(4, 6, 20, 26)
      g.generateTexture('room_power', 28, 36)
    })

    // Server / IT rack — dark green; blinking LED row; 28×36 px
    make('room_server', g => {
      g.fillStyle(0x052e16, 1); g.fillRect(3, 4, 22, 28)   // near-black rack
      g.fillStyle(0x14532d, 1); g.fillRect(5, 6, 18, 24)   // front panel
      for (let i = 0; i < 5; i++) {                        // drive bays
        g.fillStyle(0x166534, 1); g.fillRect(6, 8 + i * 4, 14, 3)
        g.fillStyle(0x22c55e, 1); g.fillRect(18, 9 + i * 4, 2, 1) // LED dot
      }
      g.lineStyle(1, 0x166534, 1); g.strokeRect(3, 4, 22, 28)
      g.generateTexture('room_server', 28, 36)
    })

    // HR / Scheduling desk — blue; calendar grid motif; 28×36 px
    make('room_hr', g => {
      g.fillStyle(0x1e3a8a, 1); g.fillRect(4, 6, 20, 26)   // dark blue body
      g.fillStyle(0x2563eb, 1); g.fillRect(6, 8, 16, 16)   // calendar panel
      g.fillStyle(0x93c5fd, 1)                              // grid lines
      for (let c = 0; c < 3; c++) g.fillRect(7 + c * 4, 9, 1, 14)  // vert
      for (let r = 0; r < 3; r++) g.fillRect(7, 10 + r * 4, 12, 1) // horiz
      g.fillStyle(0x3b82f6, 1); g.fillRect(6, 26, 16, 4)  // bottom drawer
      g.lineStyle(1, 0x1d4ed8, 1); g.strokeRect(4, 6, 20, 26)
      g.generateTexture('room_hr', 28, 36)
    })
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERIOR ENVIRONMENTS — Parallax sky, clouds, building frame
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _genFarCloudTexture
   *
   * Generates a 512×80 px tileable cloud strip representing distant, wispy
   * clouds (soft blue-white, low opacity).  Used by the far-cloud TileSprite
   * layer which scrolls slowly.  Entirely procedural — no external assets.
   */
  _genFarCloudTexture() {
    const key = 'bg_cloud_far'
    if (this.textures.exists(key)) return
    const W = 512, H = 80
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    // Six blobs spread evenly across the strip so it tiles seamlessly.
    // Each blob = three concentric circles: outer halo → mid layer → bright core.
    const blobs = [
      { cx:  56, cy: 44, r: 30 },
      { cx: 148, cy: 36, r: 26 },
      { cx: 245, cy: 50, r: 34 },
      { cx: 345, cy: 38, r: 24 },
      { cx: 432, cy: 46, r: 28 },
      { cx: 500, cy: 36, r: 20 },
    ]
    for (const { cx, cy, r } of blobs) {
      g.fillStyle(0xd0e8f6, 0.26)
      g.fillCircle(cx, cy, r)
      g.fillStyle(0xe8f4fc, 0.50)
      g.fillCircle(cx, cy, r * 0.70)
      g.fillStyle(0xf6fbff, 0.72)
      g.fillCircle(cx, cy, r * 0.40)
    }
    g.generateTexture(key, W, H)
    g.destroy()
  }

  /**
   * _genNearCloudTexture
   *
   * Generates a 384×100 px tileable cloud strip representing nearer,
   * denser clouds (bright white-blue, higher opacity, oval shapes).
   * Used by the near-cloud TileSprite layer which scrolls faster.
   */
  _genNearCloudTexture() {
    const key = 'bg_cloud_near'
    if (this.textures.exists(key)) return
    const W = 384, H = 100
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    const blobs = [
      { cx:  72, cy: 56, rW: 90, rH: 54 },
      { cx: 175, cy: 48, rW: 80, rH: 48 },
      { cx: 282, cy: 60, rW: 100, rH: 62 },
      { cx: 360, cy: 50, rW: 66, rH: 40 },
    ]
    for (const { cx, cy, rW, rH } of blobs) {
      // Three rings build up a soft cloud volume
      g.fillStyle(0xc8e3f5, 0.28)
      g.fillEllipse(cx, cy, rW * 1.5, rH * 1.5)
      g.fillStyle(0xe4f2fc, 0.56)
      g.fillEllipse(cx, cy, rW, rH)
      g.fillStyle(0xfcfeff, 0.82)
      g.fillEllipse(cx, cy, rW * 0.56, rH * 0.56)
    }
    g.generateTexture(key, W, H)
    g.destroy()
  }

  /**
   * _buildParallaxBackground
   *
   * Creates four fixed-to-viewport layers that form the exterior environment
   * visible behind the building cross-section.
   *
   * Layer depths (lower = further back):
   *   -10  Sky gradient    — static, covers full canvas, no scroll
   *   -8   Far clouds      — slow autonomous drift + low parallax factor
   *   -7   Near clouds     — faster drift + higher parallax factor
   *   -3   Exterior frame  — static dark building façade columns + windows
   *
   * All layers use setScrollFactor(0) so they are anchored to the viewport.
   * Parallax is achieved by adjusting TileSprite.tilePositionX/Y each frame
   * in _tickParallax() — fully decoupled from the economy game loop.
   *
   * ADDING REAL SKY ART
   * ─────────────────────────────────────────────────────────────────────────
   *  Replace the procedural gradient with a loaded image:
   *    this.add.image(0, 0, 'sky_gradient').setOrigin(0, 0).setScrollFactor(0).setDepth(-10)
   *  Drop sky_gradient.png into /public/assets/ and add a load.image() in preload().
   */
  _buildParallaxBackground() {
    const { width, height } = this.scale

    // ── Layer 0: Sky gradient (deepest background) ────────────────────────────
    // Top: deep azure, bottom: lighter sky blue — creates day-sky atmosphere.
    const skyGfx = this.add.graphics()
    skyGfx.setScrollFactor(0).setDepth(-10)
    skyGfx.fillGradientStyle(0x1a4a80, 0x1a4a80, 0x5ba8d9, 0x5ba8d9, 1)
    skyGfx.fillRect(0, 0, width, height)
    this._skyGfx = skyGfx

    // ── Layer 1: Far clouds (slow, distant) ───────────────────────────────────
    // Positioned near the top of the canvas (approximately the upper 10%).
    const farClouds = this.add.tileSprite(0, height * 0.08, width, 80, 'bg_cloud_far')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-8)
    this._parallaxLayers.push({
      tileSprite:    farClouds,
      autoSpeed:     9,      // px/s continuous horizontal drift
      parallaxFactor: 0.06,  // fraction of camera movement applied as tile shift
    })

    // ── Layer 2: Near clouds (faster, closer) ─────────────────────────────────
    // Slightly lower and more opaque, reinforcing the sense of depth.
    const nearClouds = this.add.tileSprite(0, height * 0.20, width, 100, 'bg_cloud_near')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-7)
    this._parallaxLayers.push({
      tileSprite:    nearClouds,
      autoSpeed:     20,     // px/s — faster than far layer
      parallaxFactor: 0.13,
    })

    // ── Layer 3: Exterior building frame (static) ─────────────────────────────
    // Two dark façade columns with warm-lit windows frame the building cross-section
    // on the left and right edges of the canvas, grounding it as a real exterior.
    const PILLAR_W  = 30
    const WIN_W     = 16
    const WIN_H     = 22
    const WIN_ROWS  = 8
    const WIN_GAP_Y = 52

    const frameGfx = this.add.graphics()
    frameGfx.setScrollFactor(0).setDepth(-3)
    this._frameGfx = frameGfx
    this._drawExteriorFrame(frameGfx, HQ_PRESTIGE_TIERS[0])
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HQ PRESTIGE VISUAL TIERS
  //
  //  _drawExteriorFrame  — renders the two side pillars + window lights into a
  //                        Graphics instance using palette colours from a single
  //                        HQ_PRESTIGE_TIERS entry.  Always clears first so
  //                        repeated calls are safe.
  //
  //  _applyHqTier        — idempotent entry point called by the sim:hq-tier
  //                        GameEventBus subscriber.  Redraws both the sky
  //                        gradient and the exterior frame in the new palette,
  //                        then plays a brief full-screen white-flash overlay to
  //                        signal the visual transition to the player.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _drawExteriorFrame
   *
   * Redraws the exterior building frame (two side pillars and their window lights)
   * into `gfx` using the colours from `tierDef`.  Clears the Graphics first so
   * this is safe to call multiple times.
   *
   * @param {Phaser.GameObjects.Graphics} gfx
   * @param {object} tierDef  — one entry from HQ_PRESTIGE_TIERS
   */
  _drawExteriorFrame(gfx, tierDef) {
    const { width, height } = this.scale
    const PILLAR_W  = 30
    const WIN_W     = 16
    const WIN_H     = 22
    const WIN_ROWS  = 8
    const WIN_GAP_Y = 52

    gfx.clear()

    // Left pillar
    gfx.fillStyle(tierDef.pillarFill, 1)
    gfx.fillRect(0, 0, PILLAR_W, height)
    // Right pillar
    gfx.fillRect(width - PILLAR_W, 0, PILLAR_W, height)

    // Mortar lines on pillars (thin horizontal grooves)
    gfx.fillStyle(tierDef.pillarLine, 0.60)
    for (let r = 0; r < 18; r++) {
      const y = 22 + r * 28
      gfx.fillRect(0,               y, PILLAR_W, 1)
      gfx.fillRect(width - PILLAR_W, y, PILLAR_W, 1)
    }

    // Window lights
    for (let row = 0; row < WIN_ROWS; row++) {
      const wy = 34 + row * WIN_GAP_Y
      const wx = (PILLAR_W - WIN_W) / 2

      // Left window
      gfx.fillStyle(tierDef.windowFill, 0.70)
      gfx.fillRect(wx, wy, WIN_W, WIN_H)
      gfx.fillStyle(tierDef.windowGlow, 0.50)
      gfx.fillRect(wx + 3, wy + 3, WIN_W - 6, WIN_H / 3)

      // Right window (mirrored)
      gfx.fillStyle(tierDef.windowFill, 0.70)
      gfx.fillRect(width - PILLAR_W + wx, wy, WIN_W, WIN_H)
      gfx.fillStyle(tierDef.windowGlow, 0.50)
      gfx.fillRect(width - PILLAR_W + wx + 3, wy + 3, WIN_W - 6, WIN_H / 3)
    }

    // Top cornice bar
    gfx.fillStyle(tierDef.cornice, 1)
    gfx.fillRect(0, 0, width, 8)
  }

  /**
   * _applyHqTier
   *
   * Idempotent — skips the redraw if the tier has not changed since the last
   * call.  When the tier does change:
   *   1. Redraws the sky gradient and exterior frame with the new palette.
   *   2. Plays a brief full-screen white-flash tween to signal the transition.
   *
   * @param {number} tierIdx  — 0–3 index into HQ_PRESTIGE_TIERS
   */
  _applyHqTier(tierIdx) {
    const idx = Math.max(0, Math.min(HQ_PRESTIGE_TIERS.length - 1, tierIdx ?? 0))
    if (idx === this._hqTier && this._hqTierApplied) return
    this._hqTier        = idx
    this._hqTierApplied = true

    const tierDef = HQ_PRESTIGE_TIERS[idx]
    const { width, height } = this.scale

    // Redraw sky gradient
    if (this._skyGfx?.active) {
      this._skyGfx.clear()
      this._skyGfx.fillGradientStyle(
        tierDef.skyTop,    tierDef.skyTop,
        tierDef.skyBottom, tierDef.skyBottom,
        1,
      )
      this._skyGfx.fillRect(0, 0, width, height)
    }

    // Redraw exterior frame
    if (this._frameGfx?.active) {
      this._drawExteriorFrame(this._frameGfx, tierDef)
    }

    // White flash overlay — create a short-lived opaque rect that fades out.
    // Runs at the top of the depth stack so it briefly washes over the entire canvas.
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.65)
    flash.setScrollFactor(0).setDepth(600)
    this.tweens.add({
      targets:  flash,
      alpha:    0,
      duration: 500,
      ease:     'Sine.easeOut',
      onComplete: () => flash.destroy(),
    })
  }

  /**
   * _tickParallax  (Exterior Environments — delta-time parallax loop)
   *
   * Called every frame from update() with the Phaser-supplied delta in ms.
   * Advances each cloud TileSprite's tilePositionX by the layer's autonomous
   * speed, then applies a fractional parallax offset derived from camera movement
   * since the last frame.  The result is continuous cloud drift + a convincing
   * 2.5D depth illusion when the player pans the camera.
   *
   * DECOUPLING NOTE
   * ─────────────────────────────────────────────────────────────────────────
   *  This method reads only `this.cameras.main.scrollX/Y` and `delta`.
   *  It does not read or write any economy state, and its execution path
   *  is entirely independent of the incremental game loop (no shared locks,
   *  no shared state, no event emissions).  Dropping or pausing this method
   *  has zero effect on the economy simulation.
   *
   * @param {number} delta - ms elapsed since the previous frame
   */
  _tickParallax(delta) {
    if (!this._parallaxLayers.length) return
    const cam  = this.cameras.main
    const camX = cam.scrollX
    const camY = cam.scrollY
    const dCamX = camX - this._parallaxCamX
    const dCamY = camY - this._parallaxCamY
    this._parallaxCamX = camX
    this._parallaxCamY = camY

    const dt = delta / 1000  // convert ms → seconds

    for (const layer of this._parallaxLayers) {
      // Continuous autonomous horizontal drift (time-based, camera-independent)
      layer.tileSprite.tilePositionX += layer.autoSpeed * dt

      // Parallax offset: fraction of camera delta applied to tile position.
      // Horizontal pan: far objects appear to move in the same direction as the
      //                 camera scroll, but at a reduced rate (depth illusion).
      layer.tileSprite.tilePositionX += dCamX * layer.parallaxFactor

      // Vertical pan: slight Y tile shift reinforces depth for downward panning.
      layer.tileSprite.tilePositionY += dCamY * layer.parallaxFactor * 0.45
    }
  }

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

  /**
   * Build per-floor pixel coordinates from normalised SimulationCoordSpace
   * origins, resolved against the current canvas dimensions.
   *
   * Result stored in `this._floorCoords` — an object keyed by floor number
   * (1–7) where each value is `{ x, y }` in canvas pixels.  Replaces the
   * former module-level FLOOR_COORDINATES constant.
   */
  _buildFloorCoords() {
    const { width, height } = this.scale
    this._floorCoords = buildFloorCoords(width, height)
  }

  /**
   * Build per-infrastructure-room pixel coordinates from the normalised
   * SimulationCoordSpace origin, resolved against the current canvas size.
   *
   * Result stored in `this._infraCoords` — an object keyed by room id
   * ('power', 'server', 'hr') where each value is `{ x, y }`.  Replaces
   * the former module-level INFRA_COORDINATES constant.
   */
  _buildInfraCoords() {
    const { width, height } = this.scale
    const { origX, origY } = buildInfraOrig(width, height)
    this._infraCoords = {
      power:  { x: origX + (0 - 0) * (TILE_W / 2), y: origY + (0 + 0) * (TILE_H / 2) },  // col 0
      server: { x: origX + (2 - 0) * (TILE_W / 2), y: origY + (2 + 0) * (TILE_H / 2) },  // col 2
      hr:     { x: origX + (4 - 0) * (TILE_W / 2), y: origY + (4 + 0) * (TILE_H / 2) },  // col 4
    }
  }

  _buildIsoGrid() {
    const { width, height } = this.scale
    // Derive the isometric origin from the normalised coord space so that
    // no raw canvas dimensions are hardcoded in the simulation layout.
    const origin = simToCanvas(0.5, 0.26, width, height)
    this._isoOriginX = origin.x
    this._isoOriginY = origin.y

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
      // ── Phase 5 Task 3: use FLOOR_COORDINATES for per-floor Y origin ─────
      // Falls back to _isoOriginY if the floor number is not registered.
      const floorOrig = this._floorCoords[def.floorNumber] ?? { x: this._isoOriginX, y: this._isoOriginY }
      const x = floorOrig.x + (def.col - def.row) * (TILE_W / 2)
      const y = floorOrig.y + (def.col + def.row) * (TILE_H / 2)

      // Room tile: draw the themed floor diamond for this workstation's grid cell
      const roomGfx = RoomThemeManager.instantiate(this, def.roomTheme, x, y)

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
          fontFamily: FONT_BUBBLE, fontSize: '10px',
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

      // Document stack — a procedural Graphics overlay that renders 0–5 paper
      // sheets beside the desk to represent queued outputBin units.  Hidden by
      // default; shown/updated by _updateDocumentStacks() via sim:floor-bins.
      const docStackX = x + 14   // right of desk centre (isometric right side)
      const docStackY = y - TILE_H + 2  // at desk-surface height
      const docStack = this.add.graphics()
        .setPosition(docStackX, docStackY)
        .setDepth(DEPTH_SORT_BASE)
        .setVisible(false)
      this._depthSortGroup.push({ sprite: docStack, yOffset: WS_DEPTH_OFFSET - 2 })

      // Runtime state
      const runtime = {
        def, level: 1, isWorking: false,
        sprite, machineSprite,
        /** @type {Phaser.GameObjects.Graphics|null} Themed room diamond for this floor. */
        roomGfx,
        screenX: x, screenY: spriteY,
        currentTier: 'Garage',   // Track tier to avoid redundant texture swaps
        /** @type {PropAttachmentSystem|null} Manages the modular held-prop for this worker. */
        propSystem: null,
        /** @type {NpcSpeechBubble|null} Per-NPC world-anchored speech bubble renderer. */
        speechBubble: new NpcSpeechBubble(this, { cornerSize: 14, tailH: 14 }),
        /** @type {ConstructionOverlay|null} Active construction overlay (null when not building). */
        constructionOverlay: null,
        /** @type {Phaser.GameObjects.Graphics|null} Document-stack overlay (outputBin visualisation). */
        docStack,
      }

      // Prop attachment — only hero (non-server) sprites carry visible props
      if (!isServer) {
        const propSystem = new PropAttachmentSystem(this, 'prop_clipboard')
        propSystem.attach(sprite)
        runtime.propSystem = propSystem
      }

      this._workstations.push(runtime)

      // Behavior Tree — drives per-NPC vertical traversal and work cycle.
      // btCtx starts the NPC at its home desk (same floor) so the transit gate
      // passes immediately and the tree advances straight to PerformWorkAnimation.
      // Set ctx.targetFloor to a different floor number before the next reset()
      // to trigger the full cross-floor routing sequence.
      const btCtx = {
        startX:       def.col,
        startY:       def.row,
        deskX:        def.col,
        deskY:        def.row,
        floorNumber:  def.floorNumber,
        targetFloor:  def.floorNumber,
        progress:     0,
        obstacles:    [],
        infraLevel:          this._infraLevel,     // synced each status poll
        totalWorkspaceLevel: ECONOMY_FLOORS.length, // initial total (all at level 1)
        // Reposition the sprite when the NPC completes an inter-floor transit.
        // _ySort() runs every frame and will immediately reassign depth based
        // on the new sprite.y — no extra bookkeeping required.
        onFloorChange: (newFloor) => {
          const orig = this._floorCoords[newFloor] ?? this._floorCoords[1]
          const sx = orig.x + (def.col - def.row) * (TILE_W / 2)
          const sy = orig.y + (def.col + def.row) * (TILE_H / 2) - TILE_H / 2 - 4
          if (runtime.sprite?.active) runtime.sprite.setPosition(sx, sy)
        },
      }
      runtime.tree  = createWorkerTree()
      runtime.btCtx = btCtx

      // Publish this workstation's position as normalised [0,1] coords via the
      // GameEventBus so React can anchor upgrade popups without raw pixel math.
      GameEventBus.emit('render:workstation-pos', {
        id:    def.id,
        normX: x    / this.scale.width,
        normY: spriteY / this.scale.height,
      })

      // ── Task 6: pointer events — click opens upgrade popup ────────────
      sprite
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => sprite.setAlpha(0.78))
        .on('pointerout',  () => sprite.setAlpha(1.0))
        .on('pointerdown', () => this._buildPopup(runtime))
      // Tactile spring press — subtle squash-and-stretch on NPC click.
      this._attachSpringPress(sprite, [sprite], { compressScale: 0.88, springDuration: 240 })
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

    const lSty = { fontFamily: FONT_BUBBLE, fontSize: `${Math.round(height * 0.021)}px`, color: CLR_DIM,  align: 'center' }
    const vSty = { fontFamily: FONT_BUBBLE, fontSize: `${Math.round(height * 0.036)}px`, color: CLR_TEXT, align: 'center', fontStyle: 'bold' }

    this.add.text(col1, lY, 'TOTAL COINS', lSty).setOrigin(0.5).setDepth(D)
    this.add.circle(col1 - 56, vY, 7, 0xfbbf24).setDepth(D)
    this._txtCoins = this.add.text(col1, vY, '0', { ...vSty, color: CLR_COIN }).setOrigin(0.5).setDepth(D)

    this.add.text(col2, lY, 'PRODUCTION /s', lSty).setOrigin(0.5).setDepth(D)
    this._txtProdRate = this.add.text(col2, vY, '0', vSty).setOrigin(0.5).setDepth(D)

    this.add.text(col3, lY, 'STATUS', lSty).setOrigin(0.5).setDepth(D)
    this._txtStatus = this.add.text(col3, vY, 'IDLE', { ...vSty, color: CLR_DIM }).setOrigin(0.5).setDepth(D)
    this._txtBoost  = this.add
      .text(col3, bY, 'BOOST ACTIVE', {
        fontFamily: FONT_BUBBLE, fontSize: `${Math.round(height * 0.021)}px`,
        color: CLR_BOOST_ON, fontStyle: 'bold', align: 'center',
      })
      .setOrigin(0.5).setDepth(D).setVisible(false)

    this.tweens.add({ targets: this._txtBoost, alpha: { from: 0.55, to: 1 }, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    this._txtNet = this.add
      .text(width / 2, height - 5, 'Connecting...', {
        fontFamily: FONT_HUD, fontSize: `${Math.round(height * 0.018)}px`,
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

  // ── Upward-floating currency emitter — fires on floor:cycle completion ─────

  _buildCurrencyEmitter() {
    this._currencyEmitter = this.add.particles(0, 0, 'math_token', {
      speedY:   { min: -160, max: -80 },
      speedX:   { min: -30,  max:  30 },
      scale:    { start: 0.9, end: 0 },
      alpha:    { start: 1,   end: 0 },
      lifespan: 900,
      gravityY: 60,
      quantity: 0,
      emitting: false,
    }).setDepth(320)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5, TASK 2 — Click-and-drag camera pan + world bounds
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _setupCameraDrag  (Phase 5, Task 2 — extended with zoom)
   *
   * Implements a click-and-drag camera pan so the player can scroll vertically
   * (and horizontally for larger floors) through the building, plus pinch-to-zoom
   * on touch devices and mouse-wheel zoom on desktop.
   *
   * HOW IT WORKS
   * ─────────────────────────────────────────────────────────────────────────
   *  Pan (drag):
   *  • On pointerdown: record the drag origin and the camera's scroll position
   *    at that moment.
   *  • On pointermove (while pointer is held): compute delta from drag origin,
   *    divide by the current zoom so one screen-pixel always moves exactly one
   *    world-pixel regardless of zoom level, then apply as camera scroll.
   *  • On pointerup: clear the drag state.
   *  • A DRAG_THRESHOLD of 6 px prevents accidental drags when the player just
   *    clicks a workstation to open the upgrade popup.
   *  • If the upgrade popup is open, panning is suspended.
   *
   *  Pinch-to-zoom (touch):
   *  • When a second finger lands, the drag is suspended and pinchStart records
   *    the initial inter-finger distance and camera zoom.
   *  • As either finger moves, the new distance / initial distance gives a scale
   *    factor that is applied to the stored start zoom and clamped to [ZOOM_MIN, ZOOM_MAX].
   *  • When one finger lifts, pinch mode ends and single-finger drag resumes from
   *    the remaining pointer's current position (preventing a view jump).
   *
   *  Mouse-wheel zoom (desktop):
   *  • Each wheel notch multiplies the camera zoom by ZOOM_WHEEL_FACTOR (1.1).
   *    Scrolling up = zoom in; scrolling down = zoom out.
   *    The result is clamped to [ZOOM_MIN, ZOOM_MAX].
   *
   * WORLD BOUNDS
   * ─────────────────────────────────────────────────────────────────────────
   *  setBounds() constrains how far the camera can scroll so the player
   *  never sees off-canvas blank space.  WORLD_HEIGHT is set to the canvas
   *  height by default (building-bg fills the viewport).  Increase it —
   *  e.g. `height * 2` — and scale building-bg accordingly when using a
   *  taller asset that requires vertical scrolling.
   */
  _setupCameraDrag() {
    const { width, height } = this.scale
    // Expand WORLD_HEIGHT so the camera can pan downward to centre floor 1
    // (increase scrollY until the ground-floor world Y sits at the viewport midpoint).
    // this._floorCoords[1].y is the ground-floor world Y; adding height/2 ensures
    // the camera can place that coordinate at the middle of the viewport.
    const FLOOR1_Y     = this._floorCoords[1]?.y ?? height * 0.71
    const WORLD_HEIGHT = Math.ceil(FLOOR1_Y + height / 2)
    const DRAG_THRESHOLD = 6   // px of movement required before treating as a drag

    // Zoom limits — 0.5 lets the player zoom out to see the full building; 2.5
    // allows close inspection of individual NPC sprites.
    const ZOOM_MIN          = 0.5
    const ZOOM_MAX          = 2.5
    const ZOOM_WHEEL_FACTOR = 1.1   // multiply zoom by this per wheel notch

    this.cameras.main.setBounds(0, 0, width, WORLD_HEIGHT)

    // ── Block native browser scroll / rubber-band on the Phaser canvas ────────
    // This prevents the page from scrolling when the player swipes inside the
    // game canvas on mobile or uses the mouse wheel on desktop.
    const canvas = this.game.canvas
    canvas.style.touchAction = 'none'

    // Mouse-wheel zoom: each notch multiplies the zoom by ZOOM_WHEEL_FACTOR.
    // Scrolling UP (deltaY < 0) zooms in; scrolling DOWN (deltaY > 0) zooms out.
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      if (this._popup) return
      const cam    = this.cameras.main
      const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : (1 / ZOOM_WHEEL_FACTOR)
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX))
    }, { passive: false })

    // ── Pointer tracking for drag-pan and pinch-to-zoom ─────────────────────
    // `activePointers` maps Phaser pointer id → last known screen position.
    // With one active pointer → drag-pan.
    // With two active pointers → pinch-to-zoom (drag is suspended).
    const activePointers = new Map()
    let dragStart  = null  // { ptrX, ptrY, scrollX, scrollY } at drag start
    let pinchStart = null  // { dist, zoom } at pinch start

    // Helper: begin (or restart) a single-pointer drag from position (x, y).
    const startDrag = (x, y) => {
      const cam = this.cameras.main
      dragStart = { ptrX: x, ptrY: y, scrollX: cam.scrollX, scrollY: cam.scrollY }
    }

    this.input.on('pointerdown', (ptr) => {
      if (this._popup) return
      activePointers.set(ptr.id, { x: ptr.x, y: ptr.y })

      if (activePointers.size >= 2) {
        // Second finger — switch to pinch-to-zoom mode.
        const pts = [...activePointers.values()]
        const dx  = pts[1].x - pts[0].x
        const dy  = pts[1].y - pts[0].y
        pinchStart = { dist: Math.sqrt(dx * dx + dy * dy), zoom: this.cameras.main.zoom }
        dragStart  = null
      } else {
        startDrag(ptr.x, ptr.y)
      }
    })

    this.input.on('pointermove', (ptr) => {
      if (this._popup) return
      if (ptr.isDown) activePointers.set(ptr.id, { x: ptr.x, y: ptr.y })

      // ── Pinch-to-zoom ────────────────────────────────────────────────────
      if (pinchStart && activePointers.size >= 2) {
        const pts  = [...activePointers.values()]
        const dx   = pts[1].x - pts[0].x
        const dy   = pts[1].y - pts[0].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (pinchStart.dist > 0) {
          const newZoom = Phaser.Math.Clamp(
            pinchStart.zoom * (dist / pinchStart.dist),
            ZOOM_MIN, ZOOM_MAX,
          )
          this.cameras.main.setZoom(newZoom)
        }
        return
      }

      // ── Drag-pan ─────────────────────────────────────────────────────────
      if (!dragStart || !ptr.isDown) return
      const dx = ptr.x - dragStart.ptrX
      const dy = ptr.y - dragStart.ptrY
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
      // Divide pixel delta by zoom so each screen pixel corresponds to exactly
      // one world pixel — the pan speed is consistent at any zoom level.
      const zoom = this.cameras.main.zoom
      this.cameras.main.setScroll(
        dragStart.scrollX - dx / zoom,
        dragStart.scrollY - dy / zoom,
      )
    })

    this.input.on('pointerup', (ptr) => {
      activePointers.delete(ptr.id)
      if (activePointers.size < 2) {
        pinchStart = null
        // Resume single-finger drag from the remaining pointer's current position
        // so the view does not jump when transitioning from pinch back to pan.
        if (activePointers.size === 1) {
          const remaining = [...activePointers.values()][0]
          startDrag(remaining.x, remaining.y)
        } else {
          dragStart = null
        }
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED SPRING-PRESS HELPER — tactile button juice
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _attachSpringPress
   *
   * Adds a two-phase spring-press animation to any interactive Phaser object:
   *
   *   PRESS  (pointerdown): compress all `visualTargets` to `compressScale`
   *          using easeInQuad (fast push).
   *   RELEASE (pointerup / pointerout): spring all targets back to scale 1.0
   *          using easeOutBack, which briefly overshoots ~10 % before settling —
   *          simulating the elastic snap of a physical button.
   *
   * When `opts.isDisabled()` returns true the compress phase is skipped so
   * disabled buttons never animate.  The spring-back always fires on release
   * to handle the case where a button becomes disabled mid-press.
   *
   * The method is side-effect-free: it only attaches Phaser pointer listeners
   * to `interactiveObj` and never touches game state.
   *
   * @param {Phaser.GameObjects.GameObject}   interactiveObj – The object that
   *   receives pointer events (must have .setInteractive() already called).
   * @param {Phaser.GameObjects.GameObject[]} visualTargets  – Objects to scale
   *   (may include `interactiveObj` itself and any associated labels/shadows).
   * @param {object}  [opts={}]
   * @param {number}  [opts.compressScale=0.82]    – Target scale on press.
   * @param {number}  [opts.compressDuration=80]   – Press animation duration (ms).
   * @param {number}  [opts.springDuration=280]    – Spring-back duration (ms).
   * @param {()=>boolean} [opts.isDisabled=()=>false] – Predicate; when true the
   *   press phase is skipped (disabled buttons stay at natural scale).
   */
  _attachSpringPress(interactiveObj, visualTargets, opts = {}) {
    const {
      compressScale    = 0.82,
      compressDuration = 80,
      springDuration   = 280,
      isDisabled       = () => false,
    } = opts

    let pressTween = null

    const springBack = () => {
      if (pressTween?.isPlaying?.()) pressTween.stop()
      pressTween = null
      this.tweens.add({
        targets:  visualTargets,
        scaleX:   1,
        scaleY:   1,
        duration: springDuration,
        ease:     (t) => easeOutBack(t),
      })
    }

    interactiveObj
      .on('pointerdown', () => {
        if (isDisabled()) return
        if (pressTween?.isPlaying?.()) pressTween.stop()
        pressTween = this.tweens.add({
          targets:  visualTargets,
          scaleX:   compressScale,
          scaleY:   compressScale,
          duration: compressDuration,
          ease:     (t) => easeInQuad(t),
        })
      })
      .on('pointerup',  springBack)
      .on('pointerout', springBack)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOOR-NAVIGATION CAMERA CONTROLLER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _buildFloorNavButtons
   *
   * Creates two circular ▲ / ▼ buttons anchored to the right screen margin,
   * plus a "FLOOR N / 7" label between them.  All objects use scrollFactor(0)
   * so they remain screen-fixed as the camera pans.  Depth is 205 (above HUD
   * at 200 but below popup at 300+).
   *
   * LAYOUT (right margin, vertically centred in the non-HUD area):
   *
   *   [▲]         ← up button   (go to higher floor number / up in building)
   *   FLOOR 1     ← label
   *   [▼]         ← down button (go to lower floor number / down in building)
   *
   * The buttons are disabled (dimmed + non-interactive) when the active floor
   * is already at the top/bottom limit.
   *
   * CONSTRAINT NOTE
   * ─────────────────────────────────────────────────────────────────────────
   *  This method reads only FLOOR_COORDINATES (spatial data).  It never
   *  touches EconomyEngine, GameEventBus, or any economy state.
   */
  _buildFloorNavButtons() {
    const { width, height } = this.scale
    const HUD_H   = Math.round(height * 0.20)   // must match _buildHUD()
    const playH   = height - HUD_H              // usable play area height
    const BX      = width  - 24                 // button centre X (right margin)
    const midY    = playH  / 2                  // vertical centre of play area
    const BTN_GAP = 32                          // px between button centre and label

    const NAV_DEPTH = 205  // above HUD (200), below popup
    const BTN_R     = 14   // button circle radius

    const CLR_BTN_BG   = 0x1e3a5f  // button fill  — same as panel accent
    const CLR_BTN_GLOW = 0x3b82f6  // border/glow  — sky blue
    const CLR_BTN_DIM  = 0x263c52  // dimmed fill  when disabled
    const CLR_ARROW    = '#e2e8f0'  // arrow text colour
    const CLR_ARROW_DIM= '#3a5068'  // arrow text colour when disabled

    const FLOOR_COUNT = Object.keys(this._floorCoords).length  // 7

    // ── Helper: build one circle button with an arrow label ───────────────
    const makeBtn = (label, cy) => {
      const bg = this.add.circle(BX, cy, BTN_R, CLR_BTN_BG)
        .setScrollFactor(0).setDepth(NAV_DEPTH)
        .setStrokeStyle(2, CLR_BTN_GLOW, 1)

      const txt = this.add.text(BX, cy, label, {
        fontFamily: FONT_BUBBLE,
        fontSize:   '16px',
        color:      CLR_ARROW,
        align:      'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(NAV_DEPTH + 1)

      // Make the circle interactive (larger hit area)
      bg.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Circle(0, 0, BTN_R + 6), hitAreaCallback: Phaser.Geom.Circle.Contains })
      bg.on('pointerover',  () => { if (!bg.getData('disabled')) bg.setFillStyle(CLR_BTN_GLOW) })
      bg.on('pointerout',   () => { if (!bg.getData('disabled')) bg.setFillStyle(CLR_BTN_BG)   })

      // Tactile spring press — skips compress when the button is disabled.
      this._attachSpringPress(bg, [bg, txt], {
        compressScale: 0.82,
        isDisabled:    () => !!bg.getData('disabled'),
      })

      return { bg, txt }
    }

    const upBtn   = makeBtn('▲', midY - BTN_GAP)
    const downBtn = makeBtn('▼', midY + BTN_GAP)

    // ── Floor label ───────────────────────────────────────────────────────
    this._floorLabelTxt = this.add.text(BX, midY, `FLOOR\n${this._activeCamFloor}`, {
      fontFamily: FONT_HUD,
      fontSize:   `${Math.round(height * 0.020)}px`,
      color:      CLR_TEXT,
      align:      'center',
      lineSpacing: -2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(NAV_DEPTH)

    // ── Store refs for enable/disable updates ─────────────────────────────
    this._floorNavBtns = { up: upBtn, down: downBtn }

    // ── Wire up click handlers ─────────────────────────────────────────────
    upBtn.bg.on('pointerdown', () => {
      if (!upBtn.bg.getData('disabled')) { playClick(); this._panToFloor(this._activeCamFloor + 1) }
    })
    downBtn.bg.on('pointerdown', () => {
      if (!downBtn.bg.getData('disabled')) { playClick(); this._panToFloor(this._activeCamFloor - 1) }
    })

    // ── Helper closure: sync enabled/dimmed visual state ──────────────────
    const refreshBtnStates = () => {
      const atTop    = this._activeCamFloor >= FLOOR_COUNT
      const atBottom = this._activeCamFloor <= 1

      upBtn.bg.setData('disabled', atTop)
      upBtn.bg.setFillStyle(atTop    ? CLR_BTN_DIM : CLR_BTN_BG)
      upBtn.bg.setStrokeStyle(2, atTop ? CLR_BTN_DIM : CLR_BTN_GLOW, 1)
      upBtn.txt.setColor(atTop    ? CLR_ARROW_DIM : CLR_ARROW)

      downBtn.bg.setData('disabled', atBottom)
      downBtn.bg.setFillStyle(atBottom ? CLR_BTN_DIM : CLR_BTN_BG)
      downBtn.bg.setStrokeStyle(2, atBottom ? CLR_BTN_DIM : CLR_BTN_GLOW, 1)
      downBtn.txt.setColor(atBottom ? CLR_ARROW_DIM : CLR_ARROW)
    }

    // Store as instance method so _panToFloor can call it without closure capture.
    this._refreshFloorNavBtns = refreshBtnStates

    // Apply initial state (ground floor: down is disabled)
    refreshBtnStates()

    // Pan camera to ground floor on scene start so the initial view is correct.
    this._panToFloor(this._activeCamFloor)
  }

  /**
   * _panToFloor  (Floor-navigation camera controller)
   *
   * Smoothly tweens the main camera's scrollY so the target floor is centred
   * in the viewport, then updates the floor label and button enabled states.
   *
   * ALGORITHM
   * ─────────────────────────────────────────────────────────────────────────
   *  targetScrollY = this._floorCoords[floor].y − (canvasHeight / 2)
   *
   *  The result is clamped to the camera's world bounds (set in
   *  _setupCameraDrag) so the camera never shows world space outside [0, WORLD_HEIGHT].
   *
   *  The camera pan is a one-shot Phaser tween (Cubic.Out easing, 380 ms).
   *  Any in-progress tween is stopped before the new one starts.
   *
   * CONSTRAINT NOTE
   * ─────────────────────────────────────────────────────────────────────────
   *  This method reads FLOOR_COORDINATES (spatial data) and writes ONLY to
   *  Phaser camera state and UI game objects.  It has zero access to or
   *  effect on EconomyEngine or any economy state.
   *
   * @param {number} floor - Building floor number (1 = ground, 7 = penthouse)
   */
  _panToFloor(floor) {
    const floorCount = Object.keys(this._floorCoords).length
    const clampedFloor = Phaser.Math.Clamp(Math.round(floor), 1, floorCount)

    this._activeCamFloor = clampedFloor

    // Update floor label
    if (this._floorLabelTxt?.active) {
      this._floorLabelTxt.setText(`FLOOR\n${clampedFloor}`)
    }

    // Refresh button enabled/dimmed states
    this._refreshFloorNavBtns?.()

    // Compute target scroll position: place floor Y at the vertical centre of the viewport.
    // Divide the half-height by the current zoom so that the floor coordinate maps to the
    // visual centre of the camera regardless of zoom level.
    const { height } = this.scale
    const floorY     = this._floorCoords[clampedFloor]?.y ?? height / 2
    const zoom       = this.cameras.main.zoom
    const rawScrollY = floorY - (height / 2) / zoom

    // Clamp to camera bounds — account for zoom when computing the max scroll limit.
    const bounds        = this.cameras.main.getBounds()
    const scrollYLimit  = Math.max(0, bounds.height - height / zoom)
    const targetScrollY = Phaser.Math.Clamp(rawScrollY, 0, scrollYLimit)

    // Kill any in-progress pan tween before starting a new one
    if (this._floorNavTween?.isPlaying?.()) {
      this._floorNavTween.stop()
    }

    // Tween scrollY with Cubic.Out — smooth glide rather than instant snap
    this._floorNavTween = this.tweens.add({
      targets:  this.cameras.main,
      scrollY:  targetScrollY,
      duration: 380,
      ease:     'Cubic.Out',
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5, TASK 3 — spawnWorkstation (public API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * spawnWorkstation  (Phase 5, Task 3)
   *
   * Places — or re-positions — a named workstation on a specific building floor.
   *
   * Uses `this._floorCoords[floorNumber]` to map the floor number to canvas
   * pixel coordinates, then applies the same 2:1 isometric column offset used
   * by the tile grid so the workstation appears correctly within that floor's
   * room space.
   *
   * Example usage
   * ─────────────────────────────────────────────────────────────────────────
   *   // Spawn each workstation on its dedicated floor
   *   this.spawnWorkstation('production', 1)
   *   this.spawnWorkstation('logistics',  2)
   *   this.spawnWorkstation('sales',      3)
   *
   *   // Move Production up one floor (e.g. after an expansion unlock)
   *   this.spawnWorkstation('production', 2)
   *
   * @param {string} pillarName  – workstation id: 'production'|'logistics'|'sales'
   * @param {number} floorNumber – target floor (1 = ground … 7 = penthouse)
   */
  spawnWorkstation(pillarName, floorNumber) {
    const floor = this._floorCoords[floorNumber]
    if (!floor) {
      console.warn(`[IsoTycoonScene] spawnWorkstation: floor ${floorNumber} not defined in this._floorCoords`)
      return
    }

    const def = WORKSTATION_DEFS.find(d => d.id === pillarName)
    if (!def) {
      console.warn(`[IsoTycoonScene] spawnWorkstation: pillar "${pillarName}" not found in WORKSTATION_DEFS`)
      return
    }

    // Compute isometric canvas position for this pillar column on the target floor
    const newX     = floor.x + (def.col - def.row) * (TILE_W / 2)
    const newY     = floor.y + (def.col + def.row) * (TILE_H / 2)
    const isServer = def.spriteKey === 'server_iso'
    const machineY = newY - TILE_H / 2
    const spriteY  = machineY - (isServer ? 10 : 4)

    const runtime = this._workstations.find(w => w.def.id === pillarName)
    if (!runtime) {
      // Workstations not yet created by _buildWorkstations — log and return.
      // When called from create() after _buildWorkstations(), this path is unreachable.
      console.warn(`[IsoTycoonScene] spawnWorkstation: runtime for "${pillarName}" not found — call after create()`)
      return
    }

    // Re-position existing sprites in-place (no destruction, no animation reset)
    runtime.machineSprite?.setPosition(newX, machineY)
    runtime.sprite?.setPosition(newX, spriteY)
    runtime.screenX = newX
    runtime.screenY = spriteY
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE ROOMS — diegetic anchors for secondary-resource pipelines
  // ═══════════════════════════════════════════════════════════════════════════

  _buildInfraRooms() {
    const tileKeys = { power: 'room_power', server: 'room_server', hr: 'room_hr' }
    INFRA_ROOMS.forEach(def => {
      const pos = this._infraCoords[def.id]
      if (!pos) return

      const sprite = this.add.image(pos.x, pos.y, tileKeys[def.id])
        .setOrigin(0.5, 1)
        .setDepth(DEPTH_SORT_BASE + 3)
        .setInteractive({ useHandCursor: true })

      // Hover feedback
      sprite
        .on('pointerover', () => sprite.setAlpha(0.78))
        .on('pointerout',  () => sprite.setAlpha(1.0))
        .on('pointerdown', () => {
          playClick()
          GameEventBus.emit('ui:infra-room-click', { roomId: def.id })
        })
      // Tactile spring press — squash on click, spring back with overshoot.
      this._attachSpringPress(sprite, [sprite], { compressScale: 0.88, springDuration: 240 })

      // Level label rendered as a small Phaser Text above the sprite
      const label = this.add.text(pos.x, pos.y - 40, `${def.icon} Lv1`, {
        fontFamily: "'Fredoka One', sans-serif", fontSize: 9,
        color: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5, 1).setDepth(DEPTH_SORT_BASE + 4)

      this._infraRoomSprites[def.id] = { sprite, label, pos }
      this._depthSortGroup.push({ sprite, yOffset: 3 })
    })
  }

  _applyInfraRoomLevels(levels) {
    if (!levels) return
    this._infraRoomLevels = { ...this._infraRoomLevels, ...levels }

    // Delegate to the EconomyEngine formula so there is exactly one source of truth.
    this._infraLevel = aggregateInfraLevel(this._infraRoomLevels)

    // Visual tier: 1 (dim), 2 (normal), 3 (glow)
    const TIER_TINTS = [0x555555, 0xffffff, 0x88ffdd]
    const tier = (lvl) => lvl < 5 ? 0 : lvl < 10 ? 1 : 2

    INFRA_ROOMS.forEach(def => {
      const entry = this._infraRoomSprites[def.id]
      if (!entry) return
      const lvl = levels[def.id] ?? this._infraRoomLevels[def.id]
      const t = tier(lvl)
      entry.sprite.setTint(TIER_TINTS[t])
      entry.label.setText(`${def.icon} Lv${lvl}`)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENTAL BOOST PROPS — coffee machine (OVERDRIVE) + VIP investor (FRENZY)
  // ═══════════════════════════════════════════════════════════════════════════

  _buildWorldBoostProps() {
    // Both props sit on the ground floor (floorNumber 1) at empty grid columns.
    // The ground floor workstation occupies col=0 row=2 (_FLOOR_COLS[0]=0),
    // so col=3 and col=4 at row=3 are free.
    const orig = this._floorCoords[1] ?? { x: this._isoOriginX, y: this._isoOriginY }

    // Coffee machine at col=3, row=3 on floor 1 (right-side of ground floor)
    const coffeeX  = orig.x  // column 3, which is orig.x + (3 - 3) * (TILE_W / 2) = orig.x
    const coffeeY  = orig.y + (3 + 3) * (TILE_H / 2) - 20  // 20px above tile centre

    // VIP investor at col=4, row=3 on floor 1 (far-right of ground floor)
    const vipX = orig.x + (4 - 3) * (TILE_W / 2)       // orig.x + 32
    const vipY = orig.y + (4 + 3) * (TILE_H / 2) - 20

    this._coffeeProp = this.add.image(coffeeX, coffeeY, 'coffee_machine')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_SORT_BASE + 5)
      .setInteractive({ useHandCursor: true })

    this._vipProp = this.add.image(vipX, vipY, 'vip_investor')
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_SORT_BASE + 5)
      .setInteractive({ useHandCursor: true })

    // Hover feedback
    this._coffeeProp
      .on('pointerover', () => this._coffeeProp.setAlpha(0.78))
      .on('pointerout',  () => this._coffeeProp.setAlpha(1.0))
      .on('pointerdown', () => {
        playClick()
        GameEventBus.emit('ui:activate-skill', { type: 'elevator' })
      })
    // Tactile spring press
    this._attachSpringPress(this._coffeeProp, [this._coffeeProp], { compressScale: 0.88, springDuration: 260 })

    this._vipProp
      .on('pointerover', () => this._vipProp.setAlpha(0.78))
      .on('pointerout',  () => this._vipProp.setAlpha(1.0))
      .on('pointerdown', () => {
        playClick()
        GameEventBus.emit('ui:activate-skill', { type: 'sales' })
      })
    // Tactile spring press
    this._attachSpringPress(this._vipProp, [this._vipProp], { compressScale: 0.88, springDuration: 260 })

    // Add to Y-sort group so they composite correctly with workstation sprites
    this._depthSortGroup.push({ sprite: this._coffeeProp, yOffset: 5 })
    this._depthSortGroup.push({ sprite: this._vipProp,    yOffset: 5 })
  }

  _buildBoostParticles() {
    if (!this._coffeeProp || !this._vipProp) return

    // Steam particles above the coffee machine (cyan drift, slow upward)
    this._coffeeSteam = this.add.particles(
      this._coffeeProp.x,
      this._coffeeProp.y - this._coffeeProp.displayHeight,
      'boost_particle',
      {
        speedY:   { min: -40, max: -15 },
        speedX:   { min: -8,  max:  8  },
        scale:    { start: 0.6, end: 0 },
        alpha:    { start: 0.7, end: 0 },
        lifespan: 1200,
        frequency: 300,
        tint:     [0x00e5ff, 0x67e8f9, 0xffffff],
        gravityY: -10,
        quantity: 1,
        emitting: false,
      }
    ).setDepth(DEPTH_SORT_BASE + 10)

    // Gold sparkle particles above the VIP investor (radial glitter)
    this._vipSparkle = this.add.particles(
      this._vipProp.x,
      this._vipProp.y - this._vipProp.displayHeight,
      'boost_particle',
      {
        speed:    { min: 15, max: 45 },
        scale:    { start: 0.8, end: 0 },
        alpha:    { start: 0.9, end: 0 },
        lifespan: 900,
        frequency: 250,
        tint:     [0xfbbf24, 0xfde68a, 0xf59e0b],
        gravityY: 80,
        quantity: 1,
        emitting: false,
      }
    ).setDepth(DEPTH_SORT_BASE + 10)
  }

  _tickBoostPropStates() {
    const state = this._skillState
    if (!state) return

    const now = Date.now()
    const elevReady   = !!(state.elevatorIsHired && now >= state.elevatorSkillCooldownUntil && now >= state.elevatorSkillActiveUntil)
    const salesReady  = !!(state.salesIsHired    && now >= state.salesSkillCooldownUntil    && now >= state.salesSkillActiveUntil)
    const elevActive  = !!(state.elevatorIsHired  && now < state.elevatorSkillActiveUntil)
    const salesActive = !!(state.salesIsHired     && now < state.salesSkillActiveUntil)

    // Coffee machine (OVERDRIVE / elevator)
    if (this._coffeeProp?.active) {
      if (elevReady) {
        this._coffeeProp.clearTint()
        this._coffeeProp.setAlpha(1)
        if (this._coffeeSteam && !this._coffeeSteam.emitting) this._coffeeSteam.start()
      } else if (elevActive) {
        this._coffeeProp.setTint(0x00e5ff)   // cyan glow while active
        this._coffeeProp.setAlpha(1)
        if (this._coffeeSteam && !this._coffeeSteam.emitting) this._coffeeSteam.start()
      } else {
        this._coffeeProp.setTint(0x555555)   // dim during cooldown
        this._coffeeProp.setAlpha(0.55)
        if (this._coffeeSteam?.emitting) this._coffeeSteam.stop()
      }
    }

    // VIP investor (FRENZY / sales)
    if (this._vipProp?.active) {
      if (salesReady) {
        this._vipProp.clearTint()
        this._vipProp.setAlpha(1)
        if (this._vipSparkle && !this._vipSparkle.emitting) this._vipSparkle.start()
      } else if (salesActive) {
        this._vipProp.setTint(0xfbbf24)    // gold glow while active
        this._vipProp.setAlpha(1)
        if (this._vipSparkle && !this._vipSparkle.emitting) this._vipSparkle.start()
      } else {
        this._vipProp.setTint(0x555555)    // dim during cooldown
        this._vipProp.setAlpha(0.55)
        if (this._vipSparkle?.emitting) this._vipSparkle.stop()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // "SELL COMPANY" PRESTIGE VISUAL — triggered by triggerSellCompany registry
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _playSellCompanyAnimation
   *
   * Plays a visual "sale" sequence that clears the isometric office:
   *   1. Fades and shrinks all workstation sprites, machine backdrops, and room
   *      theme diamonds to alpha=0 (simulates workers leaving and rooms emptying).
   *   2. Simultaneously despawns all diegetic manager NPCs.
   *
   * After the tween, sprites stay invisible.  The `changedata-floorBins`
   * listener (`_syncWorkstationVisibility`) will restore the correct sprites
   * once the React economy reset has pushed the new floor levels to the
   * Phaser registry.
   */
  _playSellCompanyAnimation() {
    // Despawn all manager NPCs immediately (they're sold too).
    for (const floorId of [...this._managerNpcs.keys()]) {
      this._despawnManagerNpc(floorId)
    }

    // Collect all workstation visual layers.
    const targets = []
    for (const ws of this._workstations) {
      if (ws.sprite?.active)        targets.push(ws.sprite)
      if (ws.machineSprite?.active) targets.push(ws.machineSprite)
      if (ws.roomGfx?.active)       targets.push(ws.roomGfx)
      if (ws.docStack?.visible) targets.push(ws.docStack)
    }
    if (!targets.length) return

    // Fade + scale-down: gives the impression of objects being removed/sold.
    this.tweens.add({
      targets,
      alpha:    0,
      scaleX:   0.6,
      scaleY:   0.6,
      duration: 700,
      ease:     'Sine.easeIn',
      onComplete: () => {
        // Reset scale so sprites render correctly when made visible again.
        for (const t of targets) {
          if (t?.active) { t.setScale(1) }
        }
      },
    })
  }

  /**
   * _syncWorkstationVisibility
   *
   * Shows or hides each workstation's sprites based on the floor level stored
   * in the `floorBins` registry array.  Called on scene load (to reflect a
   * loaded save) and after every floor-level change so the isometric building
   * always matches the React economy state.
   *
   * @param {Array<{id:string, level?:number}>} bins – the floorBins registry value
   */
  _syncWorkstationVisibility(bins) {
    if (!Array.isArray(bins)) return
    // Build a Map for O(1) lookups instead of a linear find() per entry.
    const wsById = new Map(this._workstations.map(w => [w.def.id, w]))
    for (const { id, level } of bins) {
      const ws = wsById.get(id)
      if (!ws) continue
      // Treat a missing/undefined level as visible (e.g. initial registry seed
      // before the floors useEffect pushes full data with level fields).
      const visible = (level === null || level === undefined) || (level > 0)
      ws.sprite?.setVisible(visible)
      ws.machineSprite?.setVisible(visible)
      ws.roomGfx?.setVisible(visible)
      // Always hide the doc stack when the floor is locked; it will be re-shown
      // by _updateDocumentStacks() when sim:floor-bins arrives with a non-zero bin.
      if (!visible) ws.docStack?.setVisible(false)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT STACKS — physicalized task-queue visualisation
  //
  //  Each workstation desk has a small `docStack` Graphics object that renders
  //  0–5 paper sheets, scaled to the floor's outputBin fill level.  When the
  //  bin is empty the stack is hidden; when it is full the maximum 5 sheets
  //  are shown.  This replaces the abstract "QUEUED" text label in the
  //  isometric scene with a tangible in-world queue indicator.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _drawDocumentStack
   *
   * Redraws a workstation's docStack Graphics object to show `count` paper
   * sheets (0–5).  Sheets are drawn in the Graphics' local coordinate space
   * (i.e. relative to its world position) and stack upward so each additional
   * sheet appears above the previous one.
   *
   * Visual design:
   *   • Each sheet is a small axis-aligned rectangle (18 × 10 px).
   *   • Alternating sheets are offset 1 px left/right for a "loose pile" look.
   *   • The topmost sheet carries two short "text lines" to read as a document.
   *   • Sheet colour: warm paper yellow (0xfff8dc) with a golden border (0xd4a017).
   *
   * @param {Phaser.GameObjects.Graphics} gfx    – The docStack Graphics instance.
   * @param {number}                       count  – Number of sheets to draw (0–5).
   */
  _drawDocumentStack(gfx, count) {
    gfx.clear()
    if (count <= 0) return

    for (let i = 0; i < count; i++) {
      const yOffset = -(i * 4)          // each sheet 4 px above the previous
      const xJitter = (i % 2 === 0) ? 0 : 1  // alternating jitter for loose-pile look

      // Paper fill
      gfx.fillStyle(0xfff8dc, 0.95)
      gfx.fillRect(xJitter - 9, yOffset - 8, 18, 10)

      // Golden border
      gfx.lineStyle(1, 0xd4a017, 0.85)
      gfx.strokeRect(xJitter - 9, yOffset - 8, 18, 10)

      // "Text lines" on the topmost sheet only — reinforces the document reading
      if (i === count - 1) {
        gfx.lineStyle(1, 0x8b6914, 0.55)
        gfx.strokeLineShape(new Phaser.Geom.Line(xJitter - 6, yOffset - 5, xJitter + 6, yOffset - 5))
        gfx.strokeLineShape(new Phaser.Geom.Line(xJitter - 6, yOffset - 2, xJitter + 4, yOffset - 2))
      }
    }
  }

  /**
   * _updateDocumentStacks
   *
   * Called whenever `sim:floor-bins` arrives (same path as
   * `_syncWorkstationVisibility`).  For each bin entry, calculates a
   * discrete sheet count in the range 0–5 proportional to the floor's
   * outputBin amount, then redraws the matching workstation's docStack.
   *
   * The sheet count is computed as:
   *   count = clamp(ceil(outputBin / DOC_STACK_DIVISOR), 0, 5)
   * where `DOC_STACK_DIVISOR = 200` — meaning 1–200 RC shows 1 sheet,
   * 201–400 shows 2 sheets, …, 801+ shows the maximum 5 sheets.
   *
   * @param {Array<{id:string, outputBin?:number}>} bins
   */
  _updateDocumentStacks(bins) {
    if (!Array.isArray(bins)) return
    const DOC_STACK_DIVISOR = 200
    const wsById = new Map(this._workstations.map(w => [w.def.id, w]))
    for (const { id, outputBin } of bins) {
      const ws = wsById.get(id)
      if (!ws?.docStack) continue

      const amount     = outputBin ?? 0
      const stackCount = amount > 0
        ? Math.min(5, Math.max(1, Math.ceil(amount / DOC_STACK_DIVISOR)))
        : 0

      if (stackCount > 0) {
        ws.docStack.setVisible(true)
        this._drawDocumentStack(ws.docStack, stackCount)
      } else {
        ws.docStack.setVisible(false)
        ws.docStack.clear()
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIEGETIC MANAGER NPCs — supervisor sprites that appear when a floor manager
  // is hired via the React UI.  Each NPC is a gold-tinted hero sprite that
  // patrols its floor, making the abstract "HIRE MANAGER" action visible in
  // the game world.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _spawnManagerNpc
   *
   * Creates a supervisor NPC for the given floor.  The sprite uses the same
   * `hero_iso` spritesheet as worker NPCs but is rendered with a gold tint and
   * a slightly larger scale so it reads as an authority figure.  A looping
   * tween drives a simple left-right patrol on the floor.
   *
   * @param {string} floorId – e.g. 'spell-lab', 'battle-dojo'
   */
  _spawnManagerNpc(floorId) {
    if (this._managerNpcs.has(floorId)) return
    const ws = this._workstations.find(w => w.def.id === floorId)
    if (!ws) return

    // Anchor the manager slightly to the right of the workstation so they
    // stand beside their team rather than on top of the desk sprite.
    const x = ws.screenX + 40
    const y = ws.screenY

    const sprite = this.add.sprite(x, y, 'hero_iso')
    sprite.setScale(1.15)
    sprite.setTint(0xffd700)   // gold — visually distinct from floor-tinted workers
    sprite.play(HERO_ANIM.idle)

    // Patrol: rock the manager left-right with a smooth sine ease.
    // Flipping the sprite horizontally on each yoyo/repeat gives the impression
    // of turning around at each end of the patrol route.
    const patrolTween = this.tweens.add({
      targets:  sprite,
      x:        x + 28,
      duration: 2400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
      onYoyo:   () => sprite.setFlipX(true),
      onRepeat: () => sprite.setFlipX(false),
    })

    this._managerNpcs.set(floorId, { sprite, patrolTween })
    this._depthSortGroup.push({ sprite, yOffset: 0 })
  }

  /**
   * _despawnManagerNpc
   *
   * Stops the patrol tween, removes the sprite from the Y-sort group, and
   * destroys the Phaser sprite.  Called when a manager is fired (e.g. after
   * a Prime Refactor prestige reset).
   *
   * @param {string} floorId – e.g. 'spell-lab'
   */
  _despawnManagerNpc(floorId) {
    const npc = this._managerNpcs.get(floorId)
    if (!npc) return
    npc.patrolTween?.stop()
    this._depthSortGroup = this._depthSortGroup.filter(item => item.sprite !== npc.sprite)
    npc.sprite?.destroy()
    this._managerNpcs.delete(floorId)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MASCOT PET SYSTEM — roaming NPCs that apply passive income boosts
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _spawnMascot
   *
   * Creates a roaming mascot NPC for a given pet ID.  The sprite reuses the
   * `hero_iso` spritesheet (same as worker/manager sprites) and is tinted
   * with the pet's colour so it reads as distinct.  A repeating timer drives
   * A* pathfinding roaming across random valid floor nodes — the same grid
   * logic used by worker NPCs.
   *
   * @param {string} petId – one of the keys in PET_DEFS (e.g. 'orange_cat')
   */
  _spawnMascot(petId) {
    if (this._mascots.has(petId)) return
    const def = PET_DEFS_MAP.get(petId)
    if (!def) return

    // Pick a random floor to start on (floor 1–7, matching workstation floors)
    const startFloor    = Math.floor(Math.random() * 7) + 1
    const floorOrig     = this._floorCoords[startFloor] ?? this._floorCoords[1]

    // Start at grid col 1, row 0 — upper-left open area, always obstacle-free
    const startCol = 1
    const startRow = 0
    const startX   = floorOrig.x + (startCol - startRow) * (TILE_W / 2)
    const startY   = floorOrig.y + (startCol + startRow) * (TILE_H / 2) - TILE_H / 2 - 4

    const sprite = this.add.sprite(startX, startY, 'hero_iso', 0)
    sprite.setOrigin(0.5, 1).setScale(0.9)
    sprite.setTint(def.tint)
    sprite.play(HERO_ANIM.idle)
    this._depthSortGroup.push({ sprite, yOffset: 0 })

    // Track current grid position for A* step-by-step movement
    const state = {
      currentFloor: startFloor,
      col: startCol,
      row: startRow,
      isMoving: false,
    }

    /**
     * _mascotStep
     *
     * Picks a random target node on the current floor, runs A* to find a path,
     * then tweens the mascot through each step in the path one cell at a time.
     * On completion it schedules another call after a short idle pause, giving
     * the mascot a natural "wander → pause → wander" loop.
     */
    const _mascotStep = () => {
      if (!sprite.active) return
      state.isMoving = true

      // Desk cells (row 2) are treated as soft obstacles so the mascot avoids
      // walking through workstations — same approach as manager patrol avoid.
      const deskObstacles = (this._floorCoords[state.currentFloor]
        ? _FLOOR_COLS.map((col, _i) => ({ col, row: 2 }))
        : [])

      // Pick a random target that is not an obstacle
      let targetCol, targetRow
      let attempts = 0
      do {
        targetCol = Math.floor(Math.random() * GRID_COLS)
        targetRow = Math.floor(Math.random() * (GRID_ROWS - 1))  // avoid row 2 desks
        attempts++
      } while (
        deskObstacles.some(o => o.col === targetCol && o.row === targetRow) &&
        attempts < 20
      )

      if (targetCol === state.col && targetRow === state.row) {
        // Already there — just pause then wander again
        state.isMoving = false
        return
      }

      const path = findPath(state.col, state.row, targetCol, targetRow, deskObstacles)
      if (!path || path.length === 0) { state.isMoving = false; return }

      const floorOrig = this._floorCoords[state.currentFloor] ?? this._floorCoords[1]

      // Animate through each path step sequentially
      let stepIdx = 0
      const walkStep = () => {
        if (!sprite.active || stepIdx >= path.length) {
          sprite.play(HERO_ANIM.idle)
          state.isMoving = false
          return
        }
        const { x: col, y: row } = path[stepIdx]
        const wx = floorOrig.x + (col - row) * (TILE_W / 2)
        const wy = floorOrig.y + (col + row) * (TILE_H / 2) - TILE_H / 2 - 4

        // Face the right direction
        const dx = col - state.col
        if (dx > 0) { sprite.setFlipX(false); sprite.play(HERO_ANIM.walkEast, true) }
        else if (dx < 0) { sprite.setFlipX(true); sprite.play(HERO_ANIM.walkWest, true) }
        else {
          const dy = row - state.row
          if (dy > 0) sprite.play(HERO_ANIM.walkSouth, true)
          else        sprite.play(HERO_ANIM.walkNorth, true)
        }

        state.col = col
        state.row = row
        stepIdx++

        this.tweens.add({
          targets:  sprite,
          x: wx, y: wy,
          duration: 320,
          ease:     'Linear',
          onComplete: walkStep,
        })
      }
      walkStep()
    }

    // Kick off the wander loop: step immediately, then every 3–6 s.
    const roamTimer = this.time.addEvent({
      delay:    3000 + Math.random() * 3000,
      loop:     true,
      callback: _mascotStep,
    })
    // First step fires after a short initial pause so the mascot is visible
    this.time.delayedCall(800, _mascotStep)

    this._mascots.set(petId, { sprite, petId, roamTimer, state })
  }

  /**
   * _despawnMascot
   *
   * Stops the roam timer, removes the sprite from the Y-sort group, and
   * destroys the Phaser sprite.
   *
   * @param {string} petId
   */
  _despawnMascot(petId) {
    const mascot = this._mascots.get(petId)
    if (!mascot) return
    mascot.roamTimer?.remove(false)
    this._depthSortGroup = this._depthSortGroup.filter(item => item.sprite !== mascot.sprite)
    mascot.sprite?.destroy()
    this._mascots.delete(petId)
  }

  /**
   * attachHeroToWorkstation  (Phase 5, Task 4)
   *
   * Attaches a hero sprite to a workstation so the hero appears to stand next
   * to or slightly behind the desk/rack/terminal.  The hero is automatically
   * added to the Y-sort depth group, so it renders correctly in isometric
   * space (depth increases with screen Y — objects lower on screen are closer
   * to the viewer and occlude those above them).
   *
   * Depth rules (enforced by _ySort every frame)
   * ─────────────────────────────────────────────────────────────────────────
   *   • Background building-bg  → depth -1  (never occludes anything)
   *   • Floor tiles             → depth 0-24 (static)
   *   • Hero / machine sprites  → depth 50+  (Y-sorted dynamically)
   *   • HUD panel               → depth 200  (always on top)
   *   • Upgrade popup           → depth 500+ (modal overlay)
   *
   * BACKGROUND must be depth 0 (the building-bg is set to -1 in create()).
   * Workstations and heroes share the Y-sort band starting at DEPTH_SORT_BASE.
   *
   * Example usage
   * ─────────────────────────────────────────────────────────────────────────
   *   // Attach Luna's hero sprite to the Sales workstation, nudged left
   *   const hero = this.attachHeroToWorkstation('hero_iso', 'sales', -18, 0)
   *   hero.setTint(0xec4899)    // optional: tint to hero colour
   *
   * @param {string} heroSpriteKey   – Phaser texture key (loaded in preload)
   * @param {string} workstationId   – 'production' | 'logistics' | 'sales'
   * @param {number} [offsetX=0]     – horizontal nudge in canvas pixels
   * @param {number} [offsetY=0]     – vertical nudge (negative = higher on screen)
   * @returns {Phaser.GameObjects.Sprite|null}  the created hero sprite, or null on error
   */
  attachHeroToWorkstation(heroSpriteKey, workstationId, offsetX = 0, offsetY = 0) {
    const runtime = this._workstations.find(w => w.def.id === workstationId)
    if (!runtime) {
      console.warn(`[IsoTycoonScene] attachHeroToWorkstation: workstation "${workstationId}" not found`)
      return null
    }

    // Place hero slightly offset from the workstation sprite so they stand beside the desk
    const heroX = runtime.screenX + offsetX
    const heroY = runtime.screenY + offsetY

    const hero = this.add
      .sprite(heroX, heroY, heroSpriteKey, 0)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH_SORT_BASE)

    // Play idle animation if registered (hero_iso uses HERO_ANIM.idle key)
    if (this.anims.exists(HERO_ANIM.idle)) hero.play(HERO_ANIM.idle)

    // Add to Y-sort group so depth recalculates every frame.
    // yOffset=0: hero depth is purely based on its Y — it will slip behind the
    // desk machine sprite (which uses WS_DEPTH_OFFSET) at the same isometric tile.
    this._depthSortGroup.push({ sprite: hero, yOffset: 0 })

    return hero   // caller can chain .setTint() / .setScale() / etc.
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
   *   ],
   *   "production_speed":  2000,  <- ms per resource token tween (Task 1, optional)
   *   "elevator_speed":     900,  <- ms per floor of elevator travel (Task 2, optional)
   *   "elevator_capacity":    5,  <- max tokens per elevator trip   (Task 2, optional)
   *   "prime_refactor":    false  <- true → full-screen confetti    (Task 3, optional)
   * }
   */
  async _fetchStatus() {
    const ctrl    = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
    try {
      const res = await fetch(STATUS_URL, { signal: ctrl.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

      const data = await res.json()

      // Task 3: HUD counters + floating "+$X" popup when coins increase
      const newCoins = data.total_coins ?? 0
      const delta    = newCoins - this._lastCoins
      this._txtCoins?.setText(this._fmtCoins(newCoins))
      this._fitText(this._txtCoins, 140, Math.round(this.scale.height * 0.036))
      this._txtProdRate?.setText(`${this._fmtRate(data.production_rate ?? 0)}/s`)
      this._fitText(this._txtProdRate, 160, Math.round(this.scale.height * 0.036))
      this._txtNet?.setText(`Updated ${new Date().toLocaleTimeString()}`).setColor(CLR_DIM)

      if (delta > 0) {
        const salesWS = this._workstations.find(w => w.def.id === 'sales')
        if (salesWS) this._spawnCashPopup(salesWS.screenX, salesWS.screenY - 30, delta)
      }
      this._lastCoins = newCoins

      // Task 4: legacy single-boost drives Production pillar + HUD
      this._applyBoostState(!!data.is_boosting)

      // Task 5: per-workstation animation states
      if (Array.isArray(data.workstations)) this._applyWorkstationStates(data.workstations)

      // Task 10: level-based visual tier upgrades
      if (data.production_level != null) this.updateWorkstationVisuals('production', data.production_level)
      if (data.logistics_level  != null) this.updateWorkstationVisuals('logistics',  data.logistics_level)
      if (data.sales_level      != null) this.updateWorkstationVisuals('sales',       data.sales_level)

      // Tasks 1 + 2: dynamic pipeline speed / capacity updates from backend
      if (data.production_speed  != null) this.setProductionSpeed(data.production_speed)
      if (data.elevator_speed    != null) this.setElevatorSpeed(data.elevator_speed)
      if (data.elevator_capacity != null) this.setElevatorCapacity(data.elevator_capacity)

      // Task 3: Prime Refactor milestone → screen-wide confetti celebration
      if (data.prime_refactor) this.triggerConfetti()

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
   * _applyWorkstationStates  (Tasks 5, 11, 1)
   *
   * Drives each pillar's animation and level independently.
   * On a false → true is_working transition:
   *   • fires triggerBountyEffect() (Task 11)
   *   • starts the auto-spawn timer for the Production pillar (Task 1)
   * On a true → false transition for Production, stops the spawn timer.
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

        // Task 1: start / stop auto-spawn for Production pillar
        if (workstation_id === 'production') {
          if (is_working) {
            this._startProdSpawnTimer(runtime)
          } else {
            this._stopProdSpawnTimer()
          }
        }
      }
    })

    // Keep every NPC's capacity context in sync so CheckInfraCapacity reflects
    // the latest server-confirmed levels without any UI coupling.
    const totalLevel = this._workstations.reduce((s, ws) => s + (ws.level ?? 1), 0)
    for (const ws of this._workstations) {
      if (ws.btCtx) {
        ws.btCtx.totalWorkspaceLevel = totalLevel
        ws.btCtx.infraLevel          = this._infraLevel
      }
    }
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
    // Show or hide the modular held-prop in sync with the work animation.
    runtime.propSystem?.setVisible(working)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 10 — Visual upgrade tiers (Garage → Modern Office → Cyber-Hub)
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Public NPC speech-bubble API ────────────────────────────────────────────

  /**
   * showNpcBubble
   *
   * Displays a world-anchored 9-slice speech bubble above the specified
   * workstation's NPC.  The text wrapping bounds dictate the exact 9-slice
   * panel geometry; the tail is rendered as a separate unscaled sprite.
   *
   * The bubble is re-anchored to the NPC's screen position every frame via
   * update(), so it follows camera pans without manual intervention.
   *
   * The NPC's character portrait is automatically resolved from the preloaded
   * `portrait_${wsId}` texture (real SVG or procedural fallback) and passed to
   * NpcSpeechBubble.show() so the portrait renders on the left side of the
   * bubble layout.  The tail remains anchored to the bottom-centre of the full
   * panel width regardless of portrait presence.
   *
   * @param {string} wsId      – Workstation id (e.g. 'spell-lab').
   * @param {string} message   – Text to display.
   * @param {number} [duration=0] – Auto-hide after this many ms.  0 = manual.
   * @param {number} [headOffsetY=80] – World-space pixels to float above the sprite.
   * @param {number} [depth=500]      – Phaser depth for the bubble container.
   */
  showNpcBubble(wsId, message, duration = 0, headOffsetY = 80, depth = 500) {
    const ws = this._workstations.find(w => w.def.id === wsId)
    if (!ws?.speechBubble || !ws.sprite?.active) return

    // Resolve the portrait texture key: prefer the real SVG; fall back to the
    // procedural coloured-swatch generated by _genNpcPortraitFallbacks().
    const portraitKey = `portrait_${wsId}`

    ws.speechBubble.show(
      message,
      ws.sprite.x,
      ws.sprite.y,
      headOffsetY,
      { x: this.cameras.main.worldView.x, y: this.cameras.main.worldView.y, zoom: this.cameras.main.zoom },
      duration,
      depth,
      portraitKey,
    )
  }

  /**
   * hideNpcBubble
   *
   * Fades out and destroys the speech bubble for the specified workstation.
   * Idempotent — safe to call when no bubble is showing.
   *
   * @param {string} wsId – Workstation id.
   */
  hideNpcBubble(wsId) {
    const ws = this._workstations.find(w => w.def.id === wsId)
    ws?.speechBubble?.hide()
  }


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
      fontFamily: FONT_BUBBLE, fontSize: '12px',
      color: def.accentStr, fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5))

    // Current level (large)
    this._popup.add(this.add.text(0, -42, `LEVEL  ${lvl}`, {
      fontFamily: FONT_BUBBLE, fontSize: '30px',
      color: CLR_TEXT, fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5))

    // Upgrade cost
    this._popup.add(this.add.text(0, 8, `Upgrade cost:  ${this._fmtCoins(cost)} coins`, {
      fontFamily: FONT_HUD, fontSize: '14px', color: CLR_COIN, align: 'center',
    }).setOrigin(0.5))

    // Upgrade button — 3D chunky style
    const btnBtnH  = 44
    const btnBtnW  = 164
    const btnX     = -btnBtnW / 2
    const btnY     = 44
    const shadowH  = 6

    // Bottom shadow layer (darker shade of accent colour — gives 3D depth)
    const btnShadow = this.add.graphics()
    const shadowCol = Phaser.Display.Color.ValueToColor(def.accentNum)
    shadowCol.darken(35)
    btnShadow.fillStyle(shadowCol.color, 1)
    btnShadow.fillRoundedRect(btnX, btnY + shadowH, btnBtnW, btnBtnH, 12)
    this._popup.add(btnShadow)

    // Main button face
    const btnBg = this.add.graphics()
    btnBg.fillStyle(def.accentNum, 1)
    btnBg.fillRoundedRect(btnX, btnY, btnBtnW, btnBtnH, 12)
    // Top-highlight inset
    btnBg.fillStyle(0xffffff, 0.18)
    btnBg.fillRoundedRect(btnX + 6, btnY + 4, btnBtnW - 12, 10, 4)
    this._popup.add(btnBg)

    // Button label
    const btnLabel = this.add.text(0, btnY + btnBtnH / 2, 'UPGRADE', {
      fontFamily: FONT_BUBBLE, fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)
    this._popup.add(btnLabel)

    const btnZone = this.add.zone(0, btnY + btnBtnH / 2, btnBtnW, btnBtnH + shadowH)
      .setInteractive({ useHandCursor: true })

    // ── Game-juice pointer interactions ──────────────────────────────────────
    //
    //  Press  : compress all button layers to 80 % with easeInQuad (fast push).
    //  Release: spring back to 100 % using easeOutBack, which overshoots ~10 %
    //           above 1.0 before snapping to rest — simulating elastic weight.
    //  Both tweens are delta-time driven by Phaser's tween manager and run
    //  entirely in the View layer without touching the economy/math thread.

    // Reference to the active compress tween so it can be cancelled early when
    // the pointer releases before the press animation completes.
    let pressTween = null

    // Helper: spring the button layers back to their natural 1.0 scale.
    const springBack = () => {
      pressTween?.stop()
      pressTween = null
      this.tweens.add({
        targets:  [btnBg, btnShadow, btnLabel],
        scaleX:   1,
        scaleY:   1,
        duration: 320,
        ease:     (t) => easeOutBack(t),
      })
    }

    btnZone.on('pointerover', () => btnBg.setAlpha(0.88))
    btnZone.on('pointerout',  () => {
      btnBg.setAlpha(1.0)
      btnBg.setY(0)
      btnShadow.setY(0)
      btnLabel.setY(btnY + btnBtnH / 2)
      springBack()
    })
    btnZone.on('pointerdown', () => {
      // Press down: translate button face down, reduce shadow
      btnBg.setY(4)
      btnShadow.setY(4)
      btnLabel.setY(btnY + btnBtnH / 2 + 4)
      // Compress to 80 % — easeInQuad feels like a physical push
      pressTween?.stop()
      pressTween = this.tweens.add({
        targets:  [btnBg, btnShadow, btnLabel],
        scaleX:   0.80,
        scaleY:   0.80,
        duration: 80,
        ease:     (t) => easeInQuad(t),
      })
      // Infrastructure capacity gate — pure boolean from EconomyEngine (no UI logic here).
      const totalLevel = this._workstations.reduce((s, ws) => s + (ws.level ?? 1), 0)
      if (isUpgradeBlocked(totalLevel, this._infraLevel)) {
        springBack()
        this._flashCoinsRed()
        return
      }
      this._postUpgrade(def.id, lvl + 1, runtime)
    })
    btnZone.on('pointerup', () => {
      btnBg.setY(0)
      btnShadow.setY(0)
      btnLabel.setY(btnY + btnBtnH / 2)
      springBack()
    })
    this._popup.add(btnZone)

    // Close (x) button — top-right corner
    const closeTxt = this.add.text(pw / 2 - 18, -ph / 2 + 17, '✕', {
      fontFamily: FONT_HUD, fontSize: '18px', color: CLR_DIM,
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6, TASK 1 — _fitText  (auto-scaling text utility)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _fitText  (Phase 6, Task 1)
   *
   * Dynamically reduces a Phaser Text object's fontSize so it never spills
   * beyond `maxWidth` canvas pixels.  Starts at `maxFontSize` and steps down
   * by 2 px each iteration until the rendered width fits, or a minimum of 8 px
   * is reached.
   *
   * Usage:
   *   this._txtCoins.setText('1,234,567,890')
   *   this._fitText(this._txtCoins, 140, 20)  // max 140 px wide, start at 20 px
   *
   * @param {Phaser.GameObjects.Text|null|undefined} textObj
   * @param {number} maxWidth      – maximum allowed rendered width in canvas pixels
   * @param {number} maxFontSize   – largest fontSize to attempt (integer, px)
   */
  _fitText(textObj, maxWidth, maxFontSize) {
    if (!textObj?.active) return
    let size = maxFontSize
    textObj.setFontSize(size)
    while (textObj.width > maxWidth && size > 8) {
      size -= 2
      textObj.setFontSize(size)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 6, TASK 2 — Tutorial onboarding overlay
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * _genHandTexture  (Phase 6, Task 2)
   *
   * Generates a procedural "pointing hand" texture (64 × 80 px) using Phaser
   * Graphics.  The hand is bright green with a dark outline to make it pop
   * against both the dark cyber-building and the lighter HUD strip.
   *
   * Layout (top-down):
   *   • Pointing index finger — thin upright rectangle, tip rounded
   *   • Palm body             — wide rounded rectangle
   *   • Cuff highlight strip  — lighter green band at the bottom
   *
   * Key is 'tutorial_hand'; skipped if the texture already exists.
   */
  _genHandTexture() {
    if (this.textures.exists('tutorial_hand')) return
    const g  = this.make.graphics({ x: 0, y: 0, add: false })
    const W = 64, H = 80

    // Dark outline (drawn first, slightly oversized)
    g.fillStyle(0x145a32, 1)
    g.fillRoundedRect(22, 2, 20, 40, 8)   // finger outline
    g.fillRoundedRect(6,  36, 52, 36, 10) // palm outline

    // Green fill
    g.fillStyle(0x27ae60, 1)
    g.fillRoundedRect(24, 4, 16, 36, 7)   // finger
    g.fillRoundedRect(8,  38, 48, 32, 9)  // palm

    // Finger-nail glint
    g.fillStyle(0x58d68d, 0.6)
    g.fillRoundedRect(28, 7, 8, 10, 3)

    // Cuff highlight strip
    g.fillStyle(0x58d68d, 0.35)
    g.fillRect(10, 62, 44, 6)

    g.generateTexture('tutorial_hand', W, H)
    g.destroy()
  }

  /**
   * _buildSpeechBubble  (Phase 6, Task 2)
   *
   * Creates and returns a Phaser Container representing an "Idle Startup Tycoon"-
   * style speech bubble.  The container holds:
   *
   *   • 9-slice scaled panel ('bubble_panel') — corners never distort when the
   *     bubble resizes to fit longer tutorial strings
   *   • Speech-bubble tail triangle pointing left (toward the hand)
   *   • Avatar square (right side) — teal background + simple manager face
   *   • Multi-line bubbly black body text (Fredoka One)
   *
   * Panel height is computed dynamically from the measured text height so the
   * bubble always wraps its content without extra whitespace.
   *
   * The container origin is at its top-left corner.
   * All elements are positioned relative to the container origin.
   *
   * @param {number}  cx      – container X (canvas)
   * @param {number}  cy      – container Y (canvas)
   * @param {string}  message – text to display inside the bubble
   * @param {number}  depth   – setDepth value for the container
   * @returns {Phaser.GameObjects.Container}
   */
  _buildSpeechBubble(cx, cy, message, depth = 1000) {
    const BW      = 310
    const AV      = 64
    const PADDING = 16
    const textMaxW = BW - AV - 32

    // Probe text off-screen to measure wrapped height before building the panel.
    // _fitText may reduce the font size, which changes line heights, so the
    // height must be measured after fitting to match the actual rendered bubble.
    const probe = this.add.text(0, 0, message, {
      fontFamily: FONT_BUBBLE,
      fontSize:   '13px',
      color:      '#111111',
      align:      'left',
      wordWrap:   { width: textMaxW, useAdvancedWrap: true },
    }).setVisible(false)
    this._fitText(probe, textMaxW, 14)
    const BH = Math.max(AV + PADDING, probe.height + PADDING * 2)
    probe.destroy()

    const container = this.add.container(cx, cy).setDepth(depth)

    // ── 9-slice panel — corners stay fixed at 14 px; centre stretches freely ─
    const panel = this.add.nineslice(0, 0, 'bubble_panel', undefined, BW, BH, 14, 14, 14, 14)
      .setOrigin(0, 0)
    container.add(panel)

    // ── Speech-bubble tail (small triangle, pointing left-downward) ─────────
    const tail = this.add.graphics()
    tail.fillStyle(0xffffff, 1)
    tail.fillTriangle(0, BH * 0.55, -16, BH * 0.75, 0, BH * 0.85)
    tail.lineStyle(2, 0x111111, 1)
    tail.strokeTriangle(0, BH * 0.55, -16, BH * 0.75, 0, BH * 0.85)
    container.add(tail)

    // ── Avatar square (right side, slightly inset) ──────────────────────────
    const avatarX = BW - AV - 8
    const avatarY = (BH - AV) / 2

    const avatar = this.add.graphics()
    avatar.fillStyle(0x1abc9c, 1)
    avatar.fillRoundedRect(avatarX, avatarY, AV, AV, 8)
    avatar.lineStyle(2, 0x111111, 1)
    avatar.strokeRoundedRect(avatarX, avatarY, AV, AV, 8)
    container.add(avatar)

    // Manager face — minimal: head circle + eyes + smile
    const faceX = avatarX + AV / 2, faceY = avatarY + AV / 2 - 2
    const face = this.add.graphics()
    face.fillStyle(0xf5cba7, 1); face.fillCircle(faceX, faceY, 18)
    face.fillStyle(0x2c3e50, 1); face.fillCircle(faceX - 5, faceY - 4, 2.5)
    face.fillStyle(0x2c3e50, 1); face.fillCircle(faceX + 5, faceY - 4, 2.5)
    face.lineStyle(2, 0x2c3e50, 1)
    face.beginPath(); face.arc(faceX, faceY + 2, 8, 0.2, Math.PI - 0.2); face.strokePath()
    // Hair
    face.fillStyle(0x3d2b1f, 1); face.fillEllipse(faceX, faceY - 16, 26, 12)
    container.add(face)

    // ── Body text ───────────────────────────────────────────────────────────
    const bodyTxt = this.add.text(14, BH / 2, message, {
      fontFamily:  FONT_BUBBLE,
      fontSize:    '13px',
      color:       '#111111',
      align:       'left',
      wordWrap:    { width: textMaxW, useAdvancedWrap: true },
    }).setOrigin(0, 0.5)
    container.add(bodyTxt)
    this._fitText(bodyTxt, textMaxW, 14)

    return container
  }

  /**
   * _runTutorial  (Phase 6, Task 2)
   *
   * Orchestrates the 2-step onboarding tutorial.  Both steps share one
   * speech-bubble container and one bouncing hand sprite; they are repositioned
   * between steps rather than destroyed and recreated.
   *
   * Step layout (mirrors "Idle Startup Tycoon" reference images)
   * ─────────────────────────────────────────────────────────────────────────
   *  Step 1 — Floor 1 elevator area
   *    Bubble:  "Tap on this engineer to move the server up"
   *    Hand:    placed over the Floor 1 elevator shaft (left side of scene)
   *
   *  Step 2 — Sales workstation
   *    Bubble:  "Lastly, tap on this worker to transfer the product to our
   *              Sales Office"
   *    Hand:    placed over the Sales workstation sprite
   *
   * Tapping anywhere on the screen advances to the next step; after step 2
   * the overlay is destroyed.
   *
   * All tutorial objects are set to depth ≥ 1000 (above everything else
   * including the HUD at 200 and the upgrade popup at 500).
   */
  _runTutorial() {
    const { width, height } = this.scale
    const TUTORIAL_DEPTH = 1000

    // Generate hand texture (no-op if already created)
    this._genHandTexture()

    // ── Tutorial step definitions ──────────────────────────────────────────
    const salesWS     = this._workstations.find(w => w.def.id === 'sales')
    const salesX      = salesWS?.screenX ?? width * 0.75
    const salesY      = salesWS?.screenY ?? height * 0.55

    // Floor 1 elevator: left column, roughly 25 % from left, 60 % from top
    const elevatorX   = width  * 0.15
    const elevatorY   = height * 0.60

    const steps = [
      {
        message:  'Tap on this engineer to move the server up.',
        handX:    elevatorX,
        handY:    elevatorY,
        bubbleX:  width * 0.22,
        bubbleY:  elevatorY - 120,
      },
      {
        message:  'Lastly, tap on this worker to transfer the product to our Sales Office.',
        handX:    salesX,
        handY:    salesY,
        bubbleX:  Math.min(salesX - 160, width - 330),
        bubbleY:  salesY - 160,
      },
    ]

    let currentStep = 0

    // ── Build shared objects ───────────────────────────────────────────────
    const firstStep = steps[0]
    let bubble = this._buildSpeechBubble(firstStep.bubbleX, firstStep.bubbleY, firstStep.message, TUTORIAL_DEPTH)

    const hand = this.add.image(firstStep.handX, firstStep.handY, 'tutorial_hand')
      .setOrigin(0.5, 0).setDepth(TUTORIAL_DEPTH + 1).setScale(0.9)

    // Bobbing tween on the hand — yoyo loop, 600 ms period
    const bobTween = this.tweens.add({
      targets:  hand,
      y:        { from: firstStep.handY - 10, to: firstStep.handY + 10 },
      duration: 600,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })

    // ── Advance / dismiss helper ───────────────────────────────────────────
    const advanceStep = () => {
      currentStep += 1
      if (currentStep >= steps.length) {
        // All steps done — destroy tutorial layer
        bubble.destroy()
        hand.destroy()
        bobTween.remove()
        this._tutorialInput?.removeAllListeners()
        this._tutorialInput?.destroy()
        this._tutorialInput = null
        return
      }
      const s = steps[currentStep]
      // Reposition bubble: destroy old, build new
      bubble.destroy()
      bubble = this._buildSpeechBubble(s.bubbleX, s.bubbleY, s.message, TUTORIAL_DEPTH)
      // Reposition hand and update tween targets (both from and to) so the
      // bobbing range is centred on the new Y, avoiding a visual jump
      hand.setPosition(s.handX, s.handY)
      bobTween.updateTo('y', { from: s.handY - 10, to: s.handY + 10 }, true)
    }

    // Full-screen invisible tap zone — on tap: advance tutorial step
    this._tutorialInput = this.add
      .zone(width / 2, height / 2, width, height)
      .setInteractive()
      .setDepth(TUTORIAL_DEPTH - 1)   // below bubble/hand but above game layer
      .on('pointerdown', advanceStep)
  }
  // END _runTutorial

  // ═══════════════════════════════════════════════════════════════════════════
  // TASKS 1 + 2 + 3 — RESOURCE PIPELINE
  //   Math Tokens  ·  Elevator state machine  ·  Cash-out & Confetti
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Procedural textures ────────────────────────────────────────────────────

  /**
   * _genMathTokenTexture  (Task 1)
   *
   * 20×20 glowing golden coin with a purple diamond symbol at center.
   * Drawn with Phaser Graphics so no external file is needed.
   */
  _genMathTokenTexture() {
    if (this.textures.exists('math_token')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })

    // Outer glow halo
    g.fillStyle(0xfbbf24, 0.25)
    g.fillCircle(10, 10, 10)

    // Coin body
    g.fillStyle(0xfbbf24, 1)
    g.fillCircle(10, 10, 7)

    // Inner highlight
    g.fillStyle(0xfde68a, 0.7)
    g.fillCircle(8, 8, 3)

    // Dark "∑" symbol — approximated with a small diamond
    g.fillStyle(0x7c3aed, 0.9)
    g.fillPoints([
      { x: 10, y: 5 }, { x: 14, y: 10 }, { x: 10, y: 15 }, { x: 6, y: 10 },
    ], true)

    g.generateTexture('math_token', 20, 20)
    g.destroy()
  }

  /**
   * _genElevatorCarTexture  (Task 2)
   *
   * 32×44 metallic elevator car pod with LED strip and corner rivets.
   * Matches the visual style of the existing dark HUD.
   */
  _genElevatorCarTexture() {
    if (this.textures.exists('elevator_car')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    const W = 32, H = 44

    // Body
    g.fillStyle(0x0d1e38, 1)
    g.fillRoundedRect(2, 2, W - 4, H - 4, 5)

    // Border
    g.lineStyle(2, 0x1a3a6a, 1)
    g.strokeRoundedRect(2, 2, W - 4, H - 4, 5)

    // Top LED strip
    g.fillStyle(0x00d4ff, 1)
    g.fillRoundedRect(6, 5, W - 12, 3, 2)

    // Door seam
    g.lineStyle(1, 0x0e2a50, 0.8)
    g.beginPath()
    g.moveTo(W / 2, 10); g.lineTo(W / 2, H - 6)
    g.strokePath()

    // Corner rivets
    g.fillStyle(0x1e3a5f, 1)
    ;[[5, 5], [W - 5, 5], [5, H - 5], [W - 5, H - 5]].forEach(([x, y]) => {
      g.fillCircle(x, y, 2)
    })

    g.generateTexture('elevator_car', W, H)
    g.destroy()
  }

  /**
   * _genConfettiTexture  (Task 3)
   *
   * 8×5 rounded rectangle — the confetti particle.  Tinted at emit-time
   * to produce a full-spectrum rainbow effect.
   */
  _genConfettiTexture() {
    if (this.textures.exists('confetti')) return
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(0, 0, 8, 5, 2)
    g.generateTexture('confetti', 8, 5)
    g.destroy()
  }

  _genBubblePanelTexture() {
    if (this.textures.exists('bubble_panel')) return
    const SIZE = 64, R = 14
    const g = this.make.graphics({ x: 0, y: 0, add: false })
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(0, 0, SIZE, SIZE, R)
    g.lineStyle(3, 0x111111, 1)
    g.strokeRoundedRect(0, 0, SIZE, SIZE, R)
    g.generateTexture('bubble_panel', SIZE, SIZE)
    g.destroy()
  }

  /**
   * _genNpcPortraitFallbacks
   *
   * Generates a procedural 44×44 px portrait texture for every workstation
   * whose real `/assets/heroes/*.svg` failed to load (or was never present).
   * The texture key follows the pattern `portrait_${floorId}` — the same key
   * used when preloading the real SVG asset.
   *
   * Each fallback is a rounded square filled with the hero's accent colour,
   * containing the hero's name initial rendered in white.  This establishes
   * a recognisable character identity even without asset files.
   *
   * No-op for any key that already has a real texture registered (i.e. the SVG
   * loaded successfully), so real portraits are never overwritten.
   */
  _genNpcPortraitFallbacks() {
    const SIZE = 44
    const R    = 10  // corner radius

    ECONOMY_FLOORS.forEach(floor => {
      const key = `portrait_${floor.id}`

      // Skip if the real asset already loaded successfully.
      if (this.textures.exists(key) && !this._assetsMissing.has(key)) return

      const accentNum = parseInt(floor.color.replace('#', ''), 16)

      const g = this.make.graphics({ x: 0, y: 0, add: false })

      // Background: hero accent colour, rounded corners
      g.fillStyle(accentNum, 1)
      g.fillRoundedRect(0, 0, SIZE, SIZE, R)

      // Subtle dark border so the portrait reads clearly against the white panel
      g.lineStyle(2, 0x111111, 0.45)
      g.strokeRoundedRect(0, 0, SIZE, SIZE, R)

      g.generateTexture(key, SIZE, SIZE)
      g.destroy()

      // Overlay the hero's initial letter in white using a text object rendered
      // off-canvas (x=-9999 keeps it invisible until generateTexture captures it).
      // The initial texture is stored under `portrait_initial_${floor.id}` and can
      // be composited onto the portrait by callers that support multi-layer rendering.
      const initial = (floor.hero?.charAt(0) ?? '?').toUpperCase()
      const initialKey = `portrait_initial_${floor.id}`
      if (!this.textures.exists(initialKey)) {
        const txt = this.make.text({
          x: 0, y: 0,
          text: initial,
          style: {
            fontFamily: '"Fredoka One", cursive',
            fontSize:   '22px',
            color:      '#ffffff',
          },
          add: false,
        })
        txt.generateTexture(initialKey, SIZE, SIZE)
        txt.destroy()
      }
    })
  }

  // ── Pipeline initialisation ────────────────────────────────────────────────

  /**
   * _buildResourcePipeline  (Tasks 1 + 2 + 3)
   *
   * Sets up:
   *   1. Per-floor pickup zones (Map<floorNumber, {tokens, x, y}>)
   *   2. Elevator car sprite in the shaft at the ground-floor position
   *   3. Confetti particle emitter for the Prime Refactor celebration
   *   4. Kicks off the elevator idle-check loop
   */
  _buildResourcePipeline() {
    const { height } = this.scale

    // ── 1. Pickup zones — one per workstation floor ───────────────────────
    WORKSTATION_DEFS.forEach(({ floorNumber }) => {
      const floorCoords = this._floorCoords[floorNumber]
      if (!floorCoords) return
      this._pickupZones.set(floorNumber, {
        tokens: [],
        x: PICKUP_ZONE_X,
        y: floorCoords.y,
      })
    })

    // ── 2. Elevator car — placed in the shaft at floor 1 (ground) ────────
    const groundY = this._floorCoords[1]?.y ?? height * 0.70
    this._elevatorCar = this.add.image(ELEVATOR_SHAFT_X, groundY, 'elevator_car')
      .setDepth(ELEVATOR_DEPTH)
      .setOrigin(0.5, 0.5)

    // Idle bobbing tween so it looks alive when stationary
    this.tweens.add({
      targets:  this._elevatorCar,
      y:        { from: groundY - 3, to: groundY + 3 },
      duration: 1400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })

    // ── 3. Confetti emitter ───────────────────────────────────────────────
    this._buildConfettiEmitter()

    // ── 4. Start the elevator idle-poll loop (250 ms checks) ─────────────
    this.time.addEvent({
      delay:         250,
      loop:          true,
      callback:      this._elevatorCheckAndDepart,
      callbackScope: this,
    })
  }

  // ── Confetti emitter ───────────────────────────────────────────────────────

  /**
   * _buildConfettiEmitter  (Task 3)
   *
   * Creates a ParticleEmitter that launches rainbow confetti from the bottom
   * of the screen.  Dormant until triggerConfetti() is called.
   */
  _buildConfettiEmitter() {
    const { width, height } = this.scale
    this._confettiEmitter = this.add.particles(width / 2, height, 'confetti', {
      // Spread confetti across the full screen width
      x:        { min: -width / 2, max: width / 2 },
      speedY:   { min: -620, max: -280 },
      speedX:   { min: -120, max: 120 },
      angle:    { min: -20, max: 200 },
      rotate:   { min: 0, max: 360 },
      gravityY: 260,
      scale:    { min: 0.8, max: 1.8 },
      alpha:    { start: 1, end: 0 },
      lifespan: 2800,
      // Rainbow palette: red · orange · yellow · green · cyan · blue · violet · pink
      tint: [0xff4444, 0xff8800, 0xffdd00, 0x44dd44, 0x00ddff, 0x4488ff, 0xaa44ff, 0xff44cc],
      quantity: 0,
      emitting: false,
    }).setDepth(CONFETTI_DEPTH)
  }

  // ── Task 1 — spawnResource  (public API) ──────────────────────────────────

  /**
   * spawnResource  (Task 1)
   *
   * Creates a glowing Math Token at (startX, startY) and tweens it to
   * (endX, endY).  When the token arrives it is added to the pickup zone
   * for the given floor so the elevator can collect it on its next trip.
   *
   * The tween duration is `this._productionSpeed` ms — controllable via
   * setProductionSpeed() or the `production_speed` field in the status API.
   *
   * @param {number} startX      Canvas X of the production desk
   * @param {number} startY      Canvas Y of the production desk
   * @param {number} endX        Canvas X of the pickup zone
   * @param {number} endY        Canvas Y of the pickup zone
   * @param {number} [floorNumber=1]  Floor this resource belongs to
   * @returns {Phaser.GameObjects.Image}  The token image (already tweening)
   */
  spawnResource(startX, startY, endX, endY, floorNumber = 1) {
    // ── Floor-level Y baseline ────────────────────────────────────────────────
    // In a 2D side-view the token walks horizontally across the floor.
    // Spawn at the floor's Y baseline (endY) so the walk is always horizontal;
    // the workstation spriteY offset (startY) is only used for the initial pop-in
    // position if desired, but the walk must not change Y during forward progress.
    const baseY = endY

    const token = this.add.image(startX, baseY, 'math_token')
      .setDepth(RESOURCE_DEPTH)
      .setOrigin(0.5, 0.5)
      .setScale(0)

    // ── Task 2: Instant directional flip — no rotation, ever ─────────────────
    // Mirror the sprite based on horizontal travel direction so it "faces"
    // the elevator (left) or its desk (right).  setFlipX never spins the sprite.
    token.setFlipX(endX < startX)

    // Pop-in at origin (scale from 0 → 1)
    this.tweens.add({
      targets:  token,
      scaleX:   { from: 0, to: 1 },
      scaleY:   { from: 0, to: 1 },
      duration: 120,
      ease:     'Back.easeOut',
      onComplete: () => {
        // ── Task 3: Bounce-walk — two simultaneous tweens ─────────────────────
        // Task 1 guarantee: no rotation or angle property is ever applied.

        // Tween B (footsteps) is declared first so the onComplete closure of
        // Tween A can reference it.  JavaScript closures capture the variable
        // binding, not the value, so assigning tweenB after tweenA.add() is safe
        // because tweenA.onComplete only fires after _productionSpeed ms.
        let tweenB

        // Tween A — forward progress: X moves linearly to destination
        const tweenA = this.tweens.add({  // eslint-disable-line no-unused-vars
          targets:  token,
          x:        endX,
          duration: this._productionSpeed,
          ease:     'Linear',
          onComplete: () => {
            // ── Cleanup: stop footsteps and snap Y back to floor baseline ────
            // This ensures Tween B never overshoots after Tween A finishes.
            tweenB?.stop()
            token.setY(baseY)

            // Gentle alpha-pulse while token waits for elevator pickup
            this.tweens.add({
              targets:  token,
              alpha:    { from: 1, to: 0.55 },
              duration: 700,
              yoyo:     true,
              repeat:   -1,
              ease:     'Sine.easeInOut',
            })

            // Register in pickup zone so the elevator can collect it
            const zone = this._pickupZones.get(floorNumber)
            if (zone) zone.tokens.push(token)
          },
        })

        // Tween B — footsteps: bounce Y up and down continuously
        tweenB = this.tweens.add({
          targets:  token,
          y:        baseY - 6,
          duration: 150,
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.easeInOut',
        })
      },
    })

    return token
  }

  // ── Task 1 — auto-spawn timer helpers ─────────────────────────────────────

  /**
   * _startProdSpawnTimer
   *
   * Starts a repeating Phaser TimerEvent that calls spawnResource() once per
   * `_productionSpeed` ms.  Calls it immediately (no initial delay) so the
   * first token appears instantly when production becomes active.
   *
   * @param {{ screenX:number, screenY:number, def:{ floorNumber:number } }} ws
   */
  _startProdSpawnTimer(ws) {
    this._stopProdSpawnTimer()
    // Spawn one immediately
    const zone = this._pickupZones.get(ws.def.floorNumber)
    if (zone) this.spawnResource(ws.screenX, ws.screenY, zone.x, zone.y, ws.def.floorNumber)

    // Then on a timer
    this._prodSpawnEvent = this.time.addEvent({
      delay:         this._productionSpeed + 200,
      loop:          true,
      callbackScope: this,
      callback: () => {
        const z = this._pickupZones.get(ws.def.floorNumber)
        // Cap queued tokens at 2× capacity to avoid unbounded accumulation
        if (z && z.tokens.length < this._elevatorCapacity * 2) {
          this.spawnResource(ws.screenX, ws.screenY, z.x, z.y, ws.def.floorNumber)
        }
      },
    })
  }

  /** Stops and clears the production spawn timer. */
  _stopProdSpawnTimer() {
    if (this._prodSpawnEvent) {
      this._prodSpawnEvent.remove(false)
      this._prodSpawnEvent = null
    }
  }

  // ── Task 2 — Elevator state machine ───────────────────────────────────────

  /**
   * _elevatorCheckAndDepart  (Task 2)
   *
   * Called every 250 ms.  When the elevator is IDLE and at least one pickup
   * zone has tokens, picks the lowest unlocked floor with waiting tokens and
   * starts the RISING phase.
   */
  _elevatorCheckAndDepart() {
    if (this._elevatorState !== ELEV_IDLE) return
    if (!this._elevatorCar?.active) return

    // Find the lowest floor that has tokens waiting
    let targetFloor = null
    for (const [floorNum, zone] of this._pickupZones) {
      if (zone.tokens.length > 0) {
        if (targetFloor === null || floorNum < targetFloor) targetFloor = floorNum
      }
    }
    if (targetFloor === null) return

    this._elevatorRise(targetFloor)
  }

  /**
   * _elevatorRise  (Task 2)
   *
   * IDLE → RISING: tweens the elevator car from its current position up to
   * the target floor.  Travel time scales with floor distance and
   * `this._elevatorSpeed` (ms per floor).
   *
   * @param {number} targetFloor  Floor number to travel to
   */
  _elevatorRise(targetFloor) {
    const targetCoords = this._floorCoords[targetFloor]
    if (!targetCoords || !this._elevatorCar?.active) return

    this._elevatorState = ELEV_RISING

    const floorDist   = Math.abs(targetFloor - this._elevatorFloor) || 1
    const travelMs    = floorDist * this._elevatorSpeed

    // Stop idle bobbing while moving
    this.tweens.killTweensOf(this._elevatorCar)

    // Light up the LED strip
    this._elevatorCar.setTint(0x00d4ff)

    this.tweens.add({
      targets:  this._elevatorCar,
      y:        targetCoords.y,
      duration: travelMs,
      ease:     'Quad.easeInOut',
      onComplete: () => {
        this._elevatorFloor = targetFloor
        this._elevatorCollect(targetFloor)
      },
    })
  }

  /**
   * _elevatorCollect  (Task 2)
   *
   * RISING → COLLECTING: pauses 600 ms at the floor, collects up to
   * `_elevatorCapacity` tokens (destroys their sprites), then starts
   * the DESCENDING phase.
   *
   * @param {number} floorNumber
   */
  _elevatorCollect(floorNumber) {
    this._elevatorState = ELEV_COLLECTING
    const zone = this._pickupZones.get(floorNumber)

    // Brief loading flash on elevator body
    this.tweens.add({
      targets:  this._elevatorCar,
      alpha:    { from: 1, to: 0.6 },
      duration: 150,
      yoyo:     true,
      repeat:   2,
    })

    this.time.delayedCall(600, () => {
      let collected = 0
      if (zone) {
        const toLoad = zone.tokens.splice(0, this._elevatorCapacity)
        collected = toLoad.length
        toLoad.forEach(t => {
          if (t?.active) {
            // Quick scale-down into elevator
            this.tweens.killTweensOf(t)
            this.tweens.add({
              targets: t, scale: 0, alpha: 0, duration: 180, ease: 'Quad.easeIn',
              onComplete: () => t.destroy(),
            })
          }
        })
      }
      this._elevatorPayload = collected
      this._elevatorDescend()
    }, [], this)
  }

  /**
   * _elevatorDescend  (Task 2)
   *
   * COLLECTING → DESCENDING: tweens the elevator car back down to floor 1
   * (the Sales/ground floor).  Travel time is proportional to distance.
   */
  _elevatorDescend() {
    this._elevatorState = ELEV_DESCENDING
    const groundCoords  = this._floorCoords[1]
    if (!groundCoords || !this._elevatorCar?.active) {
      this._elevatorState = ELEV_IDLE
      return
    }

    const floorDist = Math.abs(this._elevatorFloor - 1) || 1
    const travelMs  = floorDist * this._elevatorSpeed

    // Change LED to amber while descending
    this._elevatorCar.setTint(0xf59e0b)

    this.tweens.add({
      targets:  this._elevatorCar,
      y:        groundCoords.y,
      duration: travelMs,
      ease:     'Quad.easeInOut',
      onComplete: () => {
        this._elevatorFloor = 1
        this._elevatorCashOut(this._elevatorPayload)
      },
    })
  }

  // ── Task 3 — Cash-out animation ────────────────────────────────────────────

  /**
   * _elevatorCashOut  (Task 3)
   *
   * DESCENDING → CASH_OUT → IDLE:
   *   1. Spawns `payload` Math Token sprites at the elevator position
   *   2. Tweens each one across to the sales desk
   *   3. On the last token arriving: updates the HUD cash display and shows
   *      a "+$X" popup above the sales desk
   *   4. Resets elevator to IDLE with its bobbing tween restored
   *
   * @param {number} payload  Number of tokens delivered
   */
  _elevatorCashOut(payload) {
    this._elevatorState = ELEV_CASH_OUT

    const salesWS    = this._workstations.find(w => w.def.id === 'sales')
    const salesX     = salesWS?.screenX ?? this.scale.width  * 0.58
    const salesY     = salesWS?.screenY ?? this.scale.height * 0.38
    const elevX      = this._elevatorCar?.x ?? ELEVATOR_SHAFT_X
    const elevY      = this._elevatorCar?.y ?? this._floorCoords[1]?.y

    // Reset elevator LED back to idle blue
    this._elevatorCar?.clearTint()

    if (payload <= 0) {
      this._resetElevatorIdle()
      return
    }

    // Estimate coin value — one token ≈ production_rate per token
    const coinValue = Math.round(payload * 10)

    let arrived = 0
    for (let i = 0; i < payload; i++) {
      const delay = i * 80   // stagger tokens so they don't all move at once
      this.time.delayedCall(delay, () => {
        const t = this.add.image(elevX, elevY, 'math_token')
          .setDepth(RESOURCE_DEPTH)
          .setScale(0.85)

        this.tweens.add({
          targets:  t,
          x:        salesX + Phaser.Math.Between(-16, 16),
          y:        salesY + Phaser.Math.Between(-8, 8),
          duration: 480,
          ease:     'Quad.easeOut',
          onComplete: () => {
            // Scale to zero as token "converts" to cash
            this.tweens.add({
              targets: t, scale: 0, alpha: 0, duration: 130, ease: 'Quad.easeIn',
              onComplete: () => {
                t.destroy()
                arrived++
                if (arrived === payload) {
                  // Last token — cash-out complete
                  this._spawnCashPopup(salesX, salesY - 20, coinValue)
                  this._resetElevatorIdle()
                }
              },
            })
          },
        })
      }, [], this)
    }
  }

  /**
   * _resetElevatorIdle  (Task 2 + 3)
   *
   * Returns the elevator to IDLE state and re-attaches the idle bobbing tween.
   */
  _resetElevatorIdle() {
    this._elevatorState   = ELEV_IDLE
    this._elevatorPayload = 0

    if (!this._elevatorCar?.active) return

    const y = this._elevatorCar.y
    this.tweens.killTweensOf(this._elevatorCar)
    this.tweens.add({
      targets:  this._elevatorCar,
      y:        { from: y - 3, to: y + 3 },
      duration: 1400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    })
  }

  /**
   * _spawnCashPopup  (Task 3)
   *
   * Renders a bright "+$X" text that floats upward and fades out over ~900 ms.
   * Provides instant dopamine feedback when cash is earned.
   *
   * @param {number} x       Canvas X position (centred)
   * @param {number} y       Canvas Y position (start)
   * @param {number} amount  Coins earned
   */
  _spawnCashPopup(x, y, amount) {
    const label = amount >= CASH_MILLION  ? `+$${(amount / CASH_MILLION).toFixed(1)}M`
                : amount >= CASH_THOUSAND ? `+$${(amount / CASH_THOUSAND).toFixed(1)}K`
                : `+$${amount}`

    // Acquire a pre-allocated Text object from the pool instead of allocating a
    // new Phaser.GameObjects.Text and destroying it after the tween — this
    // eliminates the per-popup heap allocation and GC stutter at high frequencies.
    const txt = this._cashPopupPool?.acquire()
    if (!txt) return

    txt.setText(label)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(1, 1)
      .setVisible(true)

    const pool = this._cashPopupPool
    this.tweens.add({
      targets:  txt,
      y:        y - 70,
      alpha:    0,
      scaleX:   1.4,
      scaleY:   1.4,
      duration: 900,
      ease:     'Quad.easeOut',
      onComplete: () => {
        // Hide the text object and return it to the pool for reuse.
        txt.setVisible(false)
        pool.release(txt)
      },
    })
  }

  // ── Task 3 — Prime Refactor confetti  (public API) ────────────────────────

  /**
   * triggerConfetti  (Task 3)
   *
   * Fires the screen-wide confetti celebration.  Call this when the backend
   * signals a "Prime Refactor" milestone or any other major achievement.
   *
   * Safe to call from outside the scene — guards against missing emitter.
   *
   * Behaviour:
   *   • Two volleys of 60 confetti particles each, 300 ms apart
   *   • Rainbow tints (8 colours) applied at emit-time
   *   • Particles shoot upward with realistic gravity arc
   */
  triggerConfetti() {
    if (!this._confettiEmitter?.active) return
    this._confettiEmitter.explode(60)
    this.time.delayedCall(300, () => {
      if (this._confettiEmitter?.active) this._confettiEmitter.explode(60)
    }, [], this)
  }

  // ── Upgrade hooks  (public API) ────────────────────────────────────────────

  /**
   * setProductionSpeed  (Task 1)
   * Updates the tween duration used in spawnResource().
   * Also restarts the auto-spawn timer if production is currently active.
   *
   * @param {number} ms  New duration in milliseconds (e.g. 1800)
   */
  setProductionSpeed(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return
    this._productionSpeed = ms
    // Restart spawn timer so it picks up the new interval
    if (this._prodSpawnEvent) {
      const prodWS = this._workstations.find(w => w.def.id === 'production')
      if (prodWS?.isWorking) this._startProdSpawnTimer(prodWS)
    }
  }

  /**
   * setElevatorSpeed  (Task 2)
   * Updates the ms-per-floor travel time for the elevator.
   * Takes effect on the next elevator trip.
   *
   * @param {number} msPerFloor  E.g. 600 for a faster elevator
   */
  setElevatorSpeed(msPerFloor) {
    if (!Number.isFinite(msPerFloor) || msPerFloor <= 0) return
    this._elevatorSpeed = msPerFloor
  }

  /**
   * setElevatorCapacity  (Task 2)
   * Updates how many Math Tokens the elevator loads per trip.
   * Takes effect on the next COLLECTING phase.
   *
   * @param {number} n  Token capacity (integer ≥ 1)
   */
  setElevatorCapacity(n) {
    if (!Number.isFinite(n) || n < 1) return
    this._elevatorCapacity = Math.floor(n)
  }

}
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

