/**
 * EconomyEngine.js — Pure economy math functions for the MathScript Tycoon pipeline.
 *
 * All functions are extracted verbatim from GamePlayerPage.jsx so they can be
 * unit-tested in isolation without importing the React component.
 *
 * Three-Pillar Pipeline
 * ─────────────────────
 *  Node A: Production Floors  → generate Raw Code (RC) per second
 *  Node B: Data Bus / Elevator → transports RC to the warehouse drop-off
 *  Node C: Sales Warehouse     → converts RC batches into TycoonCurrency ($)
 */

// ─── Milestone levels: each threshold adds ×1 to that floor's CPS mult ───────
// Level 10 is the first milestone — gives an immediate 2× multiplier reward.
export const MILESTONE_LEVELS = [10, 25, 50, 100, 200, 300, 400, 500]

// ─── Production Nodes: 7 hero-themed floors ──────────────────────────────────
// baseCost   = dollars to unlock / first upgrade
// rcps       = Raw Code per second per upgrade level (before milestone mult)
export const FLOORS = [
  { id:'spell-lab',   name:"Arcanos' Spell Lab",  short:'SPELL LAB',   desc:'Formula Casting',    hero:'Arcanos',  img:'/assets/heroes/arcanos.svg',  color:'#a855f7', glow:'rgba(168,85,247,.28)', bg:'rgba(168,85,247,.07)', lightBg:'#ffffff', baseCost:8,        rcps:0.5,   roomTheme:'SpellLab'   },
  { id:'battle-dojo', name:"Blaze's Battle Dojo",  short:'BATTLE DOJO', desc:'Combat Equations',   hero:'Blaze',    img:'/assets/heroes/blaze.svg',    color:'#f97316', glow:'rgba(249,115,22,.28)', bg:'rgba(249,115,22,.07)', lightBg:'#fff7ed', baseCost:50,       rcps:2,     roomTheme:'BattleDojo' },
  { id:'moon-studio', name:"Luna's Moon Studio",   short:'MOON STUDIO', desc:'Visual Geometry',    hero:'Luna',     img:'/assets/heroes/luna.svg',     color:'#ec4899', glow:'rgba(236,72,153,.28)', bg:'rgba(236,72,153,.07)', lightBg:'#fdf2f8', baseCost:500,      rcps:10,    roomTheme:'MoonStudio' },
  { id:'speed-desk',  name:"Zenith's Speed Desk",  short:'SPEED DESK',  desc:'Quick Calculations', hero:'Zenith',   img:'/assets/heroes/zenith.svg',   color:'#f59e0b', glow:'rgba(245,158,11,.28)', bg:'rgba(245,158,11,.07)', lightBg:'#fefce8', baseCost:5000,     rcps:60,    roomTheme:'SpeedDesk'  },
  { id:'power-core',  name:"Titan's Power Core",   short:'POWER CORE',  desc:'Heavy Algebra',      hero:'Titan',    img:'/assets/heroes/titan.svg',    color:'#22c55e', glow:'rgba(34,197,94,.28)',  bg:'rgba(34,197,94,.07)',  lightBg:'#f0fdf4', baseCost:50000,    rcps:400,   roomTheme:'PowerCore'  },
  { id:'storm-lab',   name:"Tempest's Storm Lab",  short:'STORM LAB',   desc:'Advanced Physics',   hero:'Tempest',  img:'/assets/heroes/tempest.svg',  color:'#3b82f6', glow:'rgba(59,130,246,.28)', bg:'rgba(59,130,246,.07)', lightBg:'#eff6ff', baseCost:500000,   rcps:3000,  roomTheme:'StormLab'   },
  { id:'shadow-den',  name:"Shadow's Code Den",    short:'CODE DEN',    desc:'Logic & Proofs',     hero:'Shadow',   img:'/assets/heroes/shadow.svg',   color:'#00c8ff', glow:'rgba(0,200,255,.28)',  bg:'rgba(0,200,255,.07)',  lightBg:'#e0f9ff', baseCost:7000000,  rcps:20000, roomTheme:'ShadowDen'  },
]

