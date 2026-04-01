/**
 * GamePlayerPage — Math Script Tycoon
 * ─────────────────────────────────────────────────────────────────────────────
 * Three-Pillar Economy Pipeline
 *
 *  [Production Nodes] ──raw code──▶ [Data Bus / Elevator] ──transit──▶ [Compiler]
 *        ↓                                  ↓                               ↓
 *   Raw Code /s                   Transfer Capacity                  Tycoon Coins
 *   (7 hero floors)               Travel Speed                       Batch Size
 *                                                                     Proc Speed
 *
 * Each pillar has an Automation Manager toggle:
 *   false → player must click manually to trigger the action
 *   true  → runs on an automatic setInterval loop (unlocked with coins)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import confetti from 'canvas-confetti'
import AnalogyOverlay from '../components/AnalogyOverlay'
import { syncPendingMilestones } from '../utils/milestoneSync'
import { playClick, playChaChing } from '../utils/SoundEngine'
import { trackEvent } from '../utils/Telemetry'
import { saveTycoonState, loadTycoonState } from '../api/client'

// ─── Phaser canvas reference dimensions ──────────────────────────────────────
const GAME_WIDTH  = 800
const GAME_HEIGHT = 450

// ─── Milestone levels: each threshold adds ×1 to that floor's CPS mult ───────
// Level 10 is the first milestone — gives an immediate 2× multiplier reward.
const MILESTONE_LEVELS = [10, 25, 50, 100, 200, 300, 400, 500]

// ─── Manager system — per-floor + elevator + sales ────────────────────────────
const managerFloorCost  = (def) => Math.ceil(def.baseCost * 8)
const MANAGER_ELEV_COST  = 1000
const MANAGER_SALES_COST = 2500

// ─── One-time automation unlock costs (Dollars) ───────────────────────────────
const AUTO_COSTS = { production: 50, dataBus: 100, compiler: 250 }

// ─── Production Nodes: 7 hero-themed floors ──────────────────────────────────
// baseCost   = dollars to unlock / first upgrade
// rcps       = Raw Code per second per upgrade level (before milestone mult)
const FLOORS = [
  { id:'spell-lab',   name:"Arcanos' Spell Lab",  short:'SPELL LAB',   desc:'Formula Casting',    hero:'Arcanos',  img:'/assets/heroes/arcanos.svg',  color:'#a855f7', glow:'rgba(168,85,247,.28)', bg:'rgba(168,85,247,.07)', lightBg:'#ffffff', baseCost:8,        rcps:0.5   },
  { id:'battle-dojo', name:"Blaze's Battle Dojo",  short:'BATTLE DOJO', desc:'Combat Equations',   hero:'Blaze',    img:'/assets/heroes/blaze.svg',    color:'#f97316', glow:'rgba(249,115,22,.28)', bg:'rgba(249,115,22,.07)', lightBg:'#fff7ed', baseCost:50,       rcps:2     },
  { id:'moon-studio', name:"Luna's Moon Studio",   short:'MOON STUDIO', desc:'Visual Geometry',    hero:'Luna',     img:'/assets/heroes/luna.svg',     color:'#ec4899', glow:'rgba(236,72,153,.28)', bg:'rgba(236,72,153,.07)', lightBg:'#fdf2f8', baseCost:500,      rcps:10    },
  { id:'speed-desk',  name:"Zenith's Speed Desk",  short:'SPEED DESK',  desc:'Quick Calculations', hero:'Zenith',   img:'/assets/heroes/zenith.svg',   color:'#f59e0b', glow:'rgba(245,158,11,.28)', bg:'rgba(245,158,11,.07)', lightBg:'#fefce8', baseCost:5000,     rcps:60    },
  { id:'power-core',  name:"Titan's Power Core",   short:'POWER CORE',  desc:'Heavy Algebra',      hero:'Titan',    img:'/assets/heroes/titan.svg',    color:'#22c55e', glow:'rgba(34,197,94,.28)',  bg:'rgba(34,197,94,.07)',  lightBg:'#f0fdf4', baseCost:50000,    rcps:400   },
  { id:'storm-lab',   name:"Tempest's Storm Lab",  short:'STORM LAB',   desc:'Advanced Physics',   hero:'Tempest',  img:'/assets/heroes/tempest.svg',  color:'#3b82f6', glow:'rgba(59,130,246,.28)', bg:'rgba(59,130,246,.07)', lightBg:'#eff6ff', baseCost:500000,   rcps:3000  },
  { id:'shadow-den',  name:"Shadow's Code Den",    short:'CODE DEN',    desc:'Logic & Proofs',     hero:'Shadow',   img:'/assets/heroes/shadow.svg',   color:'#00c8ff', glow:'rgba(0,200,255,.28)',  bg:'rgba(0,200,255,.07)',  lightBg:'#e0f9ff', baseCost:7000000,  rcps:20000 },
]
const FLOORS_VIS = 4
// Index of the starting floor (Code Den / Shadow's Code Den) — the bottom-most
// floor in the UI (displayFloor=1). Extracted as a constant so the buildDefault
// seed logic doesn't rely on a fragile magic number.
const CODE_DEN_INDEX = FLOORS.findIndex(f => f.id === 'shadow-den')

// ─── Data Bus defaults ────────────────────────────────────────────────────────
const INIT_BUS = {
  // Transfer Capacity: Raw Code picked up per trip
  capacity: 30, capacityLevel: 0, capacityCost: 25,
  // Travel Speed: trips per second (1 trip / 2 s default)
  speed: 0.5,  speedLevel: 0,    speedCost: 50,
}

// ─── Compiler defaults ────────────────────────────────────────────────────────
const INIT_COMPILER = {
  // Batch Size: Raw Code consumed per compile cycle
  batchSize: 3, batchLevel: 0, batchCost: 30,
  // Processing Time: seconds per compile cycle
  procTime: 2,  procLevel: 0,  procCost: 50,
  // Conversion Rate: Dollars earned per Raw Code unit
  convRate: 2,  convLevel: 0,  convCost: 100,
}

// ═════════════════════════════════════════════════════════════════════════════
// ECONOMY MANAGER — central formulas for the three-node pipeline
//   Node A: Production Floors  → generate Raw Code (RC) per second
//   Node B: Data Bus / Elevator → transports RC to the warehouse drop-off
//   Node C: Sales Warehouse     → converts RC batches into TycoonCurrency ($)
// ═════════════════════════════════════════════════════════════════════════════

// ─── LEVEL MANAGER — upgrade cost formula ─────────────────────────────────────
// Cost = BaseCost × (1.15 ^ currentLevel)   (Idle-Tycoon standard compound growth)
// growthRate 1.15 for production/compiler upgrades; 1.07 for Data Bus

// ─── Economy helpers ──────────────────────────────────────────────────────────
const milestoneMult  = (level) => 1 + MILESTONE_LEVELS.filter(m => level >= m).length
const floorRCPS      = (def, level) => level === 0 ? 0 : level * def.rcps * milestoneMult(level)
const calculateNextCost = (baseCost, growthRate, currentLevel) =>
  Math.ceil(baseCost * Math.pow(growthRate, currentLevel))
const levelCost      = (def, level) => calculateNextCost(def.baseCost, 1.15, level)

// ═════════════════════════════════════════════════════════════════════════════
// TIERED VISUAL EVOLUTION — environment tier based on floor depth
//   Tier 0: "Garage"    (Floors 1–4)   — brick & wire aesthetic, 1× RC mult
//   Tier 1: "Startup"   (Floors 5–9)   — standard cyberpunk,     2× RC mult
//   Tier 2: "Corporate" (Floors 10–14) — polished dark steel,    5× RC mult
//   Tier 3: "CyberHub"  (Floors 15+)   — dark neon overload,    12× RC mult
// ═════════════════════════════════════════════════════════════════════════════
const FLOOR_TIER_CONFIG = [
  { id:0, name:'Garage',    label:'GARAGE',    mult:1,  hueRotate:0,   borderAnim:false },
  { id:1, name:'Startup',   label:'STARTUP',   mult:2,  hueRotate:30,  borderAnim:false },
  { id:2, name:'Corporate', label:'CORPORATE', mult:5,  hueRotate:180, borderAnim:false },
  { id:3, name:'CyberHub',  label:'CYBER-HUB', mult:12, hueRotate:270, borderAnim:true  },
]
// Returns 0–3 based on 1-based floor number
function getFloorTier(floorNum) {
  if (floorNum >= 15) return 3
  if (floorNum >= 10) return 2
  if (floorNum >= 5)  return 1
  return 0
}
// Returns tier multiplier for a given 0-based array index
const floorTierMult = (arrayIdx) => FLOOR_TIER_CONFIG[getFloorTier(arrayIdx + 1)].mult
const nextML         = (level) => MILESTONE_LEVELS.find(m => m > level) ?? null
const workerCount    = (level) => level === 0 ? 0 : Math.min(1 + Math.floor(Math.log(level + 1) / Math.log(5)), 4)

function getBulkCost(def, startLevel, qty) {
  // Iterative sum so each level uses its own effectiveScale
  let total = 0
  for (let i = 0; i < qty; i++) total += levelCost(def, startLevel + i)
  return Math.ceil(total)
}
function getMaxQty(def, startLevel, budget) {
  let qty = 0, total = 0
  for (let i = 0; i < 10000; i++) {
    const next = levelCost(def, startLevel + i)
    if (total + next > budget) break
    total += next; qty++
  }
  return { qty, cost: total }
}
function fmtN(n) {
  if (n >= 1e12) return (n/1e12).toFixed(1).replace(/\.0$/,'')+'T'
  if (n >= 1e9)  return (n/1e9 ).toFixed(1).replace(/\.0$/,'')+'B'
  if (n >= 1e6)  return (n/1e6 ).toFixed(1).replace(/\.0$/,'')+'M'
  if (n >= 1e3)  return (n/1e3 ).toFixed(1).replace(/\.0$/,'')+'K'
  return Math.floor(n).toString()
}
function fmtRC(n)  { return n < 10 ? n.toFixed(1) : fmtN(n) }
function fmtCPS(n) { return n < 0.01 ? '0' : n < 10 ? n.toFixed(2) : fmtN(n) }
const r2 = (n)     => parseFloat(n.toFixed(2))

// ─── Timing constants ──────────────────────────────────────────────────────────
const MIN_BUS_TRAVEL_MS    = 800   // minimum elevator trip duration (ms)
const BUS_LOADING_DELAY_MS = 350   // pause at floor while loading payload (ms)
const COMPILER_FETCH_MS    = 600   // time for compiler to fetch a batch (ms)
const MIN_COMPILER_PROC_MS = 300   // minimum processing duration (ms)
const CLOUD_SAVE_INTERVAL_MS = 15_000  // background save to Cosmos every 15 s
const WORKER_WALK_MS       = 900   // duration of one-way walk animation (ms)

// ─── Image asset paths ────────────────────────────────────────────────────────
const IMG = {
  coder:   '/assets/coder.svg',    // worker at desk (active / idle)
  courier: '/assets/courier.svg',  // data-bus courier in transit
  manager: '/assets/manager.svg',  // manager portrait
}

// ─── Persistence ──────────────────────────────────────────────────────────────
// v6: added primeTokens prestige field; v5 saves auto-migrate via hydrate()
const SAVE_KEY = 'mst_economy_v7'
function loadSave() {
  // try v7 first, fall back to v6 so existing saves migrate forward
  try {
    const v7 = JSON.parse(localStorage.getItem('mst_economy_v7') || 'null')
    if (v7) return v7
    return JSON.parse(localStorage.getItem('mst_economy_v6') || 'null')
  } catch { return null }
}
function buildDefault() {
  return {
    // 🌱 Seed Funding: player starts with $1000
    coins: 1000, lifetime: 0,
    productionBuffer: 0, prodCap: 150,
    compilerBuffer: 0,
    warehouseBuffer: 0,  // canonical field name going forward; compilerBuffer kept for backward compat only
    floors: FLOORS.map((_, i) => ({ level: i === 0 ? 1 : 0 })),
    bus: { ...INIT_BUS },
    compiler: { ...INIT_COMPILER },
    auto: { production: false, dataBus: false, compiler: false },
    managers: { floors: FLOORS.map(() => false), elevator: false, sales: false },
    primeTokens: 0,
  }
}
function hydrate(saved) {
  const def = buildDefault()
  if (!saved) return def
  return {
    coins:            saved.coins            ?? def.coins,
    lifetime:         saved.lifetime         ?? def.lifetime,
    productionBuffer: saved.productionBuffer ?? saved.rawCode    ?? def.productionBuffer,
    prodCap:          saved.prodCap          ?? saved.rawCodeCap ?? def.prodCap,
    // warehouseBuffer and compilerBuffer are the same logical value; prefer warehouseBuffer if present
    compilerBuffer:   saved.warehouseBuffer  ?? saved.compilerBuffer ?? saved.inTransit ?? def.compilerBuffer,
    floors:      (saved.floors?.length === FLOORS.length ? saved.floors : def.floors).map(f => ({ level: f.level ?? 0 })),
    bus:         { ...def.bus,      ...(saved.bus      ?? {}) },
    compiler:    { ...def.compiler, ...(saved.compiler ?? {}) },
    auto:        { ...def.auto,     ...(saved.auto     ?? {}) },
    managers: {
      floors:   (saved.managers?.floors?.length === FLOORS.length ? saved.managers.floors : def.managers.floors),
      elevator: saved.managers?.elevator ?? def.managers.elevator,
      sales:    saved.managers?.sales    ?? def.managers.sales,
    },
    primeTokens: saved.primeTokens ?? def.primeTokens,
  }
}

function computeCanvasSize() {
  const s = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT)
  return { width: Math.floor(GAME_WIDTH * s), height: Math.floor(GAME_HEIGHT * s) }
}

// ─── CSS animations ───────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes walk-r     { 0%,100%{transform:translateX(0) scaleX(1)}  45%{transform:translateX(28px) scaleX(1)}  55%{transform:translateX(28px) scaleX(-1)} 95%{transform:translateX(0) scaleX(-1)} }
  @keyframes walk-l     { 0%,100%{transform:translateX(0) scaleX(-1)} 45%{transform:translateX(-28px) scaleX(-1)} 55%{transform:translateX(-28px) scaleX(1)} 95%{transform:translateX(0) scaleX(1)} }
  @keyframes float-up   { 0%{opacity:1;transform:translateY(0) scale(1)} 50%{opacity:.9;transform:translateY(-60px) scale(1.18)} 100%{opacity:0;transform:translateY(-120px) scale(.75)} }
  @keyframes glow-cyan  { 0%,100%{text-shadow:0 0 16px rgba(0,200,255,.5)} 50%{text-shadow:0 0 32px rgba(0,200,255,1),0 0 56px rgba(0,200,255,.4)} }
  @keyframes pulse      { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.85;transform:scale(1.04)} }
  @keyframes orbit      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes orbit-rev  { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
  @keyframes hero-bob   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  @keyframes gear-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes load-flash { 0%,100%{opacity:1;box-shadow:0 0 12px rgba(59,130,246,.4)} 50%{opacity:.6;box-shadow:0 0 28px rgba(59,130,246,.9)} }
  @keyframes fetch-pulse{ 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes work-tap   { 0%,100%{transform:translateY(0) rotate(0deg)} 25%{transform:translateY(-4px) rotate(-4deg)} 75%{transform:translateY(-4px) rotate(4deg)} }
  .w-a{ animation: walk-r 3.8s ease-in-out infinite;      display:inline-block; will-change:transform }
  .w-b{ animation: walk-l 4.5s ease-in-out infinite .8s;  display:inline-block; will-change:transform }
  .w-c{ animation: walk-r 3.2s ease-in-out infinite 1.4s; display:inline-block; will-change:transform }
  .w-d{ animation: walk-l 5.0s ease-in-out infinite .3s;  display:inline-block; will-change:transform }
  .w-idle{ display:inline-block; filter:brightness(.55) }
  .w-work{ display:inline-block; animation: work-tap 1.1s ease-in-out infinite; will-change:transform }
  .float-num{ position:absolute;pointer-events:none;font-family:'Fredoka One',sans-serif;font-size:17px;font-weight:800;color:#fbbf24;text-shadow:0 0 8px rgba(251,191,36,.8);z-index:9999;animation:float-up 1.5s ease-out forwards }
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:#f0f4f8}
  ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}

  /* ── Worker desk animations ──────────────────────────────────────────── */
  @keyframes typing {
    0%,100% { transform:translateY(0) rotate(-1deg); }
    15%     { transform:translateY(-3px) rotate(1.5deg); }
    30%     { transform:translateY(0) rotate(-0.5deg); }
    50%     { transform:translateY(-4px) rotate(-2deg); }
    70%     { transform:translateY(-2px) rotate(1deg); }
    85%     { transform:translateY(-1px) rotate(0deg); }
  }
  @keyframes head-nod {
    0%,100% { transform:rotate(0deg) translateY(0); }
    40%,60% { transform:rotate(-14deg) translateY(4px); }
  }
  @keyframes sleeping {
    0%,100% { transform:rotate(-16deg) translateY(0); }
    50%     { transform:rotate(-22deg) translateY(5px); }
  }
  @keyframes zzz-a { 0%{opacity:0;transform:translate(0,0) scale(.55)} 20%{opacity:1} 100%{opacity:0;transform:translate(9px,-26px) scale(1)} }
  @keyframes zzz-b { 0%{opacity:0;transform:translate(0,0) scale(.7)}  20%{opacity:1} 100%{opacity:0;transform:translate(15px,-36px) scale(1.2)} }
  @keyframes zzz-c { 0%{opacity:0;transform:translate(0,0) scale(1)}   20%{opacity:1} 100%{opacity:0;transform:translate(20px,-48px) scale(1.4)} }

  /* ── Compiler character animations ──────────────────────────────────── */
  @keyframes fetch-walk {
    0%   { transform:translateX(0)    scaleX(1);  }
    28%  { transform:translateX(-58px) scaleX(-1); }
    55%  { transform:translateX(-64px) scaleX(-1); }
    88%  { transform:translateX(0)    scaleX(1);  }
    100% { transform:translateX(0)    scaleX(1);  }
  }
  @keyframes proc-tap {
    0%,100% { transform:translateY(0) rotate(-1deg); }
    25%     { transform:translateY(-5px) rotate(1deg); }
    60%     { transform:translateY(-3px) rotate(-1deg); }
  }
  @keyframes mainframe-glow {
    0%,100% { filter:drop-shadow(0 0 5px rgba(34,197,94,.5)); }
    50%     { filter:drop-shadow(0 0 18px rgba(34,197,94,.95)) drop-shadow(0 0 34px rgba(34,197,94,.35)); }
  }
  @keyframes file-carry {
    0%,100% { transform:translateY(0) rotate(-8deg); }
    50%     { transform:translateY(-5px) rotate(6deg); }
  }

  /* ── Coin burst particles ─────────────────────────────────────────────── */
  @keyframes coin-pop-1 { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 100%{opacity:0;transform:translate(-28px,-58px) scale(.5)} }
  @keyframes coin-pop-2 { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 100%{opacity:0;transform:translate(22px,-66px)  scale(.5)} }
  @keyframes coin-pop-3 { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 100%{opacity:0;transform:translate(-8px,-72px)  scale(.6)} }
  @keyframes coin-pop-4 { 0%{opacity:1;transform:translate(0,0) scale(1.1)} 100%{opacity:0;transform:translate(36px,-52px)  scale(.4)} }
  .coin-burst{ position:absolute;pointer-events:none;font-size:20px;z-index:9999; }
  .coin-burst-1{ animation:coin-pop-1 1.2s ease-out forwards }
  .coin-burst-2{ animation:coin-pop-2 1.3s ease-out forwards }
  .coin-burst-3{ animation:coin-pop-3 1.4s ease-out .1s forwards }
  .coin-burst-4{ animation:coin-pop-4 1.1s ease-out .05s forwards }

  /* ── CSS worker silhouette animations ───────────────────────────────── */
  @keyframes worker-leg-l {
    0%,100% { transform:rotate(0deg); }
    25%     { transform:rotate(26deg); }
    75%     { transform:rotate(-26deg); }
  }
  @keyframes worker-leg-r {
    0%,100% { transform:rotate(0deg); }
    25%     { transform:rotate(-26deg); }
    75%     { transform:rotate(26deg); }
  }
  @keyframes worker-arm-walk-l {
    0%,100% { transform:rotate(0deg); }
    25%     { transform:rotate(-30deg); }
    75%     { transform:rotate(30deg); }
  }
  @keyframes worker-arm-walk-r {
    0%,100% { transform:rotate(0deg); }
    25%     { transform:rotate(30deg); }
    75%     { transform:rotate(-30deg); }
  }
  @keyframes worker-arm-type-l {
    0%,100% { transform:rotate(0deg) translateY(0); }
    45%     { transform:rotate(-22deg) translateY(-2px); }
  }
  @keyframes worker-arm-type-r {
    0%,100% { transform:rotate(0deg) translateY(0); }
    45%     { transform:rotate(22deg) translateY(-2px); }
  }
  @keyframes worker-head-work {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-1.5px); }
  }
  @keyframes worker-head-sleep {
    0%,100% { transform:rotate(0deg) translateY(0); }
    50%     { transform:rotate(-18deg) translateY(2px); }
  }
  @keyframes worker-arrive {
    0%   { transform:scale(1); }
    40%  { transform:scale(1.12); }
    70%  { transform:scale(0.95); }
    100% { transform:scale(1); }
  }

  /* ── Visual milestone tier animations ───────────────────────────────── */
  @keyframes tier3-pulse {
    0%,100% { filter:brightness(1) saturate(1); }
    50%     { filter:brightness(1.06) saturate(1.2); }
  }
  @keyframes tier3-head-glow {
    0%,100% { box-shadow:0 0 8px currentColor, 0 0 18px currentColor; }
    50%     { box-shadow:0 0 16px currentColor, 0 0 36px currentColor, 0 0 60px currentColor; }
  }
  @keyframes tier2-head-glow {
    0%,100% { box-shadow:0 0 4px currentColor; }
    50%     { box-shadow:0 0 10px currentColor, 0 0 20px currentColor; }
  }
  .tier-3-floor { animation:tier3-pulse 1.8s ease-in-out infinite; }

  /* ── Offline modal entrance ─────────────────────────────────────────── */
  @keyframes offline-pop {
    0%   { opacity:0; transform:scale(.85) translateY(24px); }
    65%  { transform:scale(1.04) translateY(-4px); }
    100% { opacity:1; transform:scale(1) translateY(0); }
  }
  @keyframes offline-coins {
    0%,100% { transform:scale(1) rotate(-4deg); }
    50%     { transform:scale(1.18) rotate(6deg); }
  }

  /* ── Prime Refactor button pulse (active when tokens available) ───────── */
  @keyframes refactor-pulse {
    0%,100% { box-shadow: 0 0 10px rgba(168,85,247,.45), 0 0 20px rgba(168,85,247,.2); }
    50%     { box-shadow: 0 0 22px rgba(168,85,247,.95), 0 0 44px rgba(168,85,247,.5), 0 0 66px rgba(168,85,247,.2); }
  }
  .refactor-btn-active { animation: refactor-pulse 1.6s ease-in-out infinite; }

  /* ── Prime Refactor screen-flash ──────────────────────────────────────── */
  @keyframes prime-flash {
    0%   { opacity: 0; }
    8%   { opacity: 1; }
    55%  { opacity: 0.85; }
    100% { opacity: 0; }
  }
  @keyframes prime-token-pop {
    0%   { transform: scale(0.3) rotate(-12deg); opacity: 0; }
    55%  { transform: scale(1.18) rotate(4deg);  opacity: 1; }
    80%  { transform: scale(0.95) rotate(-2deg); }
    100% { transform: scale(1) rotate(0deg);     opacity: 1; }
  }

  /* ── Cyberpunk environment props ────────────────────────────────────── */
  @keyframes sprite-bob {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-3px); }
  }
  @keyframes monitor-flicker {
    0%,87%,93%,100% { opacity:1; }
    90% { opacity:.72; }
  }
  @keyframes led-pulse {
    0%,100% { box-shadow:0 0 4px #00d4ff, 0 0 8px rgba(0,212,255,.35); }
    50%     { box-shadow:0 0 10px #00d4ff, 0 0 22px rgba(0,212,255,.75), 0 0 40px rgba(0,212,255,.2); }
  }
  @keyframes shaft-scroll {
    0%   { background-position: 0 0; }
    100% { background-position: 0 32px; }
  }
  @keyframes data-drive-glow {
    0%,100% { box-shadow: 0 0 3px currentColor; opacity:.85; }
    50%     { box-shadow: 0 0 9px currentColor, 0 0 18px currentColor; opacity:1; }
  }
  @keyframes visor-shine {
    0%,100% { opacity:.55; }
    50%     { opacity:.9; }
  }

  /* ── Traffic Jam warning pulse ──────────────────────────────────────── */
  @keyframes traffic-jam-pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%     { opacity:.65; transform:scale(1.06); }
  }
  .traffic-jam { animation:traffic-jam-pulse 0.7s ease-in-out infinite; }

  /* ── Tiered Visual Evolution ─────────────────────────────────────────── */
  /* Tier 3 — CyberHub: animated neon border glow */
  @keyframes cyberhub-border {
    0%,100% { border-color:#00ffcc; box-shadow:inset 4px 0 18px rgba(0,255,204,.22), 0 0 18px rgba(0,255,204,.18); }
    33%     { border-color:#ff00ff; box-shadow:inset 4px 0 18px rgba(255,0,255,.22), 0 0 18px rgba(255,0,255,.18); }
    66%     { border-color:#00cfff; box-shadow:inset 4px 0 18px rgba(0,207,255,.22), 0 0 18px rgba(0,207,255,.18); }
  }
  .env-cyberhub { animation:cyberhub-border 2.4s ease-in-out infinite; }

  /* Tier-unlock notification banner entrance */
  @keyframes tier-unlock-in {
    0%   { opacity:0; transform:translateY(-28px) scale(.88); }
    60%  { transform:translateY(4px) scale(1.04); }
    100% { opacity:1; transform:translateY(0) scale(1); }
  }
  .tier-unlock-banner { animation:tier-unlock-in 0.55s cubic-bezier(.22,1,.36,1) forwards; }
`

// ═════════════════════════════════════════════════════════════════════════════
// AnimatedWorker — image-driven worker with 4-phase walking state machine
//   AT_DESK      → coder-active.gif (typing at desk)
//   WALK_OUT     → courier-running.gif, facing left  (toward elevator)
//   AT_DROP      → coder-idle.png, at drop-off zone
//   WALK_BACK    → courier-running.gif, facing right (returning)
//   locked=true  → coder-idle.png with dimmed filter
// Falls back to CSS shapes when image assets have not been added yet.
// ═════════════════════════════════════════════════════════════════════════════
function AnimatedWorker({ color, workerIndex = 0, locked = false, isMobile = false, tier = 1, managerHired = true, onWorkerClick, envTier = 0 }) {
  const [phase, setPhase] = useState('AT_DESK')
  const [imgError, setImgError] = useState(false)
  // Track whether we've completed our first loop (used when managerHired=false)
  const [loopDone, setLoopDone] = useState(false)
  // WORKER_WALK_MS is a module-level constant so this dep can be safely omitted

  // Base size units (px) — tier 3 workers are slightly larger
  const s   = isMobile ? 13 : (tier === 3 ? 26 : tier === 2 ? 24 : 22)
  const off = isMobile ? 170 : 600   // full walk to elevator shaft entrance

  // Tier-based animation speed multiplier: higher tier → faster typing/walking
  const speedMult = tier === 3 ? 0.62 : tier === 2 ? 0.80 : 1.0

  useEffect(() => {
    if (locked) { setPhase('AT_DESK'); return }
    let t1, t2, t3, interval
    const cycleMs = 3600 + workerIndex * 1300

    const doTrip = (repeat = true) => {
      setPhase('WALK_OUT')
      t1 = setTimeout(() => {
        setPhase('AT_DROP')
        t2 = setTimeout(() => {
          setPhase('WALK_BACK')
          t3 = setTimeout(() => {
            setPhase('AT_DESK')
            setLoopDone(true)
            // Without a floor manager: stop after one loop — wait for click
            if (!managerHired && !repeat) clearInterval(interval)
          }, WORKER_WALK_MS)
        }, 400)
      }, WORKER_WALK_MS)
    }

    setLoopDone(false)

    // Stagger each worker's start by workerIndex * 1400 ms
    const init = setTimeout(() => {
      doTrip(managerHired)
      if (managerHired) {
        interval = setInterval(() => doTrip(true), cycleMs)
      }
    }, workerIndex * 1400)

    return () => {
      clearTimeout(init); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      clearInterval(interval)
    }
  }, [locked, workerIndex, managerHired])  // WORKER_WALK_MS is a module-level constant, not a dep

  const isWalking  = phase === 'WALK_OUT' || phase === 'WALK_BACK'
  const atDropZone = phase === 'WALK_OUT' || phase === 'AT_DROP'
  const facingLeft = atDropZone
  const translateX = atDropZone ? -off : 0

  // RC data-packet badge carried while walking to elevator (shared by both render paths)
  const rcPacket = atDropZone ? (
    <div style={{
      position:'absolute', top: isMobile ? -8 : -14, left:'50%',
      transform:`translateX(calc(-50% + ${translateX}px))`,
      transition:`transform ${WORKER_WALK_MS}ms linear`,
      width: isMobile ? 10 : 16, height: isMobile ? 6 : 10,
      background:`linear-gradient(135deg,${color},${color}99)`,
      borderRadius:3, boxShadow:`0 0 6px ${color}`,
      zIndex:3, pointerEvents:'none',
    }} />
  ) : null

  // ── Sprite rendering ──────────────────────────────────────────────────────
  if (!imgError) {
    // State-driven sprite: coder for desk work, courier for transit
    const src = isWalking ? IMG.courier : IMG.coder
    // Facing: sprites default face right. Flip when moving toward drop-off (left).
    const scaleX = facingLeft ? -1 : 1
    // Locked/sleeping: greyscale silhouette; all active tiers get per-floor color glow
    // envTier hue-rotate: tint sprites to match floor environment (Garage=0°, Startup=30°, Corporate=180°, CyberHub=270°)
    const hueRotateDeg = locked ? 0 : FLOOR_TIER_CONFIG[envTier]?.hueRotate ?? 0
    const hueFilter    = hueRotateDeg > 0 ? ` hue-rotate(${hueRotateDeg}deg)` : ''
    const imgFilter = locked
      ? 'grayscale(100%) brightness(30%)'
      : tier === 3
        ? `drop-shadow(0 0 6px ${color}) brightness(1.08) saturate(1.1)${hueFilter}`
        : tier === 2
          ? `drop-shadow(0 0 4px ${color}) brightness(1.04)${hueFilter}`
          : hueFilter ? `drop-shadow(0 0 3px ${color}) ${hueFilter}` : `drop-shadow(0 0 3px ${color})`

    return (
      <div
        style={{ display:'flex', flexDirection:'column', alignItems:'center', position:'relative', flexShrink:0, cursor: !locked && !managerHired && phase === 'AT_DESK' ? 'pointer' : 'default' }}
        onClick={() => {
          if (!locked && !managerHired && phase === 'AT_DESK' && loopDone) {
            setLoopDone(false)
            setPhase('WALK_OUT')
            setTimeout(() => {
              setPhase('AT_DROP')
              setTimeout(() => {
                setPhase('WALK_BACK')
                setTimeout(() => { setPhase('AT_DESK'); setLoopDone(true) }, WORKER_WALK_MS)
              }, 400)
            }, WORKER_WALK_MS)
            onWorkerClick?.()
          }
        }}
      >
        {/* zzz bubbles for locked workers */}
        {locked && ['z','z','Z'].map((z, zi) => (
          <span key={zi} style={{
            position:'absolute', top:-6 - zi*10, right: -4 + zi*4,
            fontSize:8+zi*2, color:'#94a3b8', fontWeight:700,
            animation:`zzz-${['a','b','c'][zi]} ${1.8+zi*0.4}s ease-in-out ${zi*0.65}s infinite`,
            pointerEvents:'none', zIndex:2,
          }}>{z}</span>
        ))}

        {/* "Click to work" prompt when unmanaged worker is idle after first trip */}
        {!locked && !managerHired && phase === 'AT_DESK' && loopDone && (
          <div style={{ position:'absolute', bottom: isMobile ? -14 : -18, left:'50%', transform:'translateX(-50%)', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 6 : 8, color:'#fbbf24', whiteSpace:'nowrap', letterSpacing:'.5px', pointerEvents:'none' }}>▶ CLICK</div>
        )}

        {/* RC data packet carried while walking to elevator */}
        {rcPacket}

        <img
          src={src}
          alt=""
          draggable={false}
          onError={() => setImgError(true)}
          style={{
            height: isMobile ? 48 : 80,
            maxHeight: 80,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            transform: `translateX(${translateX}px) scaleX(${scaleX})`,
            transition: isWalking ? `transform ${WORKER_WALK_MS}ms linear` : 'transform 0.12s ease-out',
            filter: imgFilter,
            willChange: 'transform',
          }}
        />
      </div>
    )
  }

  // ── CSS fallback — cyberpunk hacker silhouette ───────────────────────────
  const c  = locked ? '#475569' : color
  const op = locked ? 0.40 : 1

  // Proportional body dimensions
  const hw = Math.round(s * 0.70)   // helmet diameter
  const bw = Math.round(s * 0.96)   // torso width (slightly wider — armor)
  const bh = Math.round(s * 0.70)   // torso height
  const aw = Math.round(s * 0.28)   // arm width
  const ah = Math.round(s * 0.60)   // arm height
  const lw = Math.round(s * 0.32)   // leg width
  const lh = Math.round(s * 0.80)   // leg height
  const lg = Math.round(s * 0.14)   // gap between legs

  // Visor color: always the floor's neon accent
  const visorC = locked ? '#334155' : color

  return (
    <div
      style={{ display:'flex', flexDirection:'column', alignItems:'center', position:'relative', flexShrink:0, cursor: !locked && !managerHired && phase === 'AT_DESK' ? 'pointer' : 'default' }}
      onClick={() => {
        if (!locked && !managerHired && phase === 'AT_DESK' && loopDone) {
          setLoopDone(false)
          setPhase('WALK_OUT')
          setTimeout(() => {
            setPhase('AT_DROP')
            setTimeout(() => {
              setPhase('WALK_BACK')
              setTimeout(() => { setPhase('AT_DESK'); setLoopDone(true) }, WORKER_WALK_MS)
            }, 400)
          }, WORKER_WALK_MS)
          onWorkerClick?.()
        }
      }}
    >

      {/* zzz bubbles stay outside the walking transform */}
      {locked && ['z','z','Z'].map((z, zi) => (
        <span key={zi} style={{
          position:'absolute', top:-6 - zi*10, left: hw*0.4 + zi*4,
          fontSize:8+zi*2, color:'#94a3b8', fontWeight:700,
          animation:`zzz-${['a','b','c'][zi]} ${1.8+zi*0.4}s ease-in-out ${zi*0.65}s infinite`,
          pointerEvents:'none', zIndex:2,
        }}>{z}</span>
      ))}

      {/* "Click to work" prompt when unmanaged worker is idle after first trip */}
      {!locked && !managerHired && phase === 'AT_DESK' && loopDone && (
        <div style={{ position:'absolute', bottom: isMobile ? -14 : -18, left:'50%', transform:'translateX(-50%)', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 6 : 8, color:'#fbbf24', whiteSpace:'nowrap', letterSpacing:'.5px', pointerEvents:'none' }}>▶ CLICK</div>
      )}

      {/* RC data packet carried while walking to elevator */}
      {rcPacket}

      {/* Body wrapper — translateX + scaleX handles the walk */}
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center',
        transform:`translateX(${translateX}px) scaleX(${facingLeft ? -1 : 1})`,
        transition: isWalking ? `transform ${WORKER_WALK_MS}ms linear` : 'transform 0.12s ease-out',
        willChange:'transform',
      }}>
        {/* Helmet */}
        <div style={{
          position:'relative', width:hw, height:hw, borderRadius:'50%',
          background: locked
            ? `radial-gradient(circle at 38% 38%, #475569, #1e293b)`
            : `radial-gradient(circle at 38% 38%, ${c}cc, ${c}55)`,
          border: `1px solid ${locked ? '#334155' : c}`,
          opacity: op, flexShrink:0,
          color: c,
          boxShadow: !locked && tier >= 2 ? `0 0 8px ${c}88` : 'none',
          animation: !locked && !isWalking
            ? `worker-head-work ${(0.88 * speedMult).toFixed(2)}s ease-in-out infinite${tier === 3 ? ', tier3-head-glow 1.5s ease-in-out infinite' : tier === 2 ? ', tier2-head-glow 2.2s ease-in-out infinite' : ''}`
            : locked ? 'worker-head-sleep 2.4s ease-in-out infinite' : 'none',
        }}>
          {/* Visor — glowing horizontal bar across the helmet */}
          <div style={{
            position:'absolute',
            top: '42%', left:'12%', right:'12%',
            height: Math.max(2, Math.round(hw * 0.18)),
            borderRadius: 2,
            background: locked ? '#1e293b' : `linear-gradient(90deg, transparent, ${visorC}cc, ${visorC}, ${visorC}cc, transparent)`,
            boxShadow: !locked ? `0 0 6px ${visorC}` : 'none',
            animation: !locked ? 'visor-shine 2.2s ease-in-out infinite' : 'none',
          }} />
        </div>

        {/* Neck */}
        <div style={{ width: Math.round(hw * 0.28), height: Math.round(s * 0.08), background: locked ? '#334155' : c, opacity: op * 0.7 }} />

        {/* Torso + arms */}
        <div style={{ position:'relative' }}>
          {/* Left arm */}
          <div style={{
            position:'absolute', top:2, left:-aw-1, width:aw, height:ah,
            borderRadius: `${aw/2}px ${aw/2}px ${aw/3}px ${aw/3}px`,
            background: locked ? '#334155' : `linear-gradient(180deg, ${c}cc, ${c}66)`,
            border: !locked ? `1px solid ${c}55` : 'none',
            opacity: op * 0.88, transformOrigin:'top center',
            animation: isWalking ? `worker-arm-walk-l ${(0.46*speedMult).toFixed(2)}s ease-in-out infinite`
                     : !locked   ? `worker-arm-type-l ${(0.78*speedMult).toFixed(2)}s ease-in-out infinite` : 'none',
          }} />
          {/* Right arm */}
          <div style={{
            position:'absolute', top:2, right:-aw-1, width:aw, height:ah,
            borderRadius: `${aw/2}px ${aw/2}px ${aw/3}px ${aw/3}px`,
            background: locked ? '#334155' : `linear-gradient(180deg, ${c}cc, ${c}66)`,
            border: !locked ? `1px solid ${c}55` : 'none',
            opacity: op * 0.88, transformOrigin:'top center',
            animation: isWalking ? `worker-arm-walk-r ${(0.46*speedMult).toFixed(2)}s ease-in-out infinite 0.23s`
                     : !locked   ? `worker-arm-type-r ${(0.78*speedMult).toFixed(2)}s ease-in-out infinite 0.39s` : 'none',
          }} />
          {/* Torso — armor plating */}
          <div style={{
            width:bw, height:bh, opacity: op * 0.92, position:'relative', overflow:'hidden',
            borderRadius: '3px 3px 1px 1px',
            background: locked
              ? 'linear-gradient(180deg,#1e293b,#0f172a)'
              : `linear-gradient(180deg, ${c}bb 0%, ${c}44 100%)`,
            border: !locked ? `1px solid ${c}66` : '1px solid #334155',
            boxShadow: !locked && tier >= 2 ? `inset 0 0 6px ${c}33` : 'none',
          }}>
            {/* Chest accent stripe */}
            {!locked && (
              <div style={{
                position:'absolute', top:'35%', left:'15%', right:'15%', height:1,
                background: `${c}99`,
                boxShadow: `0 0 4px ${c}`,
              }} />
            )}
          </div>
        </div>

        {/* Legs */}
        <div style={{ display:'flex', gap:lg, marginTop:1 }}>
          <div style={{
            width:lw, height:lh,
            borderRadius:`2px 2px ${lw/2}px ${lw/2}px`,
            background: locked ? '#1e293b' : `linear-gradient(180deg,${c}88,${c}44)`,
            border: !locked ? `1px solid ${c}44` : 'none',
            opacity: op * 0.85, transformOrigin:'top center',
            animation: isWalking ? `worker-leg-l ${(0.46*speedMult).toFixed(2)}s ease-in-out infinite` : 'none',
          }} />
          <div style={{
            width:lw, height:lh,
            borderRadius:`2px 2px ${lw/2}px ${lw/2}px`,
            background: locked ? '#1e293b' : `linear-gradient(180deg,${c}88,${c}44)`,
            border: !locked ? `1px solid ${c}44` : 'none',
            opacity: op * 0.85, transformOrigin:'top center',
            animation: isWalking ? `worker-leg-r ${(0.46*speedMult).toFixed(2)}s ease-in-out infinite 0.23s` : 'none',
          }} />
        </div>
      </div>
    </div>
  )
}

// ─── ManagerPortrait — sprite-based portrait slot ────────────────────────────
// Hired:     full-color sprite with neon drop-shadow glow
// Not-hired: same sprite but greyscale + very dark (silhouette)
// Falls back to CSS circles when the image hasn't been added yet.
function ManagerPortrait({ hired, color, size = 40 }) {
  const [imgError, setImgError] = useState(false)
  const s = size
  if (!imgError) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
        <img
          src={IMG.manager}
          alt=""
          draggable={false}
          onError={() => setImgError(true)}
          style={{
            height: Math.round(s * 0.88),
            width: 'auto',
            display: 'block',
            filter: hired
              ? `drop-shadow(0 0 6px ${color}cc) brightness(1.05)`
              : 'grayscale(100%) brightness(30%)',
            transition: 'filter 0.35s',
          }}
        />
      </div>
    )
  }
  // CSS fallback
  const c = hired ? color : '#94a3b8'
  return (
    <div style={{ width: Math.round(s*0.56), display:'flex', flexDirection:'column', alignItems:'center', gap: Math.round(s*0.04), opacity: hired ? 1 : 0.45 }}>
      <div style={{ width: Math.round(s*0.30), height: Math.round(s*0.30), borderRadius:'50%', background:c, flexShrink:0, boxShadow: hired ? `0 0 6px ${color}80` : 'none' }} />
      <div style={{ width: Math.round(s*0.42), height: Math.round(s*0.24), borderRadius:`${Math.round(s*0.05)}px ${Math.round(s*0.05)}px 2px 2px`, background:c, opacity:.9 }} />
    </div>
  )
}

