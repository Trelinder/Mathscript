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

import { useState, useEffect, useRef, useCallback } from 'react'
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
const MILESTONE_LEVELS = [25, 50, 100, 200, 300, 400, 500]

// ─── One-time automation unlock costs (Dollars) ───────────────────────────────
const AUTO_COSTS = { production: 50, dataBus: 100, compiler: 250 }

// ─── Production Nodes: 7 hero-themed floors ──────────────────────────────────
// baseCost   = dollars to unlock / first upgrade
// rcps       = Raw Code per second per upgrade level (before milestone mult)
const FLOORS = [
  { id:'spell-lab',   name:"Arcanos' Spell Lab",  short:'SPELL LAB',   desc:'Formula Casting',    hero:'Arcanos',  emoji:'🧙‍♂️', color:'#a855f7', glow:'rgba(168,85,247,.28)', bg:'rgba(168,85,247,.07)', lightBg:'#f3e8ff', baseCost:8,        rcps:0.5   },
  { id:'battle-dojo', name:"Blaze's Battle Dojo",  short:'BATTLE DOJO', desc:'Combat Equations',   hero:'Blaze',    emoji:'🔥',  color:'#f97316', glow:'rgba(249,115,22,.28)', bg:'rgba(249,115,22,.07)', lightBg:'#fff7ed', baseCost:50,       rcps:2     },
  { id:'moon-studio', name:"Luna's Moon Studio",   short:'MOON STUDIO', desc:'Visual Geometry',    hero:'Luna',     emoji:'🌙',  color:'#ec4899', glow:'rgba(236,72,153,.28)', bg:'rgba(236,72,153,.07)', lightBg:'#fdf2f8', baseCost:500,      rcps:10    },
  { id:'speed-desk',  name:"Zenith's Speed Desk",  short:'SPEED DESK',  desc:'Quick Calculations', hero:'Zenith',   emoji:'⚡',  color:'#f59e0b', glow:'rgba(245,158,11,.28)', bg:'rgba(245,158,11,.07)', lightBg:'#fefce8', baseCost:5000,     rcps:60    },
  { id:'power-core',  name:"Titan's Power Core",   short:'POWER CORE',  desc:'Heavy Algebra',      hero:'Titan',    emoji:'💪',  color:'#22c55e', glow:'rgba(34,197,94,.28)',  bg:'rgba(34,197,94,.07)',  lightBg:'#f0fdf4', baseCost:50000,    rcps:400   },
  { id:'storm-lab',   name:"Tempest's Storm Lab",  short:'STORM LAB',   desc:'Advanced Physics',   hero:'Tempest',  emoji:'🌪️', color:'#3b82f6', glow:'rgba(59,130,246,.28)', bg:'rgba(59,130,246,.07)', lightBg:'#eff6ff', baseCost:500000,   rcps:3000  },
  { id:'shadow-den',  name:"Shadow's Code Den",    short:'CODE DEN',    desc:'Logic & Proofs',     hero:'Shadow',   emoji:'🥷',  color:'#00c8ff', glow:'rgba(0,200,255,.28)',  bg:'rgba(0,200,255,.07)',  lightBg:'#e0f9ff', baseCost:7000000,  rcps:20000 },
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

// ─── Economy helpers ──────────────────────────────────────────────────────────
const milestoneMult  = (level) => 1 + MILESTONE_LEVELS.filter(m => level >= m).length
const floorRCPS      = (def, level) => level === 0 ? 0 : level * def.rcps * milestoneMult(level)
// calculateNextCost: Cost = baseCost * (growthRate ^ currentLevel)
// growthRate 1.15 for production/compiler upgrades; 1.07 for Data Bus
const calculateNextCost = (baseCost, growthRate, currentLevel) =>
  Math.ceil(baseCost * Math.pow(growthRate, currentLevel))
const levelCost      = (def, level) => calculateNextCost(def.baseCost, 1.15, level)
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

// ─── Persistence ──────────────────────────────────────────────────────────────
// v5: dollars instead of coins, rebalanced kid-friendly economy; old saves reset
const SAVE_KEY = 'mst_economy_v5'
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
}
function buildDefault() {
  return {
    // 🌱 Seed Funding: player starts with $1000 — enough to buy the first two
    //    Automation Managers right away and feel instant progress.
    coins: 1000, lifetime: 0,
    productionBuffer: 0, prodCap: 150,   // +50 for Spell Lab starting at L1
    compilerBuffer: 0,
    // Floor 1 (Spell Lab, FLOORS index 0) starts at Level 1 so the player
    // has immediate production without needing to unlock it.
    floors: FLOORS.map((_, i) => ({ level: i === 0 ? 1 : 0 })),
    bus: { ...INIT_BUS },
    compiler: { ...INIT_COMPILER },
    auto: { production: false, dataBus: false, compiler: false },
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
    compilerBuffer:   saved.compilerBuffer   ?? saved.inTransit  ?? def.compilerBuffer,
    floors:      (saved.floors?.length === FLOORS.length ? saved.floors : def.floors).map(f => ({ level: f.level ?? 0 })),
    bus:         { ...def.bus,      ...(saved.bus      ?? {}) },
    compiler:    { ...def.compiler, ...(saved.compiler ?? {}) },
    auto:        { ...def.auto,     ...(saved.auto     ?? {}) },
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
  .w-a{ animation: walk-r 3.8s ease-in-out infinite;      display:inline-block }
  .w-b{ animation: walk-l 4.5s ease-in-out infinite .8s;  display:inline-block }
  .w-c{ animation: walk-r 3.2s ease-in-out infinite 1.4s; display:inline-block }
  .w-d{ animation: walk-l 5.0s ease-in-out infinite .3s;  display:inline-block }
  .w-idle{ display:inline-block; filter:brightness(.55) }
  .w-work{ display:inline-block; animation: work-tap 1.1s ease-in-out infinite }
  .float-num{ position:fixed;pointer-events:none;font-family:'Orbitron',monospace;font-size:17px;font-weight:800;color:#fbbf24;text-shadow:0 0 8px rgba(251,191,36,.8);z-index:9999;animation:float-up 1.5s ease-out forwards }
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:#0a0e1a}
  ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}

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
  .coin-burst{ position:fixed;pointer-events:none;font-size:20px;z-index:9999; }
  .coin-burst-1{ animation:coin-pop-1 1.2s ease-out forwards }
  .coin-burst-2{ animation:coin-pop-2 1.3s ease-out forwards }
  .coin-burst-3{ animation:coin-pop-3 1.4s ease-out .1s forwards }
  .coin-burst-4{ animation:coin-pop-4 1.1s ease-out .05s forwards }
`

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function GamePlayerPage({ onAnalogyMilestone, sessionId }) {
  const phaserContainerRef = useRef(null)
  const gameRef            = useRef(null)

  useEffect(() => { syncPendingMilestones() }, [])

  // ── Analogy overlay ────────────────────────────────────────────────────────
  const [overlayConceptId, setOverlayConceptId] = useState(null)
  const [overlayVisible,   setOverlayVisible]   = useState(false)

  // ── Screen ─────────────────────────────────────────────────────────────────
  const [screen,   setScreen]   = useState('title')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 720)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [])

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

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalRCPS = floors.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level), 0)

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
  useEffect(() => { autoRef.current              = auto             }, [auto])

  // ── Persistence (debounced 2 s) ────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          coins, lifetime, productionBuffer, prodCap, compilerBuffer,
          floors: floors.map(f => ({ level: f.level })), bus, compiler, auto,
        }))
      } catch {}
    }, 2000)
    return () => clearTimeout(id)
  }, [coins, lifetime, productionBuffer, prodCap, compilerBuffer, floors, bus, compiler, auto])

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
        // Also prime localStorage so the debounced saver doesn't overwrite
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify({
            coins: hydrated.coins, lifetime: hydrated.lifetime,
            productionBuffer: hydrated.productionBuffer, prodCap: hydrated.prodCap,
            compilerBuffer: hydrated.compilerBuffer,
            floors: hydrated.floors.map(f => ({ level: f.level })),
            bus: hydrated.bus, compiler: hydrated.compiler, auto: hydrated.auto,
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
  const spawnCoinBurstRef = useRef(null)
  useEffect(() => { spawnCoinBurstRef.current = spawnCoinBurst }, [spawnCoinBurst])

  // ── Dollar burst state (4 simultaneous $ particles on compile) ──────────
  const [coinBursts, setCoinBursts] = useState([])
  const spawnCoinBurst = useCallback((x, y) => {
    const id = Date.now() + Math.random()
    setCoinBursts(b => [...b, { id, x, y }])
    setTimeout(() => setCoinBursts(b => b.filter(c => c.id !== id)), 1500)
  }, [])

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
        const earned = r2(amt * compilerRef.current.convRate)
        setCoins(c => r2(c + earned))
        setLifetime(l => r2(l + earned))
        // Primary dollar float (bottom-right compiler area)
        const bx = window.innerWidth - 60, by = window.innerHeight - 55
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
    }, 50)
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
        const rcps = floorsRef.current.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level), 0)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleManualProduce = useCallback((e) => {
    // Minimum yield = 15% of the first Automation Manager cost so a new player
    // can feel meaningful progress toward their first AUTO unlock.
    // This stays in sync automatically if AUTO_COSTS.production is adjusted.
    const minGain = AUTO_COSTS.production * 0.15
    const gain = Math.max(minGain, r2(totalRCPS * 0.1))
    setProductionBuffer(b => r2(Math.min(b + gain, prodCapRef.current)))
    playClick()
    spawnFloat('+' + fmtRC(gain) + ' RC', e?.clientX ?? window.innerWidth / 2, e?.clientY ?? window.innerHeight / 2, '#a855f7')
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
    setCoins(c => r2(c - cost))
    setFloors(prev => prev.map((fs, i) => i !== idx ? fs : { level: fs.level + qty }))
    setProdCap(cap => cap + qty * 50)
    playChaChing()
    trackEvent('tycoon_floor_upgrade', { floor: FLOORS[idx]?.id, qty, cost })
    confetti({ particleCount: Math.min(40 + qty * 2, 120), spread: 55, origin: { x: .35, y: .5 }, colors: [FLOORS[idx]?.color ?? '#00c8ff', '#fbbf24', '#a855f7'], ticks: 130 })
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
    spawnFloat(`+$${fmtN(bonus)} QUEST BONUS`, window.innerWidth / 2, window.innerHeight / 2, '#00c8ff')
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
    const ORBIT = ['🔥','🌙','⚡','💪','🌪️','🥷','🕸️']
    return (
      <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 18%, #111b38 0%, #0a0e1a 65%)', overflow:'hidden' }}>
        <style>{ANIM_CSS}</style>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(0,200,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.03) 1px,transparent 1px)', backgroundSize:'40px 40px', pointerEvents:'none' }} />
        <div style={{ position:'absolute', width:320, height:320, animation:'orbit 22s linear infinite', pointerEvents:'none' }}>
          {ORBIT.map((em, i) => {
            const a = (i / ORBIT.length) * 2 * Math.PI
            return <div key={i} style={{ position:'absolute', left: 160 + 145 * Math.cos(a) - 14, top: 160 + 145 * Math.sin(a) - 14, fontSize:24, animation:'orbit-rev 22s linear infinite', filter:'drop-shadow(0 0 6px rgba(0,200,255,.5))' }}>{em}</div>
          })}
        </div>
        <div style={{ position:'absolute', width:308, height:308, borderRadius:'50%', border:'1px solid rgba(0,200,255,.16)', pointerEvents:'none' }} />
        <div style={{ fontSize:82, animation:'hero-bob 3s ease-in-out infinite', zIndex:10, marginBottom:4, filter:'drop-shadow(0 0 22px rgba(168,85,247,.7))' }}>🧙‍♂️</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(16px,4vw,26px)', fontWeight:900, color:'#00c8ff', letterSpacing:'3px', animation:'glow-cyan 2.5s ease-in-out infinite', zIndex:10, textAlign:'center', marginBottom:2 }}>MATH SCRIPT</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(26px,6.5vw,44px)', fontWeight:900, color:'#fbbf24', letterSpacing:'5px', textShadow:'0 0 22px rgba(251,191,36,.7)', zIndex:10, textAlign:'center', marginBottom:6 }}>TYCOON</div>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#4b8fa8', letterSpacing:'4px', textTransform:'uppercase', zIndex:10, marginBottom:10 }}>BUILD · BALANCE · AUTOMATE</div>
        <div style={{ display:'flex', gap:8, marginBottom:32, zIndex:10 }}>
          {[['⚡','PRODUCE','#a855f7'],['🛗','TRANSFER','#3b82f6'],['⚙️','COMPILE','#22c55e']].map(([ic,lbl,clr]) => (
            <div key={lbl} style={{ padding:'5px 12px', background:'rgba(0,0,0,.4)', border:`1px solid ${clr}40`, borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color:clr, letterSpacing:'1px', textAlign:'center' }}>
              {ic}<br/>{lbl}
            </div>
          ))}
        </div>
        <button onClick={() => { playClick(); setScreen('play') }}
          style={{ padding:'15px 60px', background:'linear-gradient(135deg,#f59e0b,#fbbf24)', border:'none', borderRadius:12, color:'#0a0e1a', fontFamily:"'Orbitron',monospace", fontSize:18, fontWeight:900, letterSpacing:'3px', cursor:'pointer', zIndex:10, boxShadow:'0 0 28px rgba(251,191,36,.5), 0 4px 18px rgba(0,0,0,.4)', animation:'pulse 2s ease-in-out infinite' }}
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
        style={{ padding:'6px 12px', background: active ? '#dcfce7' : can ? '#dbeafe' : '#f1f5f9', border:`2px solid ${active ? '#16a34a' : can ? '#3b82f6' : '#cbd5e1'}`, borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color: active ? '#15803d' : can ? '#1d4ed8' : '#94a3b8', cursor:'pointer', letterSpacing:'1px', transition:'all .2s', whiteSpace:'nowrap' }}>
        {active ? `🤖 ${label}: ON` : can ? `🔓 $${fmtN(cost)}` : `🔒 $${fmtN(cost)}`}
      </button>
    )
  }

  return (
    <>
      <style>{ANIM_CSS}</style>

      {/* Floating coin numbers */}
      {floats.map(n => <div key={n.id} className="float-num" style={{ left:n.x-14, top:n.y-20, color:n.color??'#fbbf24' }}>{n.val}</div>)}

      {/* Coin burst particles (4 emoji scatter on each compile success) */}
      {coinBursts.flatMap(b => [1,2,3,4].map(i => (
        <span key={`${b.id}-${i}`} className={`coin-burst coin-burst-${i}`} style={{ left:b.x-10, top:b.y-10 }}>$</span>
      )))}

      {/* ════════════════════════════════════════════════════════════════════
          MASTER GRID  ·  2D cross-section dollhouse layout
          columns: [250px shaft] [1fr floors]
          rows:    [auto topbar] [1fr building] [150px ground floor]
          ════════════════════════════════════════════════════════════════════ */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'250px 1fr',
        gridTemplateRows:'auto 1fr 150px',
        height:'100vh',
        width:'100vw',
        fontFamily:"'Rajdhani',sans-serif",
        userSelect:'none',
        position:'fixed',
        inset:0,
        overflow:'hidden',
        background:'linear-gradient(180deg,#38bdf8 0%,#7dd3fc 30%,#bae6fd 60%,#86efac 85%,#4ade80 100%)',
      }}>

        {/* ── TOP BAR — grid-column: 1/span 2; grid-row: 1 ── */}
        <div style={{ gridColumn:'1/span 2', gridRow:1, background:'#1e3a5f', borderBottom:'3px solid #fbbf24', padding:'8px 18px', display:'flex', alignItems:'center', gap:14, zIndex:10, boxShadow:'0 3px 14px rgba(0,0,0,.45)' }}>
          <button onClick={() => { playClick(); setScreen('title') }}
            style={{ background:'#0f2640', border:'2px solid #fbbf24', borderRadius:8, color:'#fbbf24', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, cursor:'pointer', padding:'7px 14px', letterSpacing:'1px', flexShrink:0 }}>
            ← MAP
          </button>
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:28, fontWeight:900, color:'#4ade80' }}>$</span>
            <div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:'#fbbf24', lineHeight:1, textShadow:'0 0 14px rgba(251,191,36,.6)' }}>{fmtN(coins)}</div>
              <div style={{ fontSize:11, color:'#93c5fd', letterSpacing:'2px', textAlign:'center' }}>DOLLARS</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:18, alignItems:'center', flexShrink:0 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#a78bfa' }}>⚡ {fmtRC(productionBuffer)}</div>
              <div style={{ fontSize:10, color:'#93c5fd' }}>PROD</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#60a5fa' }}>🛗 {fmtRC(busPayload)}</div>
              <div style={{ fontSize:10, color:'#93c5fd' }}>{busState !== 'IDLE' ? busState.replace(/_/g,' ') : 'IDLE'}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#4ade80' }}>⚙️ {fmtRC(compilerBuffer)}</div>
              <div style={{ fontSize:10, color:'#93c5fd' }}>QUEUED</div>
            </div>
          </div>
        </div>

        {/* ── ELEVATOR SHAFT — grid-column:1; grid-row:2 ──────────────────────
            Strict vertical shaft. Elevator car is position:absolute and moves
            up/down purely on the `bottom` axis within this column.
            ──────────────────────────────────────────────────────────────────── */}
        <div style={{
          gridColumn:1, gridRow:2,
          position:'relative',
          display:'flex',
          flexDirection:'column',
          background:'linear-gradient(90deg,#475569 0%,#64748b 50%,#475569 100%)',
          borderRight:'4px solid #333',
          overflow:'hidden',
        }}>
          {/* ▲ Scroll UP — reveals higher, more-expensive floors */}
          <button
            onClick={() => setFloorScroll(s => Math.min(FLOORS.length - FLOORS_VIS, s + 1))}
            disabled={floorScroll >= FLOORS.length - FLOORS_VIS}
            style={{ height:44, flexShrink:0, background: floorScroll < FLOORS.length - FLOORS_VIS ? '#1d4ed8' : '#334155', border:'none', borderBottom:'3px solid #333', color: floorScroll < FLOORS.length - FLOORS_VIS ? '#fff' : '#475569', fontSize:20, fontWeight:900, cursor: floorScroll < FLOORS.length - FLOORS_VIS ? 'pointer' : 'default', transition:'all .2s' }}>▲</button>

          {/* Shaft interior — elevator runs here */}
          <div style={{ flex:1, position:'relative', cursor:'pointer' }} onClick={() => setBusPopupOpen(true)}>
            {/* Left steel rail */}
            <div style={{ position:'absolute', left:'38%', top:0, bottom:0, width:5, background:'linear-gradient(180deg,#94a3b8,#475569)', borderRadius:3 }} />
            {/* Right steel rail */}
            <div style={{ position:'absolute', right:'38%', top:0, bottom:0, width:5, background:'linear-gradient(180deg,#94a3b8,#475569)', borderRadius:3 }} />
            {/* Horizontal crossbeams at each floor division */}
            {Array.from({ length: FLOORS_VIS + 1 }).map((_, i) => (
              <div key={i} style={{ position:'absolute', left:'15%', right:'15%', top:`${(i / FLOORS_VIS) * 100}%`, height:3, background:'rgba(148,163,184,.35)', borderRadius:2 }} />
            ))}
            {/* Floor number watermarks in shaft */}
            {visFloorsDefs.map((_, vi) => (
              <div key={vi} style={{ position:'absolute', left:0, right:0, top:`${(vi / FLOORS_VIS) * 100}%`, height:`${100 / FLOORS_VIS}%`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <span style={{ fontFamily:"'Orbitron',monospace", fontSize:22, fontWeight:900, color:'rgba(226,232,240,.2)' }}>{floorNumFor(vi)}</span>
              </div>
            ))}
            {/* ── ELEVATOR CAR ── moves strictly bottom↑ within this shaft ── */}
            <div style={{
              position:'absolute',
              left:'50%',
              bottom: elevBottom,
              transform:'translateX(-50%)',
              transition:`bottom ${elevTransitionDur} linear`,
              width:60,
              height:54,
              background: busState === 'IDLE' ? '#1e293b' : 'linear-gradient(160deg,#1d4ed8,#3b82f6)',
              border:`3px solid ${busState === 'IDLE' ? '#475569' : '#60a5fa'}`,
              borderRadius:10,
              display:'flex',
              flexDirection:'column',
              alignItems:'center',
              justifyContent:'center',
              boxShadow: busState !== 'IDLE' ? '0 0 20px rgba(96,165,250,.85)' : '0 2px 8px rgba(0,0,0,.5)',
              zIndex:3,
            }}>
              <span style={{ fontSize:22 }}>{busState === 'LOADING' ? '📦' : busState === 'IDLE' ? '💤' : '🛗'}</span>
              {busPayload > 0 && <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:'#bfdbfe', fontWeight:700, lineHeight:1, marginTop:1 }}>{fmtRC(busPayload)}</div>}
            </div>
            {/* Production buffer bar — at very bottom of shaft, touching ground floor */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:36, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', padding:'0 8px 5px', gap:3 }}>
              <div style={{ width:'85%', height:6, background:'rgba(15,23,42,.5)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${prodCap > 0 ? Math.min(100, productionBuffer/prodCap*100) : 0}%`, background:'linear-gradient(90deg,#a855f7,#60a5fa)', borderRadius:3, transition:'width .5s' }} />
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#cbd5e1', letterSpacing:'1px' }}>BUFFER</div>
            </div>
          </div>

          {/* Shaft label strip */}
          <div style={{ padding:'4px 0', textAlign:'center', background:'#1e3a5f', borderTop:'3px solid #333', flexShrink:0 }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:'#93c5fd', letterSpacing:'2px' }}>SHAFT</div>
          </div>

          {/* ▼ Scroll DOWN — reveals lower, cheaper floors */}
          <button
            onClick={() => setFloorScroll(s => Math.max(0, s - 1))}
            disabled={floorScroll <= 0}
            style={{ height:44, flexShrink:0, background: floorScroll > 0 ? '#1d4ed8' : '#334155', border:'none', borderTop:'3px solid #333', color: floorScroll > 0 ? '#fff' : '#475569', fontSize:20, fontWeight:900, cursor: floorScroll > 0 ? 'pointer' : 'default', transition:'all .2s' }}>▼</button>
        </div>

        {/* ── PRODUCTION FLOORS — grid-column:2; grid-row:2 ───────────────────
            flex-direction:column-reverse → Floor 1 is rendered at the BOTTOM,
            Floor N stacks upward. Each floor is a full-width horizontal row.
            ──────────────────────────────────────────────────────────────────── */}
        <div style={{
          gridColumn:2, gridRow:2,
          display:'flex',
          flexDirection:'column-reverse',
          background:'#f8fafc',
          overflow:'hidden',
        }}>
          {/* Floors rendered in natural array order; column-reverse flips them visually */}
          {[...visFloorsDefs].reverse().map((def, vi) => {
            const visualSlot = FLOORS_VIS - 1 - vi   // map reversed render index back to original slot
            const ai      = arrayIdxFor(visualSlot)
            const lv      = visFStates[visualSlot].level
            const locked = lv === 0
            const canAfrd = coins >= (locked ? def.baseCost : levelCost(def, lv))
            const rcps   = floorRCPS(def, lv)
            const wc     = workerCount(lv)
            const fnum   = floorNumFor(visualSlot)
            return (
              /* Each floor: full-width horizontal strip with border-bottom as "floor slab" */
              <div key={def.id}
                onClick={() => { playClick(); setPopupIdx(ai) }}
                style={{
                  display:'flex',
                  flexDirection:'row',
                  alignItems:'center',
                  flex:1,
                  minHeight:0,
                  borderBottom:'4px solid #333',
                  borderLeft:`6px solid ${locked ? '#cbd5e1' : def.color}`,
                  background: locked ? 'linear-gradient(90deg,#e2e8f0,#f1f5f9)' : `linear-gradient(90deg,${def.lightBg} 0%,#ffffff 70%)`,
                  cursor:'pointer',
                  position:'relative',
                  overflow:'hidden',
                  transition:'filter .12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.filter='brightness(0.96)' }}
                onMouseLeave={e => { e.currentTarget.style.filter='brightness(1)' }}>

                {/* Ceiling accent line */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${locked?'#cbd5e1':def.color},transparent 60%)` }} />

                {/* ── WAITING PILE — far left, flush against shaft border ── */}
                <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:3, width:190, flexShrink:0, padding:'8px 12px 8px 48px', position:'relative' }}>
                  {/* Floor number badge */}
                  <div style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', background: locked ? '#94a3b8' : def.color, color:'#fff', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:900, borderRadius:6, padding:'3px 8px', minWidth:30, textAlign:'center', boxShadow: locked ? 'none' : `0 2px 10px ${def.color}60` }}>{fnum}</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, color: locked ? '#94a3b8' : '#1e293b', letterSpacing:'.5px', lineHeight:1.1 }}>{def.short}</div>
                  <div style={{ fontSize:12, color: locked ? '#94a3b8' : '#475569', fontWeight:600 }}>{def.hero} · {def.desc}</div>
                  {!locked
                    ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color: def.color, fontWeight:700 }}>+{fmtCPS(rcps)}/s · LV {lv} · {wc}w</div>
                    : <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:'#94a3b8' }}>Unlock for ${fmtN(def.baseCost)}</div>
                  }
                </div>

                {/* ── CODER DESK — centre of the floor ── */}
                <div style={{ flex:1, display:'flex', alignItems:'flex-end', justifyContent:'center', gap:18, padding:'0 12px 4px', overflow:'hidden' }}>
                  {locked ? (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}>
                      {['z','z','Z'].map((z, zi) => (
                        <span key={zi} style={{ position:'absolute', top: -4 - zi*12, left: 38 + zi*7, fontSize: 10+zi*3, color:'#94a3b8', fontWeight:700, animation:`zzz-${['a','b','c'][zi]} ${1.8+zi*0.4}s ease-in-out ${zi*0.65}s infinite`, pointerEvents:'none', zIndex:2 }}>{z}</span>
                      ))}
                      <span style={{ fontSize:32, display:'inline-block', animation:'sleeping 2.6s ease-in-out infinite', transformOrigin:'bottom center', filter:'grayscale(1) brightness(.5)', opacity:0.5 }}>{def.emoji}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:1, marginTop:-8, opacity:0.35 }}>
                        <span style={{ fontSize:13 }}>⌨️</span><span style={{ fontSize:14 }}>🖥️</span>
                      </div>
                    </div>
                  ) : (
                    Array.from({ length: Math.max(1, wc) }).map((_, wi) => (
                      <div key={wi} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                        <span style={{ fontSize:34, display:'inline-block', animation:`typing ${0.62 + wi*0.11}s ease-in-out ${wi*0.22}s infinite`, transformOrigin:'bottom center', filter:`drop-shadow(0 2px 8px ${def.color}90)` }}>{def.emoji}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:1, marginTop:-9 }}>
                          <span style={{ fontSize:13, filter:`drop-shadow(0 1px 4px ${def.color}60)` }}>⌨️</span>
                          <span style={{ fontSize:14, filter:`drop-shadow(0 1px 6px ${def.color}70)` }}>🖥️</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* ── UPGRADE BUTTON — far right ── */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flexShrink:0, width:140, padding:'0 12px' }}>
                  <button
                    onClick={e => { e.stopPropagation(); if(canAfrd) handleBuyFloor(ai, 1, locked ? def.baseCost : levelCost(def, lv)) }}
                    disabled={!canAfrd}
                    style={{ background: canAfrd ? `linear-gradient(135deg,${def.color},${def.color}cc)` : '#e2e8f0', border:`2px solid ${canAfrd ? def.color : '#cbd5e1'}`, borderRadius:10, color: canAfrd ? '#fff' : '#94a3b8', fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, cursor: canAfrd ? 'pointer' : 'not-allowed', padding:'8px 14px', letterSpacing:'1px', transition:'all .2s', width:'100%', textAlign:'center', boxShadow: canAfrd ? `0 4px 12px ${def.color}50` : 'none' }}>
                    {locked ? `🔓 UNLOCK` : `▲ LV ${lv + 1}`}
                  </button>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color: canAfrd ? '#15803d' : '#94a3b8', fontWeight:700 }}>
                    ${fmtN(locked ? def.baseCost : levelCost(def, lv))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── GROUND FLOOR — grid-column: 1/span 2; grid-row:3 ───────────────
            Spans BOTH columns. Drop-off pile is in the leftmost 250px (directly
            under the shaft). Pipeline controls + mainframe fill the remaining width.
            ──────────────────────────────────────────────────────────────────── */}
        <div style={{
          gridColumn:'1/span 2', gridRow:3,
          display:'flex',
          flexDirection:'row',
          alignItems:'stretch',
          borderTop:'4px solid #333',
          background:'linear-gradient(180deg,#1e3a5f 0%,#0f2640 100%)',
          overflow:'hidden',
        }}>

          {/* DROP-OFF PILE — exactly 250px wide, directly under the shaft */}
          <div style={{ width:250, flexShrink:0, borderRight:'4px solid #333', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'6px 8px', background:'rgba(0,0,0,.25)' }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#60a5fa', fontWeight:700, letterSpacing:'1px' }}>📦 DROP-OFF</div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:22, color:'#93c5fd', fontWeight:900, lineHeight:1 }}>{fmtRC(compilerBuffer)}</div>
            <div style={{ width:'80%', height:5, background:'rgba(96,165,250,.2)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${compiler.batchSize > 0 ? Math.min(100, compilerBuffer/compiler.batchSize*100) : 0}%`, background:'linear-gradient(90deg,#3b82f6,#60a5fa)', borderRadius:3, transition:'width .5s' }} />
            </div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#475569', letterSpacing:'1px' }}>RC QUEUED</div>
          </div>

          {/* PIPELINE CONTROLS — fills remaining width */}
          <div style={{ flex:1, display:'flex', flexDirection:'row', alignItems:'center', justifyContent:'space-evenly', padding:'0 16px', gap:10, overflow:'hidden' }}>

            {/* FLOOR 0 label */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0 }}>
              <div style={{ background:'#fbbf24', color:'#0f2640', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:900, borderRadius:7, padding:'3px 10px' }}>FLOOR 0</div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:'#93c5fd', letterSpacing:'1px' }}>SALES OFFICE</div>
              <div style={{ fontSize:20 }}>🏢</div>
            </div>

            {/* PRODUCE */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
              {auto.production
                ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#4ade80' }}>🤖 AUTO PRODUCE</div>
                : <button onClick={handleManualProduce} style={{ padding:'8px 16px', background:'#7c3aed', border:'2px solid #a78bfa', borderRadius:9, color:'#fff', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'1px', boxShadow:'0 0 12px rgba(167,139,250,.4)' }}>⚡ PRODUCE</button>
              }
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:'#a78bfa' }}>{fmtRC(productionBuffer)}/{fmtN(prodCap)} RC</div>
              <div style={{ width:90, height:4, background:'rgba(167,139,250,.15)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${prodCap > 0 ? Math.min(100, productionBuffer/prodCap*100) : 0}%`, background:'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius:3, transition:'width .5s' }} />
              </div>
              <AutoToggle pillar="production" label="PRODUCE" />
            </div>

            {/* SEND */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
              {auto.dataBus
                ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#4ade80' }}>🤖 AUTO BUS</div>
                : <button onClick={handleManualTransfer} disabled={busState !== 'IDLE' || productionBuffer === 0} style={{ padding:'8px 16px', background: busState==='IDLE'&&productionBuffer>0 ? '#1d4ed8' : '#1e293b', border:`2px solid ${busState==='IDLE'&&productionBuffer>0 ? '#60a5fa' : '#334155'}`, borderRadius:9, color: busState==='IDLE'&&productionBuffer>0 ? '#fff' : '#475569', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, cursor: busState==='IDLE'&&productionBuffer>0 ? 'pointer' : 'not-allowed', letterSpacing:'1px' }}>🛗 SEND</button>
              }
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:'#60a5fa' }}>{busState !== 'IDLE' ? busState.replace(/_/g,' ') : 'IDLE'}</div>
              <AutoToggle pillar="dataBus" label="BUS" />
              <button onClick={() => setBusPopupOpen(true)} style={{ background:'none', border:'none', color:'#3b82f6', fontFamily:"'Orbitron',monospace", fontSize:10, cursor:'pointer', padding:0 }}>⚙ UPGRADE</button>
            </div>

            {/* COMPILE — animated mainframe + office worker, far right */}
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
              <div style={{ position:'relative', display:'flex', alignItems:'flex-end', gap:5, height:58, marginBottom:2 }}>
                <span style={{ fontSize:32, display:'inline-block', animation: compilerState !== 'IDLE' ? 'mainframe-glow .85s ease-in-out infinite' : 'none', filter: compilerState !== 'IDLE' ? 'drop-shadow(0 0 8px rgba(34,197,94,.6))' : 'none' }}>🖥️</span>
                <span style={{
                  fontSize:28, display:'inline-block', transformOrigin:'bottom center',
                  animation: compilerState === 'FETCHING' ? `fetch-walk ${COMPILER_FETCH_MS}ms ease-in-out 1 forwards`
                            : compilerState === 'PROCESSING' ? 'proc-tap .85s ease-in-out infinite' : 'none',
                }}>🧑‍💼</span>
                {compilerState === 'FETCHING' && (
                  <span style={{ fontSize:16, display:'inline-block', position:'absolute', right:-4, bottom:6, animation:'file-carry .45s ease-in-out infinite', pointerEvents:'none' }}>📋</span>
                )}
                {compilerState === 'PROCESSING' && (
                  <span style={{ fontSize:14, display:'inline-block', position:'absolute', left:26, top:0, animation:'gear-spin .7s linear infinite', pointerEvents:'none' }}>⚙️</span>
                )}
              </div>
              {auto.compiler
                ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#4ade80' }}>🤖 AUTO COMPILE</div>
                : <button onClick={handleManualCompile} disabled={compilerBuffer < compiler.batchSize} style={{ padding:'8px 16px', background: compilerBuffer>=compiler.batchSize ? '#15803d' : '#1e293b', border:`2px solid ${compilerBuffer>=compiler.batchSize ? '#4ade80' : '#334155'}`, borderRadius:9, color: compilerBuffer>=compiler.batchSize ? '#fff' : '#475569', fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, cursor: compilerBuffer>=compiler.batchSize ? 'pointer' : 'not-allowed', letterSpacing:'1px' }}>⚙️ COMPILE</button>
              }
              <div style={{ width:110, height:4, background:'rgba(74,222,128,.15)', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:3, transition:'width .05s linear' }} />
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color: compilerState==='PROCESSING' ? '#4ade80' : compilerState==='FETCHING' ? '#fbbf24' : '#64748b' }}>
                {compilerState === 'PROCESSING' ? 'COMPILING...' : compilerState === 'FETCHING' ? 'FETCHING...' : 'READY'}
              </div>
              <AutoToggle pillar="compiler" label="COMPILE" />
              <button onClick={() => setCompilerPopupOpen(true)} style={{ background:'none', border:'none', color:'#22c55e', fontFamily:"'Orbitron',monospace", fontSize:10, cursor:'pointer', padding:0 }}>⚙ UPGRADE</button>
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
              <div style={{ width:54, height:54, background:'rgba(0,0,0,.5)', border:`2px solid ${popDef.color}`, borderRadius:13, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:`0 0 18px ${popDef.glow}` }}>{popDef.emoji}</div>
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

        {/* ════ ANALOGY OVERLAY ════════════════════════════════════════════════ */}
        <AnalogyOverlay
          key={overlayConceptId ?? 'none'}
          conceptId={overlayConceptId}
          isVisible={overlayVisible}
          onComplete={handleOverlayComplete}
          userId={sessionId}
        />
      </div>
    </>
  )
}