// ─── Data Bus defaults ────────────────────────────────────────────────────────
export const INIT_BUS = {
  // Transfer Capacity: Raw Code picked up per trip (1000× base for high-production parity)
  capacity: 30_000_000, capacityLevel: 0, capacityCost: 25,
  // Travel Speed: trips per second (1 trip / 2 s default)
  speed: 0.5,  speedLevel: 0,    speedCost: 50,
  // Loading Delay: ms the elevator pauses at a floor to pick up tokens
  loadingDelay: 1500, loadingLevel: 0, loadingCost: 60,
}

// ─── Compiler defaults ────────────────────────────────────────────────────────
export const INIT_COMPILER = {
  // Batch Size: Raw Code consumed per compile cycle (1000× base to match high-production floors)
  batchSize: 3_000_000, batchLevel: 0, batchCost: 30,
  // Processing Time: seconds per compile cycle
  procTime: 2,    procLevel: 0,  procCost: 50,
  // Conversion Rate: Dollars earned per Raw Code unit
  convRate: 2,  convLevel: 0,  convCost: 100,
}

// ═════════════════════════════════════════════════════════════════════════════
// TIERED VISUAL EVOLUTION — environment tier based on floor depth
//   Tier 0: "Garage"    (Floors 1–4)   — brick & wire aesthetic, 1× RC mult
//   Tier 1: "Startup"   (Floors 5–9)   — standard cyberpunk,     2× RC mult
//   Tier 2: "Corporate" (Floors 10–14) — polished dark steel,    5× RC mult
//   Tier 3: "CyberHub"  (Floors 15+)   — dark neon overload,    12× RC mult
// ═════════════════════════════════════════════════════════════════════════════
export const FLOOR_TIER_CONFIG = [
  { id:0, name:'Garage',    label:'GARAGE',    mult:1,  hueRotate:0,   borderAnim:false },
  { id:1, name:'Startup',   label:'STARTUP',   mult:2,  hueRotate:30,  borderAnim:false },
  { id:2, name:'Corporate', label:'CORPORATE', mult:5,  hueRotate:180, borderAnim:false },
  { id:3, name:'CyberHub',  label:'CYBER-HUB', mult:12, hueRotate:270, borderAnim:true  },
]

// Floor wallpapers removed — external image URLs violate CSP; floors use CSS-only styling
// Returns 0–3 based on 1-based floor number
export function getFloorTier(floorNum) {
  if (floorNum >= 15) return 3
  if (floorNum >= 10) return 2
  if (floorNum >= 5)  return 1
  return 0
}

export const FLOOR_COST_MULTIPLIER = 1.15

// ═════════════════════════════════════════════════════════════════════════════
// HQ PRESTIGE TIERS — visual environment tier driven by cumulative Prime Tokens
//
//  Each prestige run (Sell Company) earns Prime Tokens.  The total token count
//  gates which HQ environment palette the player's building displays.
//
//  Tier 0: "Garage HQ"    (0   tokens) — daytime brick, amber windows, blue sky
//  Tier 1: "Startup HQ"   (3+  tokens) — dusk orange sky, neon-tinted pillars
//  Tier 2: "Corporate HQ" (10+ tokens) — midnight steel, purple-tinted windows
//  Tier 3: "CyberHub HQ"  (25+ tokens) — full neon overload, deep space sky
// ═════════════════════════════════════════════════════════════════════════════
export const HQ_PRESTIGE_TIERS = [
  {
    id: 0, name: 'Garage HQ',    minTokens: 0,
    skyTop:     0x1a4a80, skyBottom:   0x5ba8d9,
    pillarFill: 0x111c2a, pillarLine:  0x0a1520,
    windowFill: 0xfff0a0, windowGlow:  0xfffce0,
    cornice:    0x0e1a27,
  },
  {
    id: 1, name: 'Startup HQ',   minTokens: 3,
    skyTop:     0x5c1a00, skyBottom:   0xf59e0b,
    pillarFill: 0x1a0e00, pillarLine:  0x0d0700,
    windowFill: 0xffd580, windowGlow:  0xffe8a0,
    cornice:    0x120a00,
  },
  {
    id: 2, name: 'Corporate HQ', minTokens: 10,
    skyTop:     0x0a0020, skyBottom:   0x2d1060,
    pillarFill: 0x0d0920, pillarLine:  0x060512,
    windowFill: 0xc084fc, windowGlow:  0xe0c0ff,
    cornice:    0x080515,
  },
  {
    id: 3, name: 'CyberHub HQ',  minTokens: 25,
    skyTop:     0x000a14, skyBottom:   0x001428,
    pillarFill: 0x020f18, pillarLine:  0x000a12,
    windowFill: 0x00e8ff, windowGlow:  0x80ffff,
    cornice:    0x000810,
  },
]