// ─── SalesWorker — courier walks left to pick up RC, right to deposit at vault ─
// Uses courier-running.gif with scaleX(-1) flip so the sprite always faces the
// direction of travel. Falls back to CSS shapes when asset is missing.
function SalesWorker({ compilerState, isMobile }) {
  const [pos, setPos] = useState('AT_VAULT')
  const [imgError, setImgError] = useState(false)
  const walkDist = isMobile ? 56 : 158
  const color = '#22c55e'

  useEffect(() => {
    let t1, t2
    if (compilerState === 'FETCHING') {
      setPos('WALK_LEFT')
      t1 = setTimeout(() => setPos('AT_DROPOFF'), Math.round(COMPILER_FETCH_MS * 0.55))
    } else if (compilerState === 'PROCESSING') {
      setPos('WALK_RIGHT')
      t2 = setTimeout(() => setPos('AT_VAULT'), WORKER_WALK_MS)
    } else {
      setPos('AT_VAULT')
    }
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [compilerState])

  const isWalking  = pos === 'WALK_LEFT' || pos === 'WALK_RIGHT'
  const atDrop     = pos === 'AT_DROPOFF' || pos === 'WALK_LEFT'
  const translateX = atDrop ? -walkDist : 0
  // Walking left → face left (default); walking right → flip to face right
  const scaleX     = pos === 'WALK_RIGHT' ? -1 : 1

  // ── Sprite rendering ──────────────────────────────────────────────────────
  if (!imgError) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
        <img
          src={IMG.courier}
          alt=""
          draggable={false}
          onError={() => setImgError(true)}
          style={{
            height: isMobile ? 48 : 80,
            maxHeight: 80,
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            transform: `translateX(${translateX}px) scaleX(${scaleX})`,
            transition: isWalking ? `transform ${WORKER_WALK_MS}ms linear` : 'transform 0.1s ease-out',
            filter: compilerState !== 'IDLE'
              ? `drop-shadow(0 0 8px ${color}cc) brightness(1.08)`
              : 'grayscale(60%) brightness(50%)',
            animation: isWalking ? 'sprite-bob 0.32s ease-in-out infinite' : 'none',
            willChange: 'transform',
          }}
        />
        {/* Data packet shown while carrying RC back to vault */}
        {pos === 'WALK_RIGHT' && (
          <div style={{ marginTop:-4, width: isMobile?8:12, height: isMobile?5:8, background:color, borderRadius:2, boxShadow:`0 0 6px ${color}99` }} />
        )}
      </div>
    )
  }

  // ── CSS fallback ──────────────────────────────────────────────────────────
  const s  = isMobile ? 13 : 20
  const hw = Math.round(s*0.68), bw = Math.round(s*0.88), bh = Math.round(s*0.72)
  const aw = Math.round(s*0.27), ah = Math.round(s*0.62)
  const lw = Math.round(s*0.34), lh = Math.round(s*0.82), lg = Math.round(s*0.12)
  const facingLeft = atDrop

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
      <div style={{
        display:'flex', flexDirection:'column', alignItems:'center',
        transform:`translateX(${translateX}px) scaleX(${facingLeft ? -1 : 1})`,
        transition: isWalking ? `transform ${WORKER_WALK_MS}ms linear` : 'transform 0.1s ease-out',
        willChange:'transform',
      }}>
        <div style={{ width:hw, height:hw, borderRadius:'50%', background:color, flexShrink:0, boxShadow: compilerState !== 'IDLE' ? `0 0 8px ${color}` : 'none' }} />
        <div style={{ position:'relative', marginTop:1 }}>
          <div style={{ position:'absolute', top:2, left:-aw-2, width:aw, height:ah, borderRadius:aw/2, background:color, opacity:.82, transformOrigin:'top center',
            animation: isWalking ? 'worker-arm-walk-l 0.44s ease-in-out infinite' : compilerState === 'PROCESSING' ? 'worker-arm-type-l 0.72s ease-in-out infinite' : 'none' }} />
          <div style={{ position:'absolute', top:2, right:-aw-2, width:aw, height:ah, borderRadius:aw/2, background:color, opacity:.82, transformOrigin:'top center',
            animation: isWalking ? 'worker-arm-walk-r 0.44s ease-in-out infinite 0.22s' : compilerState === 'PROCESSING' ? 'worker-arm-type-r 0.72s ease-in-out infinite 0.36s' : 'none' }} />
          <div style={{ width:bw, height:bh, borderRadius:'3px 3px 2px 2px', background:color, opacity:.9 }} />
        </div>
        <div style={{ display:'flex', gap:lg, marginTop:1 }}>
          <div style={{ width:lw, height:lh, borderRadius:`0 0 ${lw/2}px ${lw/2}px`, background:color, opacity:.82, transformOrigin:'top center',
            animation: isWalking ? 'worker-leg-l 0.44s ease-in-out infinite' : 'none' }} />
          <div style={{ width:lw, height:lh, borderRadius:`0 0 ${lw/2}px ${lw/2}px`, background:color, opacity:.82, transformOrigin:'top center',
            animation: isWalking ? 'worker-leg-r 0.44s ease-in-out infinite 0.22s' : 'none' }} />
        </div>
      </div>
      {/* Data packet shown while carrying RC back to vault */}
      {pos === 'WALK_RIGHT' && (
        <div style={{ marginTop:-4, width: isMobile?8:12, height: isMobile?5:8, background:color, borderRadius:2, boxShadow:`0 0 6px ${color}99` }} />
      )}
    </div>
  )
}