/**
 * Returns the HQ prestige tier index (0–3) for the given cumulative Prime Token count.
 * @param {number} tokens
 * @returns {number}
 */
export function computeHqTier(tokens) {
  const t = tokens ?? 0
  for (let i = HQ_PRESTIGE_TIERS.length - 1; i >= 0; i--) {
    if (t >= HQ_PRESTIGE_TIERS[i].minTokens) return i
  }
  return 0
}

// ─── Economy helpers ──────────────────────────────────────────────────────────
export const milestoneMult  = (level) => 1 + MILESTONE_LEVELS.filter(m => level >= m).length
export const floorRCPS      = (def, level) => level === 0 ? 0 : level * def.rcps * milestoneMult(level)
export const calculateNextCost = (baseCost, growthRate, currentLevel) =>
  Math.ceil(baseCost * Math.pow(growthRate, currentLevel))
export const levelCost      = (def, level) => calculateNextCost(def.baseCost, FLOOR_COST_MULTIPLIER, level)

// Returns tier multiplier for a given 0-based array index
export const floorTierMult = (arrayIdx) => FLOOR_TIER_CONFIG[getFloorTier(arrayIdx + 1)].mult
export const workerCount    = (level) => level === 0 ? 0 : Math.min(1 + Math.floor(Math.log(level + 1) / Math.log(5)), 4)

// ─── Logistics Production-Chain Tiers ─────────────────────────────────────────
// FLOORS are split into two production tiers:
//   T1 — "Raw Material" producers (floors 0–2): output flows into the shared
//         rawMaterials sub-currency pool rather than directly into the RC bus.
//   T2 — "Processing" consumers  (floors 3–6): consume 1 unit of rawMaterials
//         per cycle; if the pool is empty their workers hold (FAILURE in BT).
//         On a successful consume cycle they output RC to the elevator bus as
//         normal — but at a premium conversion that reflects the dependency.
//
// The cut at index 3 (speed-desk) matches the natural cost/rcps inflection
// where the economy transitions from "starter" rooms to "high-value" rooms.
// Changing these arrays is the only thing needed to reclassify a floor.
export const T1_FLOOR_INDICES = new Set([0, 1, 2])   // spell-lab, battle-dojo, moon-studio
export const T2_FLOOR_INDICES = new Set([3, 4, 5, 6]) // speed-desk, power-core, storm-lab, shadow-den

/** Returns true when arrayIdx belongs to the T1 (raw-material producer) tier. */
export const isT1Floor = (arrayIdx) => T1_FLOOR_INDICES.has(arrayIdx)
/** Returns true when arrayIdx belongs to the T2 (processor/consumer) tier. */
export const isT2Floor = (arrayIdx) => T2_FLOOR_INDICES.has(arrayIdx)

/**
 * Raw Materials generated by a T1 floor per second.
 * Deliberately capped relative to T2 consumption so the pipeline has natural
 * tension: players must invest in T1 levels to keep T2 workers fed.
 * Formula: same as floorRCPS but capped to a 1:4 supply ratio
 * (1 unit RM feeds 4 T2 floors each consuming RM_COST_PER_CYCLE / cycle).
 */
export const RM_COST_PER_CYCLE = 1   // RM units one T2 floor consumes per cycle

export function getBulkCost(def, startLevel, qty) {
  // Iterative sum so each level uses its own effectiveScale
  let total = 0
  for (let i = 0; i < qty; i++) total += levelCost(def, startLevel + i)
  return Math.ceil(total)
}

export function getMaxQty(def, startLevel, budget) {
  let qty = 0, total = 0
  // Hard cap prevents runaway iteration if cost formula ever returns zero or
  // a negative value (e.g., numeric edge case at extreme levels).
  const MAX_ITER = 10000
  for (let i = 0; i < MAX_ITER; i++) {
    const next = levelCost(def, startLevel + i)
    if (next <= 0) break   // guard: degenerate cost would loop forever
    if (total + next > budget) break
    total += next; qty++
  }
  return { qty, cost: total }
}

// Calculate the total cost of buying 'n' levels (e.g., x10, x50)
export const calculateMultiCost = (baseCost, currentLevel, multiplier, n) => {
  const costAtCurrentLevel = baseCost * Math.pow(multiplier, currentLevel)
  if (n === 1) return costAtCurrentLevel
  if (multiplier === 1) return costAtCurrentLevel * n
  return costAtCurrentLevel * ((Math.pow(multiplier, n) - 1) / (multiplier - 1))
}

// Calculate the absolute maximum number of levels the player can afford (Buy MAX)
export const calculateMaxAffordable = (baseCost, currentLevel, multiplier, currentCash) => {
  const costAtCurrentLevel = baseCost * Math.pow(multiplier, currentLevel)
  if (currentCash < costAtCurrentLevel) return 0
  if (multiplier === 1) return Math.floor(currentCash / costAtCurrentLevel)
  return Math.floor(
    Math.log(1 + (currentCash * (multiplier - 1)) / costAtCurrentLevel) / Math.log(multiplier)
  )
}

// ─── Infrastructure room — workspace capacity gate ────────────────────────────
//
// The infrastructure room is the foundational bottleneck: the sum of ALL
// workspace levels across the 7 production floors must not exceed the
// infrastructure room's current capacity.  This cap is a boolean requirement
// check only — it does not alter any cost formula or multiplier.
//
// capacityPerLevel: workspace-level slots added by each infrastructure upgrade.
export const INFRA_DEF = {
  id: 'infra',
  capacityPerLevel: 10,
}

/**
 * Maximum total workspace level permitted at the given infrastructure level.
 * Returns 0 when infraLevel < 1 (full lockout — used only in edge cases; the
 * scene initialises with infraLevel = 1).
 *
 * @param {number} infraLevel
 * @returns {number}
 */
export const infraCapacity = (infraLevel) =>
  infraLevel < 1 ? 0 : infraLevel * INFRA_DEF.capacityPerLevel

/**
 * Returns true when upgrading a workspace would push the running total above
 * the current infrastructure capacity.
 *
 * Each upgrade adds exactly 1 to the total workspace level, so the check is:
 *   currentTotalLevel + 1 > infraCapacity(infraLevel)
 *
 * The cost formulas (levelCost, calculateNextCost, etc.) are never consulted
 * or modified here — this is a pure boolean gate.
 *
 * @param {number} currentTotalLevel  Sum of all workspace levels before upgrade.
 * @param {number} infraLevel         Current infrastructure room level.
 * @returns {boolean}
 */
export const isUpgradeBlocked = (currentTotalLevel, infraLevel) =>
  currentTotalLevel + 1 > infraCapacity(infraLevel)

// ─── Infrastructure Rooms — diegetic secondary-resource anchors ───────────────
//
//  Three physical rooms on the isometric grid each govern one secondary-resource
//  pipeline.  Their levels are averaged to produce the single `infraLevel` value
//  consumed by `infraCapacity()` and `isUpgradeBlocked()` — the core formulas
//  are unchanged; we are only changing where the level originates.
//
export const INFRA_ROOMS = [
  { id: 'power',  label: 'Power Generator', icon: '⚡', color: '#f59e0b', baseCost:  50, growthRate: 1.3 },
  { id: 'server', label: 'Server / IT',     icon: '⚙️', color: '#22c55e', baseCost:  75, growthRate: 1.3 },
  { id: 'hr',     label: 'HR / Scheduling', icon: '🛗', color: '#3b82f6', baseCost: 100, growthRate: 1.3 },
]

export const INIT_INFRA_ROOMS = {
  power:  { level: 1, cost: calculateNextCost(50,  1.3, 1) },
  server: { level: 1, cost: calculateNextCost(75,  1.3, 1) },
  hr:     { level: 1, cost: calculateNextCost(100, 1.3, 1) },
}

// Aggregate infrastructure level from the three room levels — feeds the
// existing infraCapacity() / isUpgradeBlocked() formulas without changing them.
export const aggregateInfraLevel = ({ power, server, hr }) =>
  Math.ceil((power.level + server.level + hr.level) / 3)