// ─── DataPile — glowing neon data-drive stack for buffer/drop-off zones ───────
// Renders 1–4 stacked drive slabs that scale with fill-ratio.
// count: 0 (empty) → 1 (low) → 2 (quarter) → 3 (half) → 4 (near-full)
function DataPile({ amount, cap, color, isMobile }) {
  const ratio  = cap > 0 ? amount / cap : 0
  const count  = amount <= 0 ? 0 : ratio < 0.20 ? 1 : ratio < 0.50 ? 2 : ratio < 0.80 ? 3 : 4
  if (count === 0) return null
  const w = isMobile ? 14 : 20
  const h = isMobile ?  3 :  5
  return (
    <div style={{ display:'flex', flexDirection:'column-reverse', alignItems:'center', gap:1 }}>
      {Array.from({ length: count }).map((_, bi) => (
        <div key={bi} style={{
          width: w - bi,
          height: h,
          borderRadius: 2,
          background: `linear-gradient(90deg,${color}ee,${color}66)`,
          border: `1px solid ${color}88`,
          color: color,
          animation: `data-drive-glow ${1.5 + bi * 0.4}s ease-in-out ${bi * 0.25}s infinite`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Top highlight edge */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`${color}cc` }} />
        </div>
      ))}
    </div>
  )
}

// ─── Workstation — cyberpunk console desk wrapping an AnimatedWorker ──────────
// Renders: glowing monitor → neck → worker → desk surface.
// The worker's walk animation slides out from the desk, so we set position:relative
// on the worker wrapper and let translateX move only the character.
function Workstation({ def, locked, isMobile, children }) {
  const c    = locked ? '#1e3a5f' : def.color
  const monW = isMobile ? 30 : 50
  const monH = isMobile ? 18 : 30
  const deskW = isMobile ? 52 : 88
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
      {/* Neon monitor */}
      <div style={{
        width: monW, height: monH,
        background: locked ? '#080d18' : 'linear-gradient(160deg,#06101e,#0a1a38)',
        border: `2px solid ${c}`,
        borderRadius: '4px 4px 2px 2px',
        boxShadow: locked ? 'none' : `0 0 10px ${c}55, inset 0 0 8px ${c}18`,
        position: 'relative', overflow: 'hidden',
        opacity: locked ? 0.30 : 1,
        transition: 'opacity 0.45s, box-shadow 0.45s',
        animation: !locked ? 'monitor-flicker 5.5s ease-in-out infinite' : 'none',
        marginBottom: 1,
        flexShrink: 0,
      }}>
        {/* Scanlines */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.22) 2px,rgba(0,0,0,.22) 3px)',
          zIndex:1,
        }} />
        {/* Screen glow blob */}
        {!locked && <div style={{ position:'absolute', inset:0, background:`radial-gradient(ellipse at 50% 40%,${c}28 0%,transparent 70%)`, zIndex:0 }} />}
        {/* Status LED */}
        {!locked && (
          <div style={{
            position:'absolute', top:3, right:3, zIndex:2,
            width:4, height:4, borderRadius:'50%', background:'#00d4ff',
            animation:'led-pulse 2.0s ease-in-out infinite',
          }} />
        )}
      </div>
      {/* Monitor stand */}
      <div style={{ width: isMobile ? 3 : 5, height: isMobile ? 2 : 4, background: locked ? '#1e293b' : '#334155', flexShrink:0 }} />
      {/* Worker — position:relative so the walk translateX doesn't overflow desk */}
      <div style={{ position:'relative', overflow:'visible' }}>{children}</div>
      {/* Desk console surface */}
      <div style={{
        width: deskW, height: isMobile ? 4 : 6,
        borderRadius: 2,
        background: locked
          ? 'linear-gradient(90deg,#0d1117,#1a2030,#0d1117)'
          : `linear-gradient(90deg,#06101e,${c}55,#06101e)`,
        border: `1px solid ${locked ? '#1e293b' : c + '55'}`,
        boxShadow: locked ? 'none' : `0 0 8px ${c}33`,
        marginTop: 1, flexShrink: 0,
        opacity: locked ? 0.35 : 1,
        transition: 'opacity 0.45s',
        position:'relative', overflow:'hidden',
      }}>
        {/* Desk edge neon line */}
        {!locked && <div style={{ position:'absolute', top:0, left:'15%', right:'15%', height:1, background:`${c}99`, boxShadow:`0 0 4px ${c}` }} />}
      </div>
    </div>
  )
}