// ─── Secondary-resource generation rates ──────────────────────────────────────
//
//  Power (⚡) and Maintenance (⚙) are sub-currencies that accumulate each tick
//  based on the Power Generator and Server/IT infrastructure room levels.
//  They are spent to unlock Uplink tech-tree nodes (see UplinkTechTree.js).
//
//  Rate formula: points / second = infraRoom.level × GEN_PER_LEVEL
//  The pools are soft-capped at POOL_MAX — accumulation stops at the cap.
//
export const POWER_GEN_PER_LEVEL = 0.5   // ⚡ points / second / Power Gen level
export const MAINT_GEN_PER_LEVEL = 0.5   // ⚙  points / second / Server-IT level
export const POWER_POOL_MAX      = 100   // hard cap on the Power  pool
export const MAINT_POOL_MAX      = 100   // hard cap on the Maint  pool

// Round to 2 decimal places (used inside calculateOfflineProgress)
const r2 = (n) => parseFloat(n.toFixed(2))

// Only calculates earnings when at least the elevator and sales managers are hired
// (the minimum required for fully automated pipeline operation).
// Capped at 8 hours of offline time.
export function calculateOfflineProgress(savedData) {
  if (!savedData?.lastSavedTimestamp) return { earned: 0, seconds: 0 }
  const seconds = Math.min((Date.now() - savedData.lastSavedTimestamp) / 1000, 8 * 3600)
  if (seconds < 60) return { earned: 0, seconds: 0 }   // skip trivial gaps

  // Require automated pipeline: elevator manager + sales manager must both be hired
  const mgrs = savedData.managers ?? {}
  const elevatorHired = mgrs.elevator?.isHired ?? false
  const salesHired    = mgrs.sales?.isHired ?? false
  if (!elevatorHired || !salesHired) return { earned: 0, seconds: 0 }

  const floorStates = savedData.floors ?? []
  const totalRCPS = floorStates.reduce(
    (s, fs, i) => s + (FLOORS[i] ? floorRCPS(FLOORS[i], fs.level ?? 0) * floorTierMult(i) : 0), 0
  )
  const bus = savedData.bus ?? {}
  const compiler = savedData.compiler ?? {}
  // Bottleneck: effective throughput is the minimum across the three pipeline nodes
  const busRCPS       = (bus.capacity ?? 30) * (bus.speed ?? 0.5)
  const compilerRCPS  = (compiler.batchSize ?? 3) / Math.max(0.5, compiler.procTime ?? 2)
  const effectiveRCPS = Math.min(totalRCPS, busRCPS, compilerRCPS)
  const dollarsPerSec = effectiveRCPS * (compiler.convRate ?? 2)
  return { earned: r2(dollarsPerSec * seconds), seconds: Math.round(seconds) }
}

// ─── City Lots — Macro City real-estate grid (3 × 3 = 9 lots) ────────────────
//
//  Lot 0 is the player's starting office (always owned; cost = 0).
//  Remaining lots are purchased with the primary cash economy in order.
//  Costs follow a ×10 step-ladder to provide meaningful progression gates.
//
//  Layout maps to a 3-column isometric grid rendered in the city view:
//    col 0 = left lane, col 1 = centre, col 2 = right lane
//    row 0 = far (top of screen), row 1 = mid, row 2 = near (bottom)
//
export const CITY_LOTS = [
  { id: 0, row: 2, col: 1, cost:          0 },  // starter office — always owned
  { id: 1, row: 2, col: 0, cost:     50_000 },
  { id: 2, row: 2, col: 2, cost:    100_000 },
  { id: 3, row: 1, col: 1, cost:    500_000 },
  { id: 4, row: 1, col: 0, cost:  1_000_000 },
  { id: 5, row: 1, col: 2, cost:  5_000_000 },
  { id: 6, row: 0, col: 1, cost: 10_000_000 },
  { id: 7, row: 0, col: 0, cost: 25_000_000 },
  { id: 8, row: 0, col: 2, cost: 50_000_000 },
]

// Applies calculateOfflineProgress independently to each owned building snapshot
// and stamps the new lastSavedTimestamp so next calls don't double-count.
// Returns a parallel array of { earned, seconds } per buildings entry.
// IMPORTANT: does NOT mutate the caller's state — callers must apply the
// returned earnings themselves to preserve the decoupled math engine contract.
export function calculateAllBuildingsOfflineProgress(buildings) {
  if (!Array.isArray(buildings)) return []
  return buildings.map(bld => {
    if (!bld?.snapshot) return { earned: 0, seconds: 0 }
    return calculateOfflineProgress(bld.snapshot)
  })
}