// ─── Offline Earnings Calculator ─────────────────────────────────────────────
// Effective $/s = min(totalRCPS, busCapacity×busSpeed) × compilerConvRate
// Capped at 8 hours of offline time.
function calculateOfflineProgress(savedData) {
  if (!savedData?.lastSavedTimestamp) return { earned: 0, seconds: 0 }
  const seconds = Math.min((Date.now() - savedData.lastSavedTimestamp) / 1000, 8 * 3600)
  if (seconds < 60) return { earned: 0, seconds: 0 }   // skip trivial gaps

  const floorStates = savedData.floors ?? []
  const totalRCPS = floorStates.reduce(
    (s, fs, i) => s + (FLOORS[i] ? floorRCPS(FLOORS[i], fs.level ?? 0) * floorTierMult(i) : 0), 0
  )
  const bus = savedData.bus ?? {}
  const compiler = savedData.compiler ?? {}
  const effectiveRCPS = Math.min(totalRCPS, (bus.capacity ?? 30) * (bus.speed ?? 0.5))
  const dollarsPerSec = effectiveRCPS * (compiler.convRate ?? 2)
  return { earned: r2(dollarsPerSec * seconds), seconds: Math.round(seconds) }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function GamePlayerPage({ onAnalogyMilestone, sessionId, onExit }) {
  const phaserContainerRef = useRef(null)
  const gameRef            = useRef(null)

  useEffect(() => {
    syncPendingMilestones()
    console.log('Architecture: Logistics & Prestige Systems Online')
    console.log('MathScript Tycoon: Tiered Evolution Systems Active')
  }, [])

  // ── Offline Earnings: compute on first mount from saved timestamp ──────────
  useEffect(() => {
    const saved = loadSave()
    if (!saved) return
    const { earned, seconds } = calculateOfflineProgress(saved)
    if (earned <= 0) return
    // Credit earnings immediately then show the modal
    setCoins(c => r2(c + earned))
    setLifetime(l => r2(l + earned))
    setOfflineModal({ earned, seconds })
  }, [])  // intentionally run once on mount only

  // ── Analogy overlay ────────────────────────────────────────────────────────
  const [overlayConceptId, setOverlayConceptId] = useState(null)
  const [overlayVisible,   setOverlayVisible]   = useState(false)

  // ── Screen ─────────────────────────────────────────────────────────────────
  const [screen,   setScreen]   = useState('title')
  // The game container is always constrained to max-width 500px, so mobile
  // sizing is always used regardless of the browser window width.
  const isMobile = true
  // Derived layout constants — scale down on small screens
  const shaftW = isMobile ? 72 : 250

  // ── Economy state ──────────────────────────────────────────────────────────
  const init = hydrate(loadSave())

  const [coins,            setCoins]            = useState(init.coins)
  const [lifetime,         setLifetime]         = useState(init.lifetime)
  // Phase 1 buffers
  const [productionBuffer, setProductionBuffer] = useState(init.productionBuffer)
  const [prodCap,          setProdCap]          = useState(init.prodCap)
  const [compilerBuffer,   setCompilerBuffer]   = useState(init.compilerBuffer)
  const [floors,           setFloors]           = useState(init.floors)
  const [bus,              setBus]              = useState(init.bus)
  const [compiler,         setCompiler]         = useState(init.compiler)
  const [auto,             setAuto]             = useState(init.auto)
  const [managers,         setManagers]         = useState(init.managers)
  const [primeTokens,      setPrimeTokens]      = useState(init.primeTokens)

  // ── Per-floor visual progress bars (0–100, purely cosmetic) ───────────────
  const [floorProgress, setFloorProgress] = useState(() => Array(FLOORS.length).fill(0))

  // ── Phase 2: Data Bus state machine ───────────────────────────────────────
  // States: IDLE | TRAVELING_TO_PROD | LOADING | TRAVELING_TO_COMPILER
  const [busState,   setBusState]   = useState('IDLE')
  const [busPayload, setBusPayload] = useState(0)

  // ── Phase 3: Compiler state machine ───────────────────────────────────────
  // States: IDLE | FETCHING | PROCESSING
  const [compilerState,   setCompilerState]   = useState('IDLE')
  const [compileProgress, setCompileProgress] = useState(0)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [floats,            setFloats]            = useState([])
  const [popupIdx,          setPopupIdx]          = useState(null)
  const [buyQty,            setBuyQty]            = useState('1')
  const [floorScroll,       setFloorScroll]       = useState(0)
  const [busPopupOpen,      setBusPopupOpen]      = useState(false)
  const [compilerPopupOpen, setCompilerPopupOpen] = useState(false)
  const [offlineModal,      setOfflineModal]      = useState(null)  // { earned, seconds }
  const [managerModal,      setManagerModal]      = useState(null)  // { type, floorIdx?, def?, cost }
  const [primeRefactorModal,  setPrimeRefactorModal]  = useState(false)
  const [primeFlash,          setPrimeFlash]          = useState(false)
  const [refactorProcessing,  setRefactorProcessing]  = useState(false)
  const [tierNotif,          setTierNotif]          = useState(null)  // { tierIdx, label } — tier-unlock banner

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalRCPS = floors.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level) * floorTierMult(i), 0)

  // ── Pipeline Efficiency — compares production rate vs bus transfer capacity ──
  // busTransferCapacity: RC delivered per second (capacity per trip × trips/s)
  // isBottlenecked: production outpaces transfer → TRAFFIC JAM visual
  // isQueueOverflow: buffer has 10+ trips' worth queued → highlight bottleneck controls
  const busTransferCapacity = r2(bus.capacity * bus.speed)
  const { isBottlenecked, isQueueOverflow } = useMemo(() => ({
    isBottlenecked:  totalRCPS > 0 && busTransferCapacity > 0 && totalRCPS > busTransferCapacity,
    isQueueOverflow: productionBuffer > bus.capacity * 10,
  }), [totalRCPS, busTransferCapacity, productionBuffer, bus.capacity])

  // ── Stale-closure-safe refs ────────────────────────────────────────────────
  const productionBufferRef = useRef(productionBuffer)
  const compilerBufferRef   = useRef(compilerBuffer)
  const busPayloadRef       = useRef(busPayload)
  const busStateRef         = useRef(busState)
  const compilerStateRef    = useRef(compilerState)
  const busRef              = useRef(bus)
  const compilerRef         = useRef(compiler)
  const coinsRef            = useRef(coins)
  const floorsRef           = useRef(floors)
  const prodCapRef          = useRef(prodCap)
  const lifetimeRef         = useRef(lifetime)
  const autoRef             = useRef(auto)
  const managersRef         = useRef(managers)
  const primeTokensRef      = useRef(primeTokens)

  useEffect(() => { productionBufferRef.current = productionBuffer }, [productionBuffer])
  useEffect(() => { compilerBufferRef.current   = compilerBuffer   }, [compilerBuffer])
  useEffect(() => { busPayloadRef.current        = busPayload       }, [busPayload])
  useEffect(() => { busStateRef.current          = busState         }, [busState])
  useEffect(() => { compilerStateRef.current     = compilerState    }, [compilerState])
  useEffect(() => { busRef.current               = bus              }, [bus])
  useEffect(() => { compilerRef.current          = compiler         }, [compiler])
  useEffect(() => { coinsRef.current             = coins            }, [coins])
  useEffect(() => { floorsRef.current            = floors           }, [floors])
  useEffect(() => { prodCapRef.current           = prodCap          }, [prodCap])
  useEffect(() => { lifetimeRef.current          = lifetime         }, [lifetime])
  useEffect(() => { autoRef.current     = auto     }, [auto])
  useEffect(() => { managersRef.current = managers }, [managers])
  useEffect(() => { primeTokensRef.current = primeTokens }, [primeTokens])

  // ── Persistence (debounced 2 s) ────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          coins, lifetime, productionBuffer, prodCap, compilerBuffer,
          floors: floors.map(f => ({ level: f.level })), bus, compiler, auto,
          managers, primeTokens,
          lastSavedTimestamp: Date.now(),
        }))
      } catch {}
    }, 2000)
    return () => clearTimeout(id)
  }, [coins, lifetime, productionBuffer, prodCap, compilerBuffer, floors, bus, compiler, auto, managers, primeTokens])

  // ── Cloud save: helper to build the payload from current refs ─────────────
  // All values read from refs so the interval / beforeunload closures always
  // capture the latest state regardless of when they were registered.
  const buildSavePayload = useCallback(() => ({
    coins:            coinsRef.current,
    lifetime:         lifetimeRef.current,
    productionBuffer: productionBufferRef.current,
    prodCap:          prodCapRef.current,
    compilerBuffer:   compilerBufferRef.current,
    floors:           floorsRef.current.map(f => ({ level: f.level })),
    bus:              busRef.current,
    compiler:         compilerRef.current,
    auto:             autoRef.current,
    managers:         managersRef.current,
    primeTokens:      primeTokensRef.current,
  }), [])

  // ── Cloud save: 15 s background interval ──────────────────────────────────
  // Only runs when the player is on the play screen and a sessionId is present.
  // Any error (network, rate-limit, Cosmos down) is swallowed — the game never
  // surfaces a save error to the player; localStorage is the primary fallback.
  useEffect(() => {
    if (!sessionId || screen !== 'play') return
    const id = setInterval(() => {
      saveTycoonState(sessionId, buildSavePayload()).catch(() => {})
    }, CLOUD_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [sessionId, screen, buildSavePayload])

  // ── Cloud save: also fire on page unload (best-effort via sendBeacon) ──────
  useEffect(() => {
    if (!sessionId) return
    const handleUnload = () => {
      const payload = JSON.stringify({ session_id: sessionId, ...buildSavePayload() })
      try {
        navigator.sendBeacon?.('/api/tycoon/save', new Blob([payload], { type: 'application/json' }))
      } catch {}
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [sessionId, buildSavePayload])

  // ── Cloud restore: on first mount try to load from Cosmos if localStorage ──
  // is empty. This handles device-switches and server restarts cleanly.
  const hasRestoredFromCloud = useRef(false)
  useEffect(() => {
    if (!sessionId || hasRestoredFromCloud.current) return
    if (loadSave() !== null) {
      // localStorage already has a save — trust it (it's more recent)
      hasRestoredFromCloud.current = true
      return
    }
    hasRestoredFromCloud.current = true
    loadTycoonState(sessionId).then(state => {
      if (!state) return
      // Hydrate from server — same logic as hydrate() for localStorage
      try {
        const hydrated = hydrate(state)
        setCoins(hydrated.coins)
        setLifetime(hydrated.lifetime)
        setProductionBuffer(hydrated.productionBuffer)
        setProdCap(hydrated.prodCap)
        setCompilerBuffer(hydrated.compilerBuffer)
        setFloors(hydrated.floors)
        setBus(hydrated.bus)
        setCompiler(hydrated.compiler)
        setAuto(hydrated.auto)
        setManagers(hydrated.managers)
        setPrimeTokens(hydrated.primeTokens)
        // Also prime localStorage so the debounced saver doesn't overwrite
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify({
            coins: hydrated.coins, lifetime: hydrated.lifetime,
            productionBuffer: hydrated.productionBuffer, prodCap: hydrated.prodCap,
            compilerBuffer: hydrated.compilerBuffer,
            floors: hydrated.floors.map(f => ({ level: f.level })),
            bus: hydrated.bus, compiler: hydrated.compiler, auto: hydrated.auto,
            managers: hydrated.managers, primeTokens: hydrated.primeTokens,
          }))
        } catch {}
      } catch (e) {
        console.debug('[Tycoon] Cloud restore parse error', e)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // ── Float helper ───────────────────────────────────────────────────────────
  const spawnFloat = useCallback((val, x, y, color = '#fbbf24') => {
    const id = Date.now() + Math.random()
    setFloats(f => [...f, { id, x, y, val, color }])
    setTimeout(() => setFloats(f => f.filter(n => n.id !== id)), 1500)
  }, [])

  // Ref so async callbacks (runCompilerCycle, runBusCycle) can spawn floats
  // without needing to re-declare the callbacks when spawnFloat identity changes.
  const spawnFloatRef = useRef(null)
  useEffect(() => { spawnFloatRef.current = spawnFloat }, [spawnFloat])

  // ── Dollar burst state (4 simultaneous $ particles on compile) ──────────
  const [coinBursts, setCoinBursts] = useState([])
  const spawnCoinBurst = useCallback((x, y) => {
    const id = Date.now() + Math.random()
    setCoinBursts(b => [...b, { id, x, y }])
    setTimeout(() => setCoinBursts(b => b.filter(c => c.id !== id)), 1500)
  }, [])

  const spawnCoinBurstRef = useRef(null)
  useEffect(() => { spawnCoinBurstRef.current = spawnCoinBurst }, [spawnCoinBurst])

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — DATA BUS STATE MACHINE
  // IDLE → TRAVELING_TO_PROD → LOADING → TRAVELING_TO_COMPILER → IDLE
  // Travel time derived from bus.speed; refs prevent stale closures in timeouts
  // ═══════════════════════════════════════════════════════════════════════════
  const runBusCycle = useCallback(() => {
    if (busStateRef.current !== 'IDLE') return
    if (productionBufferRef.current <= 0) return

    const travelMs = Math.max(MIN_BUS_TRAVEL_MS, Math.round(1000 / busRef.current.speed))

    // Step 1 — travel up to production floors
    setBusState('TRAVELING_TO_PROD')
    busStateRef.current = 'TRAVELING_TO_PROD'

    setTimeout(() => {
      // Step 2 — load from productionBuffer
      setBusState('LOADING')
      busStateRef.current = 'LOADING'
      const amt = r2(Math.min(busRef.current.capacity, productionBufferRef.current))
      if (amt <= 0) {
        setBusState('IDLE'); busStateRef.current = 'IDLE'; return
      }
      setProductionBuffer(b => r2(Math.max(0, b - amt)))
      productionBufferRef.current = r2(Math.max(0, productionBufferRef.current - amt))
      setBusPayload(amt)
      busPayloadRef.current = amt

      // Step 3 — brief loading delay, then travel back down
      setTimeout(() => {
        setBusState('TRAVELING_TO_COMPILER')
        busStateRef.current = 'TRAVELING_TO_COMPILER'

        // Step 4 — drop payload into compilerBuffer
        setTimeout(() => {
          const payload = busPayloadRef.current
          setCompilerBuffer(b => r2(b + payload))
          compilerBufferRef.current = r2(compilerBufferRef.current + payload)
          setBusPayload(0)
          busPayloadRef.current = 0
          setBusState('IDLE')
          busStateRef.current = 'IDLE'
          playClick()
        }, travelMs)
      }, BUS_LOADING_DELAY_MS)
    }, travelMs)
  }, [])

  // Stable ref so the game loop can call runBusCycle without stale closure
  const runBusCycleRef = useRef(null)
  useEffect(() => { runBusCycleRef.current = runBusCycle }, [runBusCycle])

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — COMPILER STATE MACHINE
  // IDLE → FETCHING (COMPILER_FETCH_MS) → PROCESSING (procTime s) → IDLE
  // ═══════════════════════════════════════════════════════════════════════════
  const runCompilerCycle = useCallback(() => {
    if (compilerStateRef.current !== 'IDLE') return
    if (compilerBufferRef.current <= 0) return

    const procMs = Math.max(MIN_COMPILER_PROC_MS, Math.round(compilerRef.current.procTime * 1000))

    // Step 1 — fetching phase
    setCompilerState('FETCHING')
    compilerStateRef.current = 'FETCHING'
    setCompileProgress(0)

    setTimeout(() => {
      const batch = compilerRef.current.batchSize
      const amt   = r2(Math.min(batch, compilerBufferRef.current))
      if (amt <= 0) {
        setCompilerState('IDLE'); compilerStateRef.current = 'IDLE'; return
      }
      setCompilerBuffer(b => r2(Math.max(0, b - amt)))
      compilerBufferRef.current = r2(Math.max(0, compilerBufferRef.current - amt))

      // Step 2 — processing phase
      setCompilerState('PROCESSING')
      compilerStateRef.current = 'PROCESSING'

      setTimeout(() => {
        // primeMult: each Prime Token grants +2% permanent global boost
        const primeMult = 1 + primeTokensRef.current * 0.02
        const earned = r2(amt * compilerRef.current.convRate * primeMult)
        setCoins(c => r2(c + earned))
        setLifetime(l => r2(l + earned))
        // Primary dollar float — position relative to the game container
        const cw = Math.min(window.innerWidth, 500)
        const bx = cw - 60, by = window.innerHeight - 55
        spawnFloatRef.current?.(`+$${fmtN(earned)}`, bx, by, '#22c55e')
        // Burst: 3 extra $ scatter in different arcs
        spawnFloatRef.current?.('$', bx - 22, by + 4, '#fbbf24')
        spawnFloatRef.current?.('$', bx + 18, by + 6, '#f59e0b')
        spawnFloatRef.current?.('$', bx + 4,  by - 8, '#fbbf24')
        spawnCoinBurstRef.current?.(bx, by)
        playChaChing()
        confetti({ particleCount: 18, spread: 35, origin: { x: .5, y: .8 }, colors: ['#fbbf24','#22c55e','#a855f7'], ticks: 80 })
        setCompileProgress(0)
        setCompilerState('IDLE')
        compilerStateRef.current = 'IDLE'
      }, procMs)
    }, COMPILER_FETCH_MS)
  }, [])

  // Stable ref so the game loop can call runCompilerCycle without stale closure
  const runCompilerCycleRef = useRef(null)
  useEffect(() => { runCompilerCycleRef.current = runCompilerCycle }, [runCompilerCycle])

  // ── Progress bar ticker (50 ms interval, active while PROCESSING) ──────────
  // Uses compilerRef.current for procTime to avoid stale closure without
  // restarting the interval mid-cycle when procTime is upgraded.
  useEffect(() => {
    if (compilerState !== 'PROCESSING') { setCompileProgress(0); return }
    const start = Date.now()
    const id = setInterval(() => {
      const procMs = Math.max(MIN_COMPILER_PROC_MS, Math.round(compilerRef.current.procTime * 1000))
      setCompileProgress(Math.min(99, ((Date.now() - start) / procMs) * 100))
    }, 150)
    return () => clearInterval(id)
  }, [compilerState])

  // ═══════════════════════════════════════════════════════════════════════════
  // MASTER TICK ENGINE — useGameLoop (100 ms / 10 TPS)
  // Single centralized interval that drives the full pipeline in order:
  //   1. Production  → productionBuffer
  //   2. Data Bus    → triggers elevator trip (automation)
  //   3. Compiler    → triggers compile cycle (automation)
  // Delta time ensures math stays accurate even if the browser lags.
  // ═══════════════════════════════════════════════════════════════════════════
  const lastTickRef = useRef(Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      const dt  = (now - lastTickRef.current) / 1000   // seconds elapsed
      lastTickRef.current = now

      // 1. Production tick (only when automation is enabled)
      if (autoRef.current.production) {
        const primeMult = 1 + primeTokensRef.current * 0.02
        const rcps = floorsRef.current.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level) * floorTierMult(i), 0) * primeMult
        if (rcps > 0) {
          const next = r2(Math.min(productionBufferRef.current + rcps * dt, prodCapRef.current))
          productionBufferRef.current = next
          setProductionBuffer(next)
        }
      }

      // 2. Auto Data Bus — trigger elevator trip when idle & buffer has RC
      if (autoRef.current.dataBus && busStateRef.current === 'IDLE' && productionBufferRef.current > 0) {
        runBusCycleRef.current?.()
      }

      // 3. Auto Compiler — trigger compile cycle when idle & buffer has RC
      if (autoRef.current.compiler && compilerStateRef.current === 'IDLE' && compilerBufferRef.current > 0) {
        runCompilerCycleRef.current?.()
      }
    }, 100)
    return () => clearInterval(id)
  }, [])  // single interval; all state read from refs

  // ── Per-floor visual progress bars (200ms interval, cosmetic only) ──────────
  useEffect(() => {
    const id = setInterval(() => {
      setFloorProgress(prev => prev.map((p, i) => {
        const lv = floorsRef.current[i]?.level ?? 0
        if (lv === 0) return 0
        const rcps = floorRCPS(FLOORS[i], lv)
        if (rcps <= 0) return 0
        // cycleTime: between 1.5s and 9s so the bar always animates visibly
        const cycleTime = Math.max(1.5, Math.min(9, 6 / rcps))
        const next = p + (100 / cycleTime) * 0.2  // 200ms tick
        return next >= 100 ? next - 100 : next
      }))
    }, 200)
    return () => clearInterval(id)
  }, [])  // floorsRef is a ref — no dep needed

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGER HIRE
  // ═══════════════════════════════════════════════════════════════════════════
  const handleHireManager = useCallback(({ type, floorIdx, cost }) => {
    if (coinsRef.current < cost) return
    setCoins(c => r2(c - cost))
    playChaChing()
    confetti({ particleCount: 50, spread: 60, origin: { x: .5, y: .45 }, colors: ['#22c55e','#fbbf24','#00c8ff'], ticks: 120 })
    if (type === 'floor') {
      setManagers(m => {
        const newFloors = [...m.floors]
        newFloors[floorIdx] = true
        return { ...m, floors: newFloors }
      })
      // Any floor manager enables auto production globally
      setAuto(a => ({ ...a, production: true }))
    } else if (type === 'elevator') {
      setManagers(m => ({ ...m, elevator: true }))
      setAuto(a => ({ ...a, dataBus: true }))
    } else if (type === 'sales') {
      setManagers(m => ({ ...m, sales: true }))
      setAuto(a => ({ ...a, compiler: true }))
    }
    setManagerModal(null)
  }, [])

  // ─── Prime Refactor handler ────────────────────────────────────────────────
  // Formula: 1 Prime Token per $1,000,000 of lifetime earnings.
  // Resets coins → $1,000 seed and floors → Level 0 (FLOORS[0] Spell Lab stays at L1).
  // primeTokens accumulate across runs and grant +2% global boost each.
  const handlePrimeRefactor = useCallback(() => {
    const tokensEarned = Math.floor(lifetimeRef.current / 1_000_000)
    if (tokensEarned <= 0) return

    const newTotalTokens = primeTokensRef.current + tokensEarned
    setPrimeTokens(newTotalTokens)
    primeTokensRef.current = newTotalTokens

    // Reset economy — keep floor definitions; reset level → 0 for all except FLOORS[0] (Spell Lab stays at L1)
    const resetFloors = FLOORS.map((_, i) => ({ level: i === 0 ? 1 : 0 }))
    setFloors(resetFloors)
    floorsRef.current = resetFloors
    setCoins(1000)
    coinsRef.current = 1000
    setProductionBuffer(0)
    productionBufferRef.current = 0
    setCompilerBuffer(0)
    compilerBufferRef.current = 0
    setProdCap(150)
    prodCapRef.current = 150

    // Keep lifetime intact — it drives future prestige token calculations
    setRefactorProcessing(false)
    setPrimeRefactorModal(false)

    // Neon screen flash
    setPrimeFlash(true)
    setTimeout(() => setPrimeFlash(false), 1800)

    // Celebration confetti burst
    confetti({ particleCount: 180, spread: 120, origin: { x: .5, y: .4 }, colors: ['#a855f7','#00c8ff','#fbbf24','#22c55e','#f97316'], ticks: 220 })
    confetti({ particleCount: 80,  angle: 60,  spread: 70,  origin: { x: 0, y: .5 }, colors: ['#a855f7','#00c8ff','#fbbf24'], ticks: 180 })
    confetti({ particleCount: 80,  angle: 120, spread: 70,  origin: { x: 1, y: .5 }, colors: ['#a855f7','#00c8ff','#fbbf24'], ticks: 180 })

    trackEvent('prime_refactor', { tokensEarned, newTotalTokens })
  }, [])
  // ═══════════════════════════════════════════════════════════════════════════
  const handleManualProduce = useCallback((e) => {
    // Minimum yield = 15% of the first Automation Manager cost so a new player
    // can feel meaningful progress toward their first AUTO unlock.
    // This stays in sync automatically if AUTO_COSTS.production is adjusted.
    const minGain = AUTO_COSTS.production * 0.15
    const gain = Math.max(minGain, r2(totalRCPS * 0.1))
    setProductionBuffer(b => r2(Math.min(b + gain, prodCapRef.current)))
    playClick()
    const cw = Math.min(window.innerWidth, 500)
    const cl = (window.innerWidth - cw) / 2
    spawnFloat('+' + fmtRC(gain) + ' RC', (e?.clientX ?? window.innerWidth / 2) - cl, e?.clientY ?? window.innerHeight / 2, '#a855f7')
  }, [totalRCPS, spawnFloat])

  const handleManualTransfer = useCallback(() => {
    runBusCycle()
    playClick()
  }, [runBusCycle])

  const handleManualCompile = useCallback(() => {
    runCompilerCycle()
  }, [runCompilerCycle])

  // ── Buy floor upgrade ──────────────────────────────────────────────────────
  const handleBuyFloor = useCallback((idx, qty, cost) => {
    if (cost <= 0 || qty <= 0 || coinsRef.current < cost) return
    const prevLevel = floorsRef.current[idx]?.level ?? 0
    setCoins(c => r2(c - cost))
    setFloors(prev => prev.map((fs, i) => i !== idx ? fs : { level: fs.level + qty }))
    setProdCap(cap => cap + qty * 50)
    playChaChing()
    trackEvent('tycoon_floor_upgrade', { floor: FLOORS[idx]?.id, qty, cost })
    confetti({ particleCount: Math.min(40 + qty * 2, 120), spread: 55, origin: { x: .35, y: .5 }, colors: [FLOORS[idx]?.color ?? '#00c8ff', '#fbbf24', '#a855f7'], ticks: 130 })
    // Tier-unlock notification: fires when a floor is first unlocked (0→1) and its env tier
    // is higher than all previously unlocked floors' tiers.
    if (prevLevel === 0) {
      const newFloorNum = idx + 1  // 1-based
      const newTierIdx  = getFloorTier(newFloorNum)
      // Compute highest tier previously active (any floor that had level > 0)
      const prevHighest = floorsRef.current.reduce((max, fs, i) => {
        return (i !== idx && (fs.level ?? 0) > 0) ? Math.max(max, getFloorTier(i + 1)) : max
      }, 0)
      if (newTierIdx > prevHighest) {
        const cfg = FLOOR_TIER_CONFIG[newTierIdx]
        setTierNotif({ tierIdx: newTierIdx, label: cfg.label })
        setTimeout(() => setTierNotif(null), 4000)
      }
    }
  }, [])

  // ── Automation unlock ──────────────────────────────────────────────────────
  const handleToggleAuto = useCallback((pillar) => {
    if (auto[pillar]) { setAuto(a => ({ ...a, [pillar]: false })); return }
    const cost = AUTO_COSTS[pillar]
    if (coinsRef.current < cost) return
    setCoins(c => r2(c - cost))
    setAuto(a => ({ ...a, [pillar]: true }))
    playChaChing()
    confetti({ particleCount: 60, spread: 70, origin: { x: .5, y: .4 }, colors: ['#22c55e','#fbbf24','#00c8ff'], ticks: 140 })
    trackEvent('tycoon_automation', { pillar, cost })
  }, [auto])

  // ── Data Bus upgrades ──────────────────────────────────────────────────────
  const handleBusUpgrade = useCallback((type) => {
    setBus(prev => {
      const cost = type === 'capacity' ? prev.capacityCost : prev.speedCost
      if (coinsRef.current < cost) return prev
      setCoins(c => r2(c - cost)); playClick()
      if (type === 'capacity') {
        const lv = prev.capacityLevel + 1
        return { ...prev, capacity: 30 + lv * 10, capacityLevel: lv, capacityCost: calculateNextCost(25, 1.07, lv) }
      }
      const lv = prev.speedLevel + 1
      return { ...prev, speed: r2(0.25 + lv * 0.05), speedLevel: lv, speedCost: calculateNextCost(50, 1.07, lv) }
    })
  }, [])

  // ── Compiler upgrades ──────────────────────────────────────────────────────
  const handleCompilerUpgrade = useCallback((type) => {
    setCompiler(prev => {
      const cost = { batch: prev.batchCost, proc: prev.procCost, conv: prev.convCost }[type]
      if (coinsRef.current < cost) return prev
      setCoins(c => r2(c - cost)); playClick()
      if (type === 'batch') {
        const lv = prev.batchLevel + 1
        return { ...prev, batchSize: 3 + lv * 3, batchLevel: lv, batchCost: calculateNextCost(30, 1.15, lv) }
      } else if (type === 'proc') {
        const lv = prev.procLevel + 1
        return { ...prev, procTime: Math.max(0.5, r2(2 - lv * 0.15)), procLevel: lv, procCost: calculateNextCost(50, 1.15, lv) }
      }
      const lv = prev.convLevel + 1
      return { ...prev, convRate: r2(2 + lv * 0.5), convLevel: lv, convCost: calculateNextCost(100, 1.15, lv) }
    })
  }, [])

  // ── Phaser integration (hidden; milestone detection only) ──────────────────
  const milestoneCBRef = useRef(onAnalogyMilestone)
  useEffect(() => { milestoneCBRef.current = onAnalogyMilestone }, [onAnalogyMilestone])

  const handleMilestone = useCallback((data) => {
    setOverlayConceptId(data?.conceptId ?? null)
    setOverlayVisible(true)
    milestoneCBRef.current?.(data)
  }, [])

  const handleOverlayComplete = useCallback(() => {
    setOverlayVisible(false)
    const bonus = Math.max(50, Math.ceil(coinsRef.current * 0.05))
    setCoins(c => parseFloat((c + bonus).toFixed(2)))
    setLifetime(l => parseFloat((l + bonus).toFixed(2)))
    const cw = Math.min(window.innerWidth, 500)
    spawnFloat(`+$${fmtN(bonus)} QUEST BONUS`, cw / 2, window.innerHeight / 2, '#00c8ff')
    if (gameRef.current) gameRef.current.scene.resume('PlayScene')
  }, [spawnFloat])

  const handleCanvasResize = useCallback(() => {
    if (!phaserContainerRef.current) return
    const { width, height } = computeCanvasSize()
    phaserContainerRef.current.style.width  = width  + 'px'
    phaserContainerRef.current.style.height = height + 'px'
    if (gameRef.current) gameRef.current.scale.resize(width, height)
  }, [])

  useEffect(() => {
    handleCanvasResize()
    let cancelled = false
    Promise.all([
      import('phaser'),
      import('../game/BootScene'),
      import('../game/PreloadScene'),
      import('../game/PlayScene'),
    ]).then(([mod, { default: BootScene }, { default: PreloadScene }, { default: PlayScene }]) => {
      if (cancelled || !phaserContainerRef.current) return
      const { width, height } = computeCanvasSize()
      const game = new mod.Game({ type: mod.AUTO, width, height, parent: 'phaser-game-container', backgroundColor: '#0a0e1a', scale: { mode: mod.Scale.NONE }, scene: [BootScene, PreloadScene, PlayScene] })
      gameRef.current = game
      game.registry.set('onAnalogyMilestone', handleMilestone)
    })
    window.addEventListener('resize', handleCanvasResize)
    return () => { cancelled = true; window.removeEventListener('resize', handleCanvasResize); if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null } }
  }, [handleCanvasResize, handleMilestone])

  // ── Popup derived values ───────────────────────────────────────────────────
  const popDef   = popupIdx !== null ? FLOORS[popupIdx] : null
  const popFloor = popupIdx !== null ? floors[popupIdx] : null
  let popQty = 0, popCost = 0
  if (popFloor && popDef) {
    if (buyQty === '1')       { popQty = 1;  popCost = popFloor.level === 0 ? popDef.baseCost : levelCost(popDef, popFloor.level) }
    else if (buyQty === '10') { popQty = 10; popCost = getBulkCost(popDef, popFloor.level, 10) }
    else if (buyQty === '50') { popQty = 50; popCost = getBulkCost(popDef, popFloor.level, 50) }
    else { const m = getMaxQty(popDef, popFloor.level, coins); popQty = m.qty; popCost = m.cost }
  }

  // Reversed display: FLOORS[0]=Spell Lab=Floor 1 renders at BOTTOM of screen.
  // FLOORS[FLOORS_VIS-1] renders at TOP. Scrolling ▲ reveals higher (costlier) floors.
  // floorScroll=0 shows the bottom FLOORS_VIS floors (floors 1–4).
  const visFloorsDefs = FLOORS.slice(floorScroll, floorScroll + FLOORS_VIS).reverse()
  const visFStates    = floors.slice(floorScroll, floorScroll + FLOORS_VIS).reverse()
  // For visual slot vi (0=top row, FLOORS_VIS-1=bottom row):
  const arrayIdxFor  = (vi) => floorScroll + FLOORS_VIS - 1 - vi
  const floorNumFor  = (vi) => floorScroll + FLOORS_VIS - vi   // 1-based floor number

  // ═══════════════════════════════════════════════════════════════════════════
  // TITLE SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'title') {
    const ORBIT_IMGS = [
      { src:'/assets/heroes/blaze.svg',   name:'Blaze'   },
      { src:'/assets/heroes/luna.svg',    name:'Luna'    },
      { src:'/assets/heroes/zenith.svg',  name:'Zenith'  },
      { src:'/assets/heroes/titan.svg',   name:'Titan'   },
      { src:'/assets/heroes/tempest.svg', name:'Tempest' },
      { src:'/assets/heroes/shadow.svg',  name:'Shadow'  },
      { src:'/assets/heroes/arcanos.svg', name:'Arcanos' },
    ]
    const orbitR = isMobile ? 100 : 145
    const orbitSize = isMobile ? 240 : 320
    return (
      <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 18%, #111b38 0%, #0a0e1a 65%)', overflow:'hidden' }}>
        <style>{ANIM_CSS}</style>
        {onExit && (
          <button
            onClick={() => { playClick(); onExit() }}
            style={{ position:'absolute', top:14, left:14, background:'#0f2640', border:'2px solid #fbbf24', borderRadius:8, color:'#fbbf24', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 10 : 13, fontWeight:700, cursor:'pointer', padding: isMobile ? '5px 8px' : '7px 14px', letterSpacing:'1px', zIndex:20 }}>
            ← MAP
          </button>
        )}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(0,200,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.03) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />
        <div style={{ position:'absolute', width:orbitSize, height:orbitSize, animation:'orbit 22s linear infinite', pointerEvents:'none' }}>
          {ORBIT_IMGS.map(({ src, name }, i) => {
            const a = (i / ORBIT_IMGS.length) * 2 * Math.PI
            const sz = isMobile ? 28 : 38
            return <img key={i} src={src} alt={name} draggable={false} style={{ position:'absolute', left: orbitSize/2 + orbitR * Math.cos(a) - sz/2, top: orbitSize/2 + orbitR * Math.sin(a) - sz/2, width:sz, height:sz, animation:'orbit-rev 22s linear infinite', filter:'drop-shadow(0 0 6px rgba(0,200,255,.5))' }} />
          })}
        </div>
        <div style={{ position:'absolute', width: isMobile ? 228 : 308, height: isMobile ? 228 : 308, borderRadius:'50%', border:'1px solid rgba(0,200,255,.16)', pointerEvents:'none' }} />
        <img src="/assets/heroes/arcanos.svg" alt="Arcanos" draggable={false} style={{ width: isMobile ? 64 : 100, height: isMobile ? 64 : 100, animation:'hero-bob 3s ease-in-out infinite', zIndex:10, marginBottom:4, filter:'drop-shadow(0 0 22px rgba(168,85,247,.7))' }} />
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(14px,3.5vw,26px)', fontWeight:900, color:'#00c8ff', letterSpacing:'3px', animation:'glow-cyan 2.5s ease-in-out infinite', zIndex:10, textAlign:'center', marginBottom:2 }}>MATH SCRIPT</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(22px,6vw,44px)', fontWeight:900, color:'#fbbf24', letterSpacing:'5px', textShadow:'0 0 22px rgba(251,191,36,.7)', zIndex:10, textAlign:'center', marginBottom:6 }}>TYCOON</div>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#4b8fa8', letterSpacing:'4px', textTransform:'uppercase', zIndex:10, marginBottom:10 }}>BUILD · BALANCE · AUTOMATE</div>
        <div style={{ display:'flex', gap:8, marginBottom:32, zIndex:10 }}>
          {[['⚡','PRODUCE','#a855f7'],['🛗','TRANSFER','#3b82f6'],['⚙️','COMPILE','#22c55e']].map(([ic,lbl,clr]) => (
            <div key={lbl} style={{ padding:'5px 12px', background:'rgba(0,0,0,.4)', border:`1px solid ${clr}40`, borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 8 : 9, fontWeight:700, color:clr, letterSpacing:'1px', textAlign:'center' }}>
              {ic}<br/>{lbl}
            </div>
          ))}
        </div>
        <button onClick={() => { playClick(); setScreen('play') }}
          style={{ padding: isMobile ? '12px 40px' : '15px 60px', background:'linear-gradient(135deg,#f59e0b,#fbbf24)', border:'none', borderRadius:12, color:'#0a0e1a', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 16 : 18, fontWeight:900, letterSpacing:'3px', cursor:'pointer', zIndex:10, boxShadow:'0 0 28px rgba(251,191,36,.5), 0 4px 18px rgba(0,0,0,.4)', animation:'pulse 2s ease-in-out infinite' }}
          onMouseEnter={e => { e.currentTarget.style.transform='scale(1.06)' }}
          onMouseLeave={e => { e.currentTarget.style.transform='scale(1)' }}>PLAY</button>
        {lifetime > 0 && <div style={{ position:'absolute', bottom:20, fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#374151', letterSpacing:'1px' }}>💾 SAVED · ${fmtN(lifetime)} LIFETIME DOLLARS</div>}
      </div>
    )
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // PLAY SCREEN — MODERN BUILDING LAYOUT
  // Floor 1 (Spell Lab) = cheapest = BOTTOM. Floor 7 (Code Den) = top.
  // ═══════════════════════════════════════════════════════════════════════════
  const travelMs = Math.max(MIN_BUS_TRAVEL_MS, Math.round(1000 / bus.speed))
  const ELEV_IDLE_TRANSITION = '0.1s'
  const elevTransitionDur = (busState === 'TRAVELING_TO_PROD' || busState === 'TRAVELING_TO_COMPILER')
    ? `${(travelMs / 1000).toFixed(2)}s`
    : ELEV_IDLE_TRANSITION
  const elevBottom = { IDLE:'5%', TRAVELING_TO_PROD:'72%', LOADING:'72%', TRAVELING_TO_COMPILER:'5%' }[busState] ?? '5%'

  const AutoToggle = ({ pillar, label = 'AUTO' }) => {
    const active = auto[pillar], cost = AUTO_COSTS[pillar], can = coins >= cost
    return (
      <button onClick={() => handleToggleAuto(pillar)}
        style={{ padding: isMobile ? '1px 3px' : '4px 10px', background: active ? '#dcfce7' : can ? '#dbeafe' : '#f1f5f9', border:`2px solid ${active ? '#16a34a' : can ? '#3b82f6' : '#cbd5e1'}`, borderRadius:8, fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 6 : 10, fontWeight:700, color: active ? '#15803d' : can ? '#1d4ed8' : '#94a3b8', cursor:'pointer', letterSpacing:'1px', transition:'all .2s', whiteSpace:'nowrap' }}>
        {active ? `🤖 ON` : can ? `🔓 $${fmtN(cost)}` : `🔒 $${fmtN(cost)}`}
      </button>
    )
  }

  return (
    <>
      <style>{ANIM_CSS}</style>

      {/* ════════════════════════════════════════════════════════════════════
          MASTER GRID  ·  single-column layout
          columns: [1fr full-width]
          rows:    [auto topbar] [1fr building floors] [auto/150px ground floor]
          ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'1fr',
        gridTemplateRows:'auto 1fr auto',
        height:'100dvh',
        width:'100%',
        maxWidth:'500px',
        fontFamily:"'Fredoka One', sans-serif",
        userSelect:'none',
        position:'fixed',
        top:0,
        bottom:0,
        left:'50%',
        transform:'translateX(-50%)',
        overflow:'hidden',
        background:'#f8f9fa',
        boxShadow:'0px 0px 50px rgba(0,0,0,0.3)',
      }}>

        {/* Floating coin numbers — inside container so overflow:hidden clips them */}
        {floats.map(n => <div key={n.id} className="float-num" style={{ left:n.x-14, top:n.y-20, color:n.color??'#fbbf24' }}>{n.val}</div>)}

        {/* Coin burst particles (4 emoji scatter on each compile success) */}
        {coinBursts.flatMap(b => [1,2,3,4].map(i => (
          <span key={`${b.id}-${i}`} className={`coin-burst coin-burst-${i}`} style={{ left:b.x-10, top:b.y-10 }}>$</span>
        )))}

        {/* ── TOP BAR — grid-column: 1; grid-row: 1 ── */}
        <div style={{ gridColumn:1, gridRow:1, background:'#ffffff', borderBottom:'3px solid #e8e8e8', padding: isMobile ? '5px 8px' : '8px 18px', display:'flex', alignItems:'center', gap: isMobile ? 6 : 14, zIndex:10, boxShadow:'0 3px 10px rgba(0,0,0,.12)' }}>
          <button onClick={() => { playClick(); setScreen('title') }}
            style={{ background:'#f0f4f8', border:'2px solid #d0d8e4', borderRadius:8, color:'#374151', fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 10 : 13, fontWeight:700, cursor:'pointer', padding: isMobile ? '5px 8px' : '7px 14px', letterSpacing:'1px', flexShrink:0 }}>
            ← MAP
          </button>
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap: isMobile ? 4 : 10 }}>
            <span style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 24 : 44, fontWeight:900, color:'#16a34a', WebkitTextStroke: isMobile ? '1px #000' : '1.5px #000', lineHeight:1 }}>$</span>
            <div>
              <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 24 : 42, fontWeight:900, color:'#16a34a', lineHeight:1, WebkitTextStroke: isMobile ? '1px #000' : '1.5px #000', textShadow:'2px 2px 0 rgba(0,0,0,.15)' }}>{fmtN(coins)}</div>
              {!isMobile && <div style={{ fontSize:11, color:'#6b7280', letterSpacing:'2px', textAlign:'center' }}>DOLLARS</div>}
            </div>
          </div>
          <div style={{ display:'flex', gap: isMobile ? 8 : 18, alignItems:'center', flexShrink:0 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 10 : 13, fontWeight:700, color:'#7c3aed' }}>⚡ {fmtRC(productionBuffer)}</div>
              <div style={{ fontSize: isMobile ? 8 : 10, color:'#6b7280' }}>PROD</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 10 : 13, fontWeight:700, color:'#2563eb' }}>🛗 {fmtRC(busPayload)}</div>
              <div style={{ fontSize: isMobile ? 8 : 10, color:'#6b7280' }}>{busState !== 'IDLE' ? (isMobile ? (busState === 'LOADING' ? 'LOAD' : '↕') : busState.replace(/_/g,' ')) : 'IDLE'}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 10 : 13, fontWeight:700, color:'#16a34a' }}>⚙️ {fmtRC(compilerBuffer)}</div>
              <div style={{ fontSize: isMobile ? 8 : 10, color:'#6b7280' }}>QUEUED</div>
            </div>
          </div>

          {/* ── PRIME REFACTOR button + token count ── */}
          {(() => {
            const refactorEligible = Math.floor(lifetime / 1_000_000) > 0
            return (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0 }}>
                {primeTokens > 0 && (
                  <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 8 : 10, color:'#a855f7', letterSpacing:'.5px', fontWeight:700, textShadow:'0 0 8px rgba(168,85,247,.7)' }}>
                    ⬡ ×{primeTokens} <span style={{ color:'#c084fc' }}>+{(primeTokens*2).toFixed(0)}%</span>
                  </div>
                )}
                <button
                  disabled={!refactorEligible}
                  className={refactorEligible ? 'refactor-btn-active' : undefined}
                  onClick={() => { playClick(); setPrimeRefactorModal(true) }}
                  style={{
                    padding: isMobile ? '4px 6px' : '6px 11px',
                    background: refactorEligible ? 'linear-gradient(135deg,#581c87,#7c3aed)' : 'linear-gradient(135deg,#2d1b4a,#3d1d7a)',
                    border: `2px solid ${refactorEligible ? '#a855f7' : '#4b2d7a'}`,
                    borderRadius: 8,
                    color: refactorEligible ? '#e9d5ff' : '#7c5ea8',
                    fontFamily: "'Fredoka One', sans-serif",
                    fontSize: isMobile ? 7 : 9,
                    fontWeight: 700,
                    cursor: refactorEligible ? 'pointer' : 'default',
                    letterSpacing: '1px',
                    whiteSpace: 'nowrap',
                    transition: 'all .2s',
                    opacity: refactorEligible ? 1 : 0.5,
                    pointerEvents: refactorEligible ? 'auto' : 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow='0 0 20px rgba(168,85,247,.8)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow='' }}
                >⬡ {isMobile ? 'REFACTOR' : 'PRIME REFACTOR'}</button>
              </div>
            )
          })()}
        </div>

        {/* ── PRODUCTION FLOORS — grid-column:1; grid-row:2 ───────────────────
            flex-direction:column-reverse → Floor 1 is rendered at the BOTTOM,
            Floor N stacks upward. Each floor is a full-width horizontal row.
            ──────────────────────────────────────────────────────────────────── */}
        <div style={{
          gridColumn:1, gridRow:2,
          display:'flex',
          flexDirection:'row',
          overflow:'hidden',
          position:'relative',
          background:'#111827',
        }}>

          {/* ── ELEVATOR SHAFT COLUMN — 25% width — dark steel structural column ── */}
          <div style={{
            width:'25%', flexShrink:0,
            background:'linear-gradient(180deg,#111827 0%,#1a2035 50%,#111827 100%)',
            borderRight:'4px solid #0d1117',
            position:'relative', overflow:'hidden',
            display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'flex-end',
            paddingBottom:6,
          }}>
            {/* Left rail cable */}
            <div style={{ position:'absolute', left:'36%', top:0, bottom:0, width:3, background:'linear-gradient(180deg,#1e3a5f,#0d1f36,#1e3a5f)', boxShadow:'0 0 6px rgba(0,200,255,.2)', pointerEvents:'none' }} />
            {/* Right rail cable */}
            <div style={{ position:'absolute', right:'36%', top:0, bottom:0, width:3, background:'linear-gradient(180deg,#1e3a5f,#0d1f36,#1e3a5f)', boxShadow:'0 0 6px rgba(0,200,255,.2)', pointerEvents:'none' }} />
            {/* Animated shaft scroll lines */}
            <div style={{ position:'absolute', inset:0, backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 30px,rgba(0,200,255,.025) 30px,rgba(0,200,255,.025) 32px)', animation:'shaft-scroll 2.5s linear infinite', pointerEvents:'none' }} />
            {/* ── ELEVATOR CAR ── */}
            <div style={{
              position:'absolute', left:'50%', transform:'translateX(-50%)',
              bottom: elevBottom,
              transition:`bottom ${elevTransitionDur} ease-in-out`,
              width:'72%', zIndex:5,
            }}>
              {/* Cable above car */}
              <div style={{ position:'absolute', bottom:'100%', left:'50%', transform:'translateX(-50%)', width:2, height:300, background:'linear-gradient(180deg,transparent 0%,#1e3a5f 100%)', opacity:.55, pointerEvents:'none' }} />
              <div style={{
                background: busState !== 'IDLE' ? 'linear-gradient(160deg,#1e4d8c,#0f3060)' : 'rgba(0,32,80,0.92)',
                border:`2px solid ${busState !== 'IDLE' ? '#00c8ff' : '#2a4a7f'}`,
                borderRadius:6, padding: isMobile ? '4px 3px' : '6px 4px',
                textAlign:'center', boxShadow: busState !== 'IDLE' ? '0 0 14px rgba(0,200,255,.55)' : '0 2px 8px rgba(0,0,0,.5)',
                transition:'border-color .3s, box-shadow .3s',
              }}>
                <div style={{ fontSize: isMobile ? 15 : 20, lineHeight:1 }}>🛗</div>
                {busPayload > 0 && (
                  <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile ? 7 : 9, color:'#00c8ff', fontWeight:700, lineHeight:1.1, marginTop:1 }}>
                    {fmtRC(busPayload)}
                  </div>
                )}
              </div>
            </div>
            {/* ── SCROLL ARROWS — inside shaft at bottom, no z-index overlap ── */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, zIndex:10, position:'relative' }}>
              <button onClick={() => setFloorScroll(s => Math.min(FLOORS.length - FLOORS_VIS, s + 1))}
                disabled={floorScroll >= FLOORS.length - FLOORS_VIS}
                style={{ width: isMobile?28:34, height: isMobile?28:34,
                  background: floorScroll < FLOORS.length - FLOORS_VIS ? '#1e3a5f' : 'rgba(0,0,0,.3)',
                  border:`2px solid ${floorScroll < FLOORS.length - FLOORS_VIS ? '#3b82f6' : '#1e2940'}`,
                  borderRadius:8, color: floorScroll < FLOORS.length - FLOORS_VIS ? '#60a5fa' : '#334155',
                  fontSize:13, fontWeight:900, cursor: floorScroll < FLOORS.length - FLOORS_VIS ? 'pointer' : 'default',
                  lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: floorScroll < FLOORS.length - FLOORS_VIS ? '0 0 8px rgba(59,130,246,.4)' : 'none',
                }}>▲</button>
              <button onClick={() => setFloorScroll(s => Math.max(0, s - 1))}
                disabled={floorScroll <= 0}
                style={{ width: isMobile?28:34, height: isMobile?28:34,
                  background: floorScroll > 0 ? '#1e3a5f' : 'rgba(0,0,0,.3)',
                  border:`2px solid ${floorScroll > 0 ? '#3b82f6' : '#1e2940'}`,
                  borderRadius:8, color: floorScroll > 0 ? '#60a5fa' : '#334155',
                  fontSize:13, fontWeight:900, cursor: floorScroll > 0 ? 'pointer' : 'default',
                  lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow: floorScroll > 0 ? '0 0 8px rgba(59,130,246,.4)' : 'none',
                }}>▼</button>
            </div>
          </div>

          {/* ── FLOORS COLUMN — 75% width — office floor rooms stacked flush ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column-reverse', overflow:'hidden', borderRight:'5px solid #1a2035' }}>
          {/* Floors rendered in natural array order; column-reverse flips them visually */}
          {[...visFloorsDefs].reverse().map((def, vi) => {
            const visualSlot  = FLOORS_VIS - 1 - vi
            const ai          = arrayIdxFor(visualSlot)
            const lv          = visFStates[visualSlot].level
            const locked      = lv === 0
            const canAfrd     = coins >= (locked ? def.baseCost : levelCost(def, lv))
            const rcps        = floorRCPS(def, lv) * floorTierMult(ai)
            const wc          = workerCount(lv)
            const fnum        = floorNumFor(visualSlot)
            const floorManaged = managers.floors[ai] ?? false
            const mgrCost      = managerFloorCost(def)
            const tier         = !locked ? (lv >= 50 ? 3 : lv >= 25 ? 2 : 1) : 0
            const nextRCPS     = (floorRCPS(def, lv + 1) - floorRCPS(def, lv)) * floorTierMult(ai)
            // Environment tier (Garage/Startup/Corporate/CyberHub) — based on floor depth
            const envTier      = getFloorTier(fnum)
            const envTierCfg   = FLOOR_TIER_CONFIG[envTier]
            // Dark cyberpunk tier backgrounds
            const tierBorderColor = locked ? '#d1d5db' : def.color
            const tierBg = locked ? '#f1f5f9' : def.lightBg
            const tierShadow = tier === 3 ? `0 3px 14px ${def.color}28` :
                               tier === 2 ? `0 2px 8px ${def.color}18` : '0 2px 6px rgba(0,0,0,0.07)'
            // Env-tier CSS class: Garage gets brick texture; CyberHub gets neon border animation
            const envClass = [
              tier === 3 ? 'tier-3-floor' : '',
              envTier === 0 ? 'env-garage' : '',
              envTier === 3 ? 'env-cyberhub' : '',
            ].filter(Boolean).join(' ') || undefined
            return (
              <div key={def.id}
                className={envClass}
                style={{
                  display:'flex', flexDirection:'row', alignItems:'stretch',
                  justifyContent:'space-between',
                  flex:1, minHeight:0, width:'100%',
                  border:'none',
                  borderBottom:'3px solid #1a2035',
                  borderLeft:`5px solid ${tierBorderColor}`,
                  borderRadius:0,
                  background: tierBg,
                  position:'relative', overflow:'hidden',
                }}>

                {/* Top accent stripe */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height: tier===3?3:2,
                  background:`${locked?'#d1d5db':def.color}${tier===3?'':tier===2?'88':'55'}`, pointerEvents:'none' }} />
                {/* Env-tier label badge (non-mobile, top-right corner of floor) */}
                {!isMobile && !locked && (
                  <div style={{ position:'absolute', top:3, right:6, fontFamily:"'Fredoka One',sans-serif", fontSize:7, color: envTierCfg.id === 3 ? '#00ffcc' : envTierCfg.id === 2 ? '#a78bfa' : envTierCfg.id === 1 ? '#60a5fa' : '#b45309', opacity:.7, letterSpacing:'1px', pointerEvents:'none', zIndex:2 }}>
                    {envTierCfg.label}
                  </div>
                )}

                {/* ── 1. DROP-OFF + MANAGER ────────────────────────────────── */}
                <div style={{ width: isMobile?72:116, flexShrink:0, display:'flex', alignItems:'center',
                  padding: isMobile?'4px 4px 4px 6px':'6px 6px 6px 14px', gap: isMobile?4:8,
                  borderRight:`1px solid ${locked?'#e2e8f0':def.color+'33'}` }}>

                  {/* Floor badge + DataPile drop-off */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, gap: isMobile?1:3 }}>
                    {/* Floor number badge */}
                    <div style={{ background: locked?'#94a3b8':def.color, color:'#fff', fontFamily:"'Fredoka One',sans-serif",
                      fontSize: isMobile?8:11, fontWeight:900, borderRadius:5,
                      padding: isMobile?'1px 4px':'2px 6px', minWidth: isMobile?16:24, textAlign:'center',
                      boxShadow: locked?'none':`0 2px 8px ${def.color}55` }}>{fnum}</div>
                    {/* DataPile — neon data-drive stack */}
                    <DataPile amount={productionBuffer} cap={prodCap} color={locked ? '#94a3b8' : def.color} isMobile={isMobile} />
                    {locked
                      ? <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?7:9, color:'#6b7280', fontWeight:600 }}>${fmtN(def.baseCost)}</div>
                      : <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?7:9, color:`${def.color}cc`, fontWeight:700 }}>{fmtRC(productionBuffer)}</div>
                    }
                  </div>

                  {/* Manager portrait circle */}
                  <div
                    onClick={e => { e.stopPropagation(); if (!locked && !floorManaged) setManagerModal({ type:'floor', floorIdx:ai, def, cost:mgrCost }) }}
                    style={{ width: isMobile?28:42, height: isMobile?28:42, flexShrink:0, borderRadius:'50%',
                      border:`2px solid ${floorManaged ? def.color : '#d1d5db'}`,
                      background: floorManaged ? `${def.color}18` : '#e8edf2',
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      cursor: locked||floorManaged ? 'default' : 'pointer',
                      boxShadow: floorManaged ? `0 0 10px ${def.color}55` : 'none',
                      transition:'all .2s', position:'relative', overflow:'visible' }}>
                    <ManagerPortrait hired={floorManaged} color={def.color} size={isMobile?28:42} />
                    {!floorManaged && !locked && (
                      <div style={{ position:'absolute', bottom: isMobile?-10:-12, fontFamily:"'Fredoka One',sans-serif",
                        fontSize: isMobile?5:7, color:'#334155', whiteSpace:'nowrap', letterSpacing:'.5px' }}>HIRE</div>
                    )}
                  </div>
                </div>

                {/* ── 2. WORK AREA — name + progress bar + Workstation+workers ── */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
                  justifyContent:'flex-end', padding: isMobile?'3px 4px 3px':'4px 10px 3px', minWidth:0, overflow:'hidden', position:'relative', zIndex:1 }}>
                  {/* Floor name (desktop only) */}
                  {!isMobile && (
                    <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize:10, fontWeight:700,
                      color: locked?'#94a3b8':def.color, letterSpacing:'.4px', lineHeight:1,
                      alignSelf:'flex-start', marginBottom:3, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:'100%' }}>
                      {def.short}
                      {tier >= 2 && <span style={{ marginLeft:6, fontSize:8, color: tier===3?'#fbbf24':'#a78bfa' }}>✦{tier===3?'T3':'T2'}</span>}
                    </div>
                  )}
                  {/* Progress bar above workstations */}
                  <div style={{ width:'84%', height: isMobile?4:6, background:'rgba(0,0,0,.1)', borderRadius:4,
                    overflow:'hidden', marginBottom: isMobile?2:4, boxShadow:'inset 0 1px 3px rgba(0,0,0,.4)' }}>
                    <div style={{ height:'100%',
                      width:`${locked ? 0 : (floorProgress[ai] ?? 0)}%`,
                      background: locked ? '#1a2540' : `linear-gradient(90deg,${def.color},${def.color}cc)`,
                      borderRadius:4, transition:'width .1s linear',
                      boxShadow: !locked ? `0 0 6px ${def.color}80` : 'none' }} />
                  </div>
                  {/* Workstations + workers */}
                  <div style={{ display:'flex', gap: isMobile?4:10, alignItems:'flex-end' }}>
                    {locked
                      ? (
                        <Workstation def={def} locked={true} isMobile={isMobile}>
                          <AnimatedWorker color={def.color} workerIndex={0} rcps={0} locked={true} isMobile={isMobile} tier={1} managerHired={false} envTier={envTier} />
                        </Workstation>
                      )
                      : Array.from({ length: Math.max(1, wc) }).map((_,wi) => (
                          <Workstation key={wi} def={def} locked={false} isMobile={isMobile}>
                            <AnimatedWorker
                              color={def.color}
                              workerIndex={wi}
                              rcps={rcps}
                              locked={false}
                              isMobile={isMobile}
                              tier={tier}
                              managerHired={floorManaged}
                              onWorkerClick={handleManualProduce}
                              envTier={envTier}
                            />
                          </Workstation>
                        ))
                    }
                  </div>
                  {/* RC/s stats (desktop only) */}
                  {!locked && !isMobile && (
                    <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize:9, color:`${def.color}77`, marginTop:2, letterSpacing:'.3px' }}>
                      +{fmtCPS(rcps)} RC/s · LV {lv} · {wc}w
                    </div>
                  )}
                  {/* ── Traffic Jam warning — production outpaces bus capacity ── */}
                  {!locked && isBottlenecked && (
                    <div className="traffic-jam" style={{ position:'absolute', bottom:2, left:'50%', transform:'translateX(-50%)', fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?7:9, color:'#ef4444', fontWeight:700, letterSpacing:'.5px', whiteSpace:'nowrap', pointerEvents:'none', zIndex:3 }}>
                      ⚠ TRAFFIC JAM
                    </div>
                  )}
                </div>

                {/* ── 3. UPGRADE BUTTON ─────────────────────────────────────── */}
                <div style={{ flexShrink:0, width: isMobile?90:110, minWidth: isMobile?80:100, padding: isMobile?'4px 3px':'5px 8px',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <button
                    onClick={e => { e.stopPropagation(); if (canAfrd) handleBuyFloor(ai, 1, locked ? def.baseCost : levelCost(def,lv)) }}
                    disabled={!canAfrd}
                    style={{
                      width:'100%', minHeight: isMobile?60:68,
                      background: canAfrd ? def.color : locked ? '#e2e8f0' : '#f0f4f8',
                      border: 'none',
                      borderBottom: canAfrd ? `4px solid ${def.color}bb` : '4px solid #d1d5db',
                      borderRadius:10, cursor: canAfrd ? 'pointer' : 'not-allowed',
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2,
                      boxShadow: canAfrd ? `0 4px 14px ${def.color}44` : 'none',
                      transition:'all .18s',
                    }}>
                    {locked ? (<>
                      <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?13:14, fontWeight:900, color: canAfrd?'#fff':'#94a3b8', lineHeight:1 }}>UNLOCK</div>
                      <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?11:12, color: canAfrd?'rgba(255,255,255,.85)':'#9ca3af' }}>${fmtN(def.baseCost)}</div>
                    </>) : (<>
                      <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?13:14, fontWeight:900, color: canAfrd?'#fff':`${def.color}`, lineHeight:1 }}>LV {lv+1}</div>
                      <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?11:12, color: canAfrd?'rgba(255,255,255,.85)':`${def.color}bb` }}>${fmtN(levelCost(def,lv))}</div>
                      {!isMobile && <div style={{ fontSize:8, color: canAfrd?'rgba(255,255,255,.7)':`${def.color}99`, lineHeight:1.2 }}>+{fmtCPS(nextRCPS)}/s</div>}
                    </>)}
                  </button>
                </div>
              </div>
            )
          })}
          </div>
        </div>

        {/* ── GROUND FLOOR / LOADING DOCK — grid-column: 1; grid-row:3 ──────── */}
        <div style={{
          gridColumn:1, gridRow:3,
          display:'flex',
          flexDirection:'row',
          alignItems:'stretch',
          borderTop:'4px solid #0d1117',
          background:'#1a2035',
          overflow:'hidden',
          width:'100%',
          minHeight: isMobile ? 130 : 160,
          flexShrink:0,
        }}>

          {/* ── LOADING DOCK BASE — 25% width, dark steel matching shaft ── */}
          <div style={{ width:'25%', flexShrink:0, background:'linear-gradient(180deg,#111827,#1a2035)', borderRight:'4px solid #0d1117', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding: isMobile ? '6px 4px' : '8px 8px', gap: isMobile ? 3 : 5 }}>
            <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 7 : 9, color:'#00c8ff', fontWeight:700, letterSpacing:'1px', textAlign:'center', opacity:.8 }}>DOCK</div>
            <DataPile amount={compilerBuffer} cap={Math.max(1, compiler.batchSize * 5)} color='#00d4ff' isMobile={isMobile} />
            <div style={{ fontFamily:"'Fredoka One', sans-serif", fontSize: isMobile ? 11 : 16, color:'#e2e8f0', fontWeight:900, lineHeight:1 }}>{fmtRC(compilerBuffer)}</div>
            <div style={{ width:'80%', height:4, background:'rgba(0,212,255,.12)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${compiler.batchSize > 0 ? Math.min(100, compilerBuffer/compiler.batchSize*100) : 0}%`, background:'linear-gradient(90deg,#0050aa,#00d4ff)', borderRadius:3, transition:'width .5s', boxShadow:'0 0 6px rgba(0,212,255,.6)' }} />
            </div>
          </div>

          {/* ── SALES OFFICE — 75% width, split: top visual scene + bottom control panel ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f8fafc', overflow:'hidden' }}>

            {/* ── TOP: Visual Sales Scene (character + desk centered) ── */}
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap: isMobile?6:12, padding: isMobile?'4px 6px':'6px 14px', overflow:'hidden', position:'relative' }}>
              {/* State badge */}
              <div style={{ position:'absolute', top: isMobile?3:4, left: isMobile?6:10, fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, fontWeight:700, letterSpacing:'.5px', color: compilerState==='PROCESSING'?'#16a34a':compilerState==='FETCHING'?'#f59e0b':'#94a3b8', opacity:.85, pointerEvents:'none' }}>
                {compilerState === 'PROCESSING' ? 'COMPILING' : compilerState === 'FETCHING' ? 'FETCH…' : 'READY'}
              </div>
              {/* Computer desk */}
              <span style={{ fontSize: isMobile?28:42, display:'inline-block', lineHeight:1, flexShrink:0, filter: compilerState!=='IDLE'?'drop-shadow(0 0 8px rgba(34,197,94,.7))':'none', animation: compilerState!=='IDLE'?'mainframe-glow .85s ease-in-out infinite':'none' }}>🖥️</span>
              {/* Sales character */}
              <div style={{ position:'relative', display:'flex', alignItems:'flex-end', flexShrink:0 }}>
                <SalesWorker compilerState={compilerState} isMobile={isMobile} />
                {compilerState === 'FETCHING' && (
                  <span style={{ fontSize: isMobile?11:14, position:'absolute', right:-4, bottom:10, animation:'file-carry .45s ease-in-out infinite', pointerEvents:'none' }}>📋</span>
                )}
              </div>
              {/* Compile progress bar pinned to bottom of visual area */}
              <div style={{ position:'absolute', bottom:2, left:'10%', right:'10%', height:3, background:'rgba(74,222,128,.15)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:3, transition:'width .05s linear' }} />
              </div>
            </div>

            {/* ── BOTTOM: Unified Control Panel (PROD | SEND | COMPILE) ── */}
            <div style={{ display:'flex', flexDirection:'row', alignItems:'center', justifyContent:'space-around', background:'rgba(0,0,0,.04)', borderTop:`1px solid #e2e8f0`, padding: isMobile?'3px 4px':'4px 10px', gap: isMobile?2:8, flexShrink:0 }}>

              {/* PROD control */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: isMobile?1:2, flexShrink:0 }}>
                <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, color:'#7c3aed', fontWeight:700, letterSpacing:'.5px', whiteSpace:'nowrap' }}>⚡ PROD</div>
                {auto.production
                  ? <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?8:10, color:'#16a34a', background:'#dcfce7', border:'2px solid #16a34a', borderRadius:7, padding: isMobile?'2px 5px':'3px 7px', whiteSpace:'nowrap' }}>🤖 AUTO</div>
                  : <button onClick={handleManualProduce} style={{ background:'#8b5cf6', border:'none', borderBottom:'3px solid #6d28d9', color:'#fff', borderRadius:8, fontSize: isMobile?10:16, fontFamily:"'Fredoka One',sans-serif", padding: isMobile?'3px 6px':'5px 14px', cursor:'pointer', fontWeight:900 }}>⚡</button>
                }
                <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, color:'#a78bfa', whiteSpace:'nowrap' }}>{fmtRC(productionBuffer)}</div>
                <AutoToggle pillar="production" />
              </div>

              <div style={{ width:1, height: isMobile?32:44, background:'#e2e8f0', flexShrink:0 }} />

              {/* SEND control — label turns red when queue overflows bus capacity */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: isMobile?1:2, flexShrink:0 }}>
                <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, color: isQueueOverflow ? '#ef4444' : '#1d4ed8', fontWeight:700, letterSpacing:'.5px', whiteSpace:'nowrap' }}>🛗 SEND</div>
                {auto.dataBus
                  ? <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?8:10, color:'#16a34a', background:'#dcfce7', border:'2px solid #16a34a', borderRadius:7, padding: isMobile?'2px 5px':'3px 7px', whiteSpace:'nowrap' }}>🤖 AUTO</div>
                  : <button onClick={handleManualTransfer} disabled={busState!=='IDLE'||productionBuffer===0} style={{ background: busState==='IDLE'&&productionBuffer>0?'#2563eb':'#e2e8f0', border:'none', borderBottom: busState==='IDLE'&&productionBuffer>0?'3px solid #1d4ed8':'3px solid #cbd5e1', borderRadius:8, color: busState==='IDLE'&&productionBuffer>0?'#fff':'#9ca3af', fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?10:16, fontWeight:900, cursor: busState==='IDLE'&&productionBuffer>0?'pointer':'not-allowed', padding: isMobile?'3px 6px':'5px 14px' }}>🛗</button>
                }
                <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, color:'#60a5fa', whiteSpace:'nowrap' }}>{busState!=='IDLE'?(busState==='LOADING'?'LOAD':'↕'):'IDLE'}</div>
                <AutoToggle pillar="dataBus" />
                <button onClick={() => setBusPopupOpen(true)} style={{ background:'none', border:'none', color:'#3b82f6', fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, cursor:'pointer', padding:0, lineHeight:1, whiteSpace:'nowrap' }}>⚙ UP</button>
              </div>

              <div style={{ width:1, height: isMobile?32:44, background:'#e2e8f0', flexShrink:0 }} />

              {/* COMPILE control — label turns red when queue overflows */}
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: isMobile?1:2, flexShrink:0 }}>
                <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, color: isQueueOverflow ? '#ef4444' : '#059669', fontWeight:700, letterSpacing:'.5px', whiteSpace:'nowrap' }}>⚙️ COMPILE</div>
                {auto.compiler
                  ? <div style={{ fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?8:10, color:'#16a34a', background:'#dcfce7', border:'2px solid #16a34a', borderRadius:7, padding: isMobile?'2px 5px':'3px 7px', whiteSpace:'nowrap' }}>🤖 AUTO</div>
                  : <button onClick={handleManualCompile} disabled={compilerBuffer<compiler.batchSize} style={{ background: compilerBuffer>=compiler.batchSize?'#16a34a':'#e2e8f0', border:'none', borderBottom: compilerBuffer>=compiler.batchSize?'3px solid #15803d':'3px solid #cbd5e1', borderRadius:8, color: compilerBuffer>=compiler.batchSize?'#fff':'#9ca3af', fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?10:16, fontWeight:900, cursor: compilerBuffer>=compiler.batchSize?'pointer':'not-allowed', padding: isMobile?'3px 6px':'5px 14px' }}>⚙️</button>
                }
                <AutoToggle pillar="compiler" />
                <button onClick={() => setCompilerPopupOpen(true)} style={{ background:'none', border:'none', color:'#22c55e', fontFamily:"'Fredoka One',sans-serif", fontSize: isMobile?6:8, cursor:'pointer', padding:0, lineHeight:1, whiteSpace:'nowrap' }}>⚙ UP</button>
              </div>

            </div>
          </div>
        </div>

        {/* ════ FLOOR UPGRADE POPUP ════════════════════════════════════════════ */}
      {popDef && popFloor && (
        <div onClick={() => setPopupIdx(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', backdropFilter:'blur(8px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:14 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(160deg,#0f1629 0%,#0d1221 100%)', border:`2px solid ${popDef.color}`, borderRadius:18, padding:20, width:'100%', maxWidth:360, boxShadow:`0 0 50px ${popDef.glow},0 20px 60px rgba(0,0,0,.6)`, position:'relative', maxHeight:'90vh', overflowY:'auto' }}>
            <button onClick={() => setPopupIdx(null)}
              style={{ position:'absolute', top:12, right:12, width:28, height:28, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:14, cursor:'pointer' }}>✕</button>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:54, height:54, background:'rgba(0,0,0,.5)', border:`2px solid ${popDef.color}`, borderRadius:13, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 18px ${popDef.glow}`, overflow:'hidden' }}><img src={popDef.img} alt={popDef.hero} style={{ width:50, height:50, objectFit:'contain' }} /></div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:popDef.color, letterSpacing:'1px' }}>{popDef.short}</div>
                <div style={{ fontSize:13, color:'#64748b' }}>{popDef.hero} · {popDef.desc}</div>
                <div style={{ display:'inline-block', background:'rgba(0,0,0,.5)', border:`1px solid ${popDef.color}60`, borderRadius:5, padding:'2px 8px', fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color:popDef.color, marginTop:4 }}>LEVEL {popFloor.level}</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ background:'rgba(0,0,0,.3)', border:`1px solid ${popDef.color}20`, borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[
                ['RC OUTPUT',      `${fmtCPS(floorRCPS(popDef, popFloor.level))}/s`, popQty>0 ? `→ ${fmtCPS(floorRCPS(popDef, popFloor.level + popQty))}/s` : null],
                ['PER LEVEL',      `+${popDef.rcps} RC/s × ${milestoneMult(popFloor.level)}×`, null],
                ['WORKERS',        `${workerCount(popFloor.level)}`, popQty>0 ? `→ ${workerCount(popFloor.level + popQty)}` : null],
                ['NEXT MILESTONE', (() => { const nm = nextML(popFloor.level); return nm ? `Lv ${nm} → ×${milestoneMult(nm)}` : '✦ MAX' })(), null],
              ].map(([lbl,val,nxt]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5, fontSize:13 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:12 }}>{val}</span>
                    {nxt && <span style={{ color:'#22c55e', fontSize:12 }}>{nxt}</span>}
                  </div>
                </div>
              ))}
              {(() => { const nm = nextML(popFloor.level); if (!nm) return null; return (
                <div style={{ marginTop:5 }}>
                  <div style={{ height:5, background:'rgba(255,255,255,.05)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(100,(popFloor.level/nm)*100)}%`, background:`linear-gradient(90deg,${popDef.color},#fbbf24)`, borderRadius:3 }} />
                  </div>
                </div>
              )})()}
            </div>

            {/* ×1 / ×10 / ×50 / MAX */}
            <div style={{ display:'flex', gap:6, marginBottom:10 }}>
              {[['1','×1','#3b82f6'],['10','×10','#f97316'],['50','×50','#22c55e'],['max','MAX','#ef4444']].map(([v,l,clr]) => (
                <button key={v} onClick={() => setBuyQty(v)}
                  style={{ flex:1, padding:'8px 4px', background: buyQty===v ? clr : 'rgba(15,22,42,.8)', border:`1px solid ${buyQty===v ? clr : 'rgba(255,255,255,.08)'}`, borderRadius:8, color: buyQty===v ? '#fff' : '#64748b', fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s' }}>{l}</button>
              ))}
            </div>

            <div style={{ textAlign:'center', marginBottom:10, fontSize:13, color:'#4b8fa8', minHeight:18 }}>
              {popQty > 0
                ? <>Upgrade <span style={{ color:popDef.color, fontWeight:700 }}>×{fmtN(popQty)}</span> for <span style={{ color:'#fbbf24', fontWeight:700 }}>${fmtN(popCost)}</span></>
                : <span style={{ color:'#1e293b' }}>Not enough dollars</span>}
            </div>

            <button disabled={popQty===0 || coins<popCost}
              onClick={() => { if(popQty>0&&coins>=popCost) handleBuyFloor(popupIdx,popQty,popCost) }}
              style={{ width:'100%', padding:'14px', background:(popQty>0&&coins>=popCost)?`linear-gradient(135deg,${popDef.color},${popDef.color}90)`:'rgba(20,30,55,.6)', border:`1px solid ${(popQty>0&&coins>=popCost)?popDef.color:'#1a2035'}`, borderRadius:12, color:(popQty>0&&coins>=popCost)?'#fff':'#1e293b', fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700, letterSpacing:'1px', cursor:(popQty>0&&coins>=popCost)?'pointer':'not-allowed', boxShadow:(popQty>0&&coins>=popCost)?`0 0 24px ${popDef.glow}`:'none', transition:'all .2s' }}>
              {popFloor.level === 0 ? '🔓 UNLOCK FLOOR' : `UPGRADE  $${fmtN(popCost)}`}
            </button>
          </div>
        </div>
      )}

        {/* ════ DATA BUS UPGRADE POPUP ═════════════════════════════════════════ */}
      {busPopupOpen && (
        <div onClick={() => setBusPopupOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', backdropFilter:'blur(8px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:14 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(160deg,#0f1629 0%,#0d1221 100%)', border:'2px solid #3b82f6', borderRadius:18, padding:20, width:'100%', maxWidth:340, boxShadow:'0 0 50px rgba(59,130,246,.25),0 20px 60px rgba(0,0,0,.6)', position:'relative' }}>
            <button onClick={() => setBusPopupOpen(false)}
              style={{ position:'absolute', top:12, right:12, width:28, height:28, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:14, cursor:'pointer' }}>✕</button>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:50, height:50, background:'rgba(59,130,246,.12)', border:'2px solid rgba(59,130,246,.5)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>🛗</div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:'#3b82f6' }}>DATA BUS</div>
                <div style={{ fontSize:13, color:'#64748b' }}>Elevator · Transfer System</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color: busState!=='IDLE' ? '#22c55e' : '#374151', marginTop:4 }}>
                  {busState==='IDLE'?'● IDLE':busState==='LOADING'?'📦 LOADING':busState==='TRAVELING_TO_PROD'?'▲ HEADING UP':'▼ DELIVERING'}
                </div>
              </div>
            </div>

            <div style={{ background:'rgba(59,130,246,.05)', border:'1px solid rgba(59,130,246,.15)', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[['CAPACITY',`${bus.capacity} RC/trip`],['TRAVEL SPEED',`${(1/bus.speed).toFixed(1)}s/trip`],['PAYLOAD',`${fmtRC(busPayload)} RC on board`],['PROD BUFFER',`${fmtRC(productionBuffer)}/${fmtN(prodCap)} RC`]].map(([lbl,val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:12 }}>{val}</span>
                </div>
              ))}
            </div>

            {[
              { icon:'📦', label:'TRANSFER CAPACITY', value:`${bus.capacity} RC/trip`,        cost:bus.capacityCost, can:coins>=bus.capacityCost, fn:()=>handleBusUpgrade('capacity') },
              { icon:'🚀', label:'TRAVEL SPEED',       value:`${(1/bus.speed).toFixed(1)}s/trip`, cost:bus.speedCost,    can:coins>=bus.speedCost,    fn:()=>handleBusUpgrade('speed') },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(0,0,0,.3)', borderRadius:9, border:'1px solid rgba(59,130,246,.1)', marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{r.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#94a3b8' }}>{r.label}</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:'#e8e8f0' }}>{r.value}</div>
                </div>
                <button onClick={r.fn} disabled={!r.can}
                  style={{ padding:'6px 12px', background: r.can ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)' : 'rgba(20,30,55,.8)', border:'none', borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, color: r.can ? '#fff' : '#1e293b', cursor: r.can ? 'pointer' : 'not-allowed' }}>
                  UP ${fmtN(r.cost)}
                </button>
              </div>
            ))}
            <AutoToggle pillar="dataBus" label="AUTO BUS" />
          </div>
        </div>
      )}

        {/* ════ COMPILER UPGRADE POPUP ══════════════════════════════════════════ */}
      {compilerPopupOpen && (
        <div onClick={() => setCompilerPopupOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', backdropFilter:'blur(8px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:14 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(160deg,#0f1629 0%,#0d1221 100%)', border:'2px solid #22c55e', borderRadius:18, padding:20, width:'100%', maxWidth:340, boxShadow:'0 0 50px rgba(34,197,94,.2),0 20px 60px rgba(0,0,0,.6)', position:'relative' }}>
            <button onClick={() => setCompilerPopupOpen(false)}
              style={{ position:'absolute', top:12, right:12, width:28, height:28, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:14, cursor:'pointer' }}>✕</button>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:50, height:50, background:'rgba(34,197,94,.1)', border:'2px solid rgba(34,197,94,.5)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, animation: compilerState==='PROCESSING' ? 'gear-spin 1s linear infinite' : 'none' }}>⚙️</div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:'#22c55e' }}>SALES OFFICE</div>
                <div style={{ fontSize:13, color:'#64748b' }}>Compiler · Dollar Generator</div>
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ height:6, background:'rgba(255,255,255,.05)', borderRadius:3, overflow:'hidden', marginBottom:3 }}>
                <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:3, transition:'width .05s linear' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#4b5563' }}>
                <span>{compilerState==='IDLE' ? 'IDLE' : compilerState==='FETCHING' ? 'FETCHING...' : 'PROCESSING'}</span>
                <span style={{ color:'#22c55e' }}>{compileProgress.toFixed(0)}%</span>
              </div>
            </div>

            <div style={{ background:'rgba(34,197,94,.04)', border:'1px solid rgba(34,197,94,.12)', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[
                ['BATCH SIZE',  `${compiler.batchSize} RC/batch`],
                ['PROC SPEED',  `${compiler.procTime}s/batch`],
                ['CONV RATE',   `×${compiler.convRate.toFixed(2)} $/RC`],
                ['QUEUED',      `${fmtRC(compilerBuffer)} RC`],
                ['$/BATCH', `$${fmtN(compiler.batchSize * compiler.convRate)}`],
              ].map(([lbl,val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:13 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:12 }}>{val}</span>
                </div>
              ))}
            </div>

            {[
              { icon:'📦', label:'BATCH SIZE',       value:`${compiler.batchSize} RC`,         cost:compiler.batchCost, can:coins>=compiler.batchCost, fn:()=>handleCompilerUpgrade('batch') },
              { icon:'⏱️', label:'PROCESSING SPEED', value:`${compiler.procTime}s`,             cost:compiler.procCost,  can:coins>=compiler.procCost,  fn:()=>handleCompilerUpgrade('proc') },
              { icon:'💱', label:'CONVERSION RATE',  value:`×${compiler.convRate.toFixed(2)}`,  cost:compiler.convCost,  can:coins>=compiler.convCost,  fn:()=>handleCompilerUpgrade('conv') },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(0,0,0,.3)', borderRadius:9, border:'1px solid rgba(34,197,94,.1)', marginBottom:6 }}>
                <span style={{ fontSize:18 }}>{r.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#94a3b8' }}>{r.label}</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:'#e8e8f0' }}>{r.value}</div>
                </div>
                <button onClick={r.fn} disabled={!r.can}
                  style={{ padding:'6px 12px', background: r.can ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:'none', borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, color: r.can ? '#fff' : '#1e293b', cursor: r.can ? 'pointer' : 'not-allowed' }}>
                  UP ${fmtN(r.cost)}
                </button>
              </div>
            ))}

            {!auto.compiler && (
              <button onClick={() => { handleManualCompile(); setCompilerPopupOpen(false) }}
                style={{ width:'100%', padding:'10px', background: compilerState==='IDLE'&&compilerBuffer>0 ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:`1px solid ${compilerState==='IDLE'&&compilerBuffer>0?'rgba(34,197,94,.4)':'#1a2035'}`, borderRadius:10, color: compilerState==='IDLE'&&compilerBuffer>0 ? '#fff' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, cursor: compilerState==='IDLE'&&compilerBuffer>0 ? 'pointer' : 'not-allowed', marginTop:4, marginBottom:6 }}>
                ⚙️ COMPILE BATCH
              </button>
            )}
            <AutoToggle pillar="compiler" label="AUTO COMPILE" />
          </div>
        </div>
      )}

        {/* ════ MANAGER HIRE MODAL ═════════════════════════════════════════════ */}
        {managerModal && (
          <div
            onClick={() => setManagerModal(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', backdropFilter:'blur(10px)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background:'linear-gradient(160deg,#0f1629 0%,#0d1221 100%)',
                border:`2px solid ${managerModal.type === 'elevator' ? '#60a5fa' : managerModal.type === 'sales' ? '#22c55e' : (managerModal.def?.color ?? '#a855f7')}`,
                borderRadius:20, padding: '28px 28px',
                maxWidth:340, width:'100%', textAlign:'center',
                boxShadow:`0 0 50px rgba(168,85,247,.3), 0 20px 60px rgba(0,0,0,.6)`,
              }}>
              <div style={{ marginBottom:10, display:'flex', justifyContent:'center', alignItems:'center' }}>
                {managerModal.type === 'elevator' || managerModal.type === 'sales'
                  ? <div style={{ fontSize:44 }}>{managerModal.type === 'elevator' ? '🛗' : '💼'}</div>
                  : <img src={IMG.manager} alt="manager" style={{ height:64, width:'auto', filter:`drop-shadow(0 0 10px ${managerModal.def?.color ?? '#a855f7'}cc)` }} />
                }
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, color:'#e2e8f0', marginBottom:6, letterSpacing:'1px' }}>
                HIRE MANAGER
              </div>
              <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:14, color:'#94a3b8', marginBottom:4 }}>
                {managerModal.type === 'elevator'
                  ? 'Elevator Manager — automates all bus trips'
                  : managerModal.type === 'sales'
                  ? 'Sales Manager — automates all compile cycles'
                  : `${managerModal.def?.name ?? ''} Manager — automates this floor`}
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:22, fontWeight:900, color:'#fbbf24', marginBottom:20, textShadow:'0 0 14px rgba(251,191,36,.6)' }}>
                ${fmtN(managerModal.cost)}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button
                  onClick={() => setManagerModal(null)}
                  style={{ flex:1, padding:'11px', background:'rgba(20,30,55,.8)', border:'1px solid #334155', borderRadius:10, color:'#64748b', fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, cursor:'pointer', letterSpacing:'1px' }}>
                  CANCEL
                </button>
                <button
                  disabled={coins < managerModal.cost}
                  onClick={() => handleHireManager(managerModal)}
                  style={{ flex:1, padding:'11px', background: coins >= managerModal.cost ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:`1px solid ${coins >= managerModal.cost ? '#22c55e' : '#334155'}`, borderRadius:10, color: coins >= managerModal.cost ? '#fff' : '#334155', fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, cursor: coins >= managerModal.cost ? 'pointer' : 'not-allowed', letterSpacing:'1px' }}>
                  HIRE 🤖
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ PRIME REFACTOR MODAL ═══════════════════════════════════════════ */}
        {primeRefactorModal && (() => {
          const tokensWillEarn = Math.floor(lifetime / 1_000_000)
          const newTotal       = primeTokens + tokensWillEarn
          const boostPct       = (newTotal * 2).toFixed(0)
          return (
            <div
              onClick={() => { setRefactorProcessing(false); setPrimeRefactorModal(false) }}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', backdropFilter:'blur(14px)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background:'linear-gradient(160deg,#120a2a 0%,#1a0e35 60%,#0d0a1a 100%)',
                  border:'2px solid #a855f7',
                  borderRadius:22, padding: isMobile ? '24px 20px' : '36px 40px',
                  maxWidth:460, width:'100%', textAlign:'center',
                  boxShadow:'0 0 70px rgba(168,85,247,.5), 0 0 140px rgba(168,85,247,.15), inset 0 0 40px rgba(168,85,247,.06)',
                  animation:'offline-pop 0.45s cubic-bezier(.22,1,.36,1) forwards',
                }}>
                <div style={{ fontSize: isMobile ? 40 : 64, marginBottom:10 }}>⬡</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 14 : 20, fontWeight:900, color:'#c084fc', letterSpacing:'3px', marginBottom:8, textShadow:'0 0 18px rgba(168,85,247,.8)' }}>
                  ⚠ WARNING ⚠
                </div>
                <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: isMobile ? 13 : 15, color:'#e2e8f0', lineHeight:1.65, marginBottom:18 }}>
                  This will wipe your current pipeline and reset your dollars to{' '}
                  <span style={{ color:'#fbbf24', fontWeight:700 }}>$1,000 seed funding</span>.
                  All floors above the first reset to{' '}
                  <span style={{ color:'#f97316', fontWeight:700 }}>Level 0</span>.
                </div>
                <div style={{ background:'rgba(168,85,247,.08)', border:'1px solid rgba(168,85,247,.25)', borderRadius:12, padding:'14px 18px', marginBottom:20 }}>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 11 : 13, color:'#94a3b8', marginBottom:6 }}>YOU WILL EARN</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 28 : 42, fontWeight:900, color:'#e9d5ff', letterSpacing:'2px', textShadow:'0 0 22px rgba(168,85,247,.9)', animation:'prime-token-pop 0.6s cubic-bezier(.22,1,.36,1) forwards' }}>
                    +{tokensWillEarn} PRIME TOKEN{tokensWillEarn !== 1 ? 'S' : ''}
                  </div>
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: isMobile ? 12 : 14, color:'#c084fc', marginTop:6 }}>
                    Your next run will have a permanent{' '}
                    <span style={{ color:'#fbbf24', fontWeight:700 }}>+{boostPct}% global</span>{' '}
                    speed &amp; profit boost
                  </div>
                </div>
                {tokensWillEarn <= 0 && (
                  <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:13, color:'#f97316', marginBottom:14 }}>
                    ⚠ You need at least $1,000,000 lifetime earnings to earn a token. Keep playing!
                  </div>
                )}
                <div style={{ display:'flex', gap:12 }}>
                  <button
                    onClick={() => { setRefactorProcessing(false); setPrimeRefactorModal(false) }}
                    style={{ flex:1, padding: isMobile ? '11px' : '13px', background:'rgba(20,30,55,.9)', border:'1px solid #334155', borderRadius:12, color:'#94a3b8', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 11 : 13, fontWeight:700, cursor:'pointer', letterSpacing:'1px' }}>
                    ABORT
                  </button>
                  <button
                    disabled={tokensWillEarn <= 0 || refactorProcessing}
                    onClick={() => { setRefactorProcessing(true); handlePrimeRefactor() }}
                    style={{ flex:1, padding: isMobile ? '11px' : '13px', background: tokensWillEarn > 0 && !refactorProcessing ? 'linear-gradient(135deg,#6d28d9,#a855f7)' : 'rgba(20,30,55,.8)', border:`1px solid ${tokensWillEarn > 0 && !refactorProcessing ? '#a855f7' : '#334155'}`, borderRadius:12, color: tokensWillEarn > 0 && !refactorProcessing ? '#fff' : '#334155', fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 11 : 13, fontWeight:900, cursor: tokensWillEarn > 0 && !refactorProcessing ? 'pointer' : 'not-allowed', letterSpacing:'1px', boxShadow: tokensWillEarn > 0 && !refactorProcessing ? '0 0 18px rgba(168,85,247,.5)' : 'none', transition:'all .2s' }}>
                    {refactorProcessing ? 'PROCESSING...' : 'CONFIRM REFACTOR ⬡'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ════ PRIME REFACTOR — neon screen flash ═════════════════════════════ */}
        {primeFlash && (
          <div
            style={{
              position:'fixed', inset:0, zIndex:800, pointerEvents:'none',
              background:'radial-gradient(ellipse at 50% 40%, rgba(168,85,247,.9) 0%, rgba(124,58,237,.6) 35%, rgba(10,8,26,.0) 75%)',
              animation:'prime-flash 1.8s ease-out forwards',
            }}
          />
        )}

        {/* ════ TIER UNLOCK NOTIFICATION ═══════════════════════════════════════ */}
        {tierNotif && (
          <div
            className="tier-unlock-banner"
            style={{
              position:'fixed', top: isMobile ? 70 : 80, left:'50%', transform:'translateX(-50%)',
              zIndex:850, pointerEvents:'none',
              background:'linear-gradient(135deg,#0a1a30 0%,#0d2040 100%)',
              border:`2px solid ${tierNotif.tierIdx === 3 ? '#00ffcc' : tierNotif.tierIdx === 2 ? '#a855f7' : '#60a5fa'}`,
              borderRadius:14, padding: isMobile ? '10px 20px' : '14px 32px',
              boxShadow:`0 0 40px ${tierNotif.tierIdx === 3 ? 'rgba(0,255,204,.5)' : tierNotif.tierIdx === 2 ? 'rgba(168,85,247,.5)' : 'rgba(96,165,250,.5)'}, 0 8px 30px rgba(0,0,0,.6)`,
              display:'flex', flexDirection:'column', alignItems:'center', gap:4,
              minWidth: isMobile ? 200 : 300,
            }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 9 : 11, color:'#94a3b8', letterSpacing:'3px' }}>
              🔓 TIER UNLOCKED
            </div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 16 : 22, fontWeight:900, letterSpacing:'3px',
              color: tierNotif.tierIdx === 3 ? '#00ffcc' : tierNotif.tierIdx === 2 ? '#c084fc' : '#93c5fd',
              textShadow:`0 0 18px ${tierNotif.tierIdx === 3 ? 'rgba(0,255,204,.9)' : tierNotif.tierIdx === 2 ? 'rgba(192,132,252,.9)' : 'rgba(147,197,253,.9)'}` }}>
              {tierNotif.label}
            </div>
            <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: isMobile ? 11 : 13, color:'#64748b' }}>
              ×{FLOOR_TIER_CONFIG[tierNotif.tierIdx].mult} RC multiplier active
            </div>
          </div>
        )}

        {/* ════ ANALOGY OVERLAY ════════════════════════════════════════════════ */}
        <AnalogyOverlay
          key={overlayConceptId ?? 'none'}
          conceptId={overlayConceptId}
          isVisible={overlayVisible}
          onComplete={handleOverlayComplete}
          userId={sessionId}
        />

        {/* ════ OFFLINE EARNINGS MODAL ═════════════════════════════════════════ */}
        {offlineModal && (
          <div
            onClick={() => setOfflineModal(null)}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.92)', backdropFilter:'blur(18px)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background:'linear-gradient(160deg,#0a1a10 0%,#0f2a18 60%,#0a1520 100%)',
                border:'2px solid #22c55e',
                borderRadius:22, padding: isMobile ? '24px 20px' : '40px 44px',
                maxWidth:460, width:'100%', textAlign:'center',
                boxShadow:'0 0 70px rgba(34,197,94,.4), 0 0 140px rgba(34,197,94,.12), inset 0 0 40px rgba(34,197,94,.06)',
                animation:'offline-pop 0.55s cubic-bezier(.22,1,.36,1) forwards',
              }}>
              <div style={{ fontSize: isMobile ? 44 : 72, marginBottom:14, animation:'offline-coins 2.4s ease-in-out infinite' }}>💰</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 13 : 19, fontWeight:900, color:'#22c55e', letterSpacing:'3px', marginBottom:8, textShadow:'0 0 18px rgba(34,197,94,.7)' }}>
                WELCOME BACK, TYCOON!
              </div>
              <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: isMobile ? 14 : 16, color:'#93c5fd', marginBottom:22, lineHeight:1.6 }}>
                While you were gone for{' '}
                <span style={{ color:'#fbbf24', fontWeight:700 }}>
                  {offlineModal.seconds >= 3600
                    ? `${(offlineModal.seconds / 3600).toFixed(1)}h`
                    : offlineModal.seconds >= 60
                    ? `${Math.floor(offlineModal.seconds / 60)}m ${offlineModal.seconds % 60}s`
                    : `${offlineModal.seconds}s`}
                </span>
                , your servers kept running...
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 30 : 48, fontWeight:900, color:'#fbbf24', letterSpacing:'2px', lineHeight:1, textShadow:'0 0 32px rgba(251,191,36,.8)', marginBottom:8 }}>
                +${fmtN(offlineModal.earned)}
              </div>
              <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize: isMobile ? 12 : 14, color:'#475569', marginBottom:28 }}>
                added to your TycoonCurrency
              </div>
              <button
                onClick={() => setOfflineModal(null)}
                style={{
                  padding: isMobile ? '12px 32px' : '16px 52px',
                  background:'linear-gradient(135deg,#15803d,#22c55e)',
                  border:'none', borderRadius:14, color:'#fff',
                  fontFamily:"'Orbitron',monospace", fontSize: isMobile ? 12 : 16, fontWeight:900,
                  cursor:'pointer', letterSpacing:'2px',
                  boxShadow:'0 0 28px rgba(34,197,94,.5), 0 4px 16px rgba(0,0,0,.4)',
                  transition:'transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform='scale(1.05)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='scale(1)' }}>
                CLAIM &amp; PLAY
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
