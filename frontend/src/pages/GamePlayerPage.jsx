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

// ─── Phaser canvas reference dimensions ──────────────────────────────────────
const GAME_WIDTH  = 800
const GAME_HEIGHT = 450

// ─── Milestone levels: each threshold adds ×1 to that floor's CPS mult ───────
const MILESTONE_LEVELS = [25, 50, 100, 200, 300, 400, 500]

// ─── One-time automation unlock costs (Tycoon Coins) ─────────────────────────
const AUTO_COSTS = { production: 100, dataBus: 500, compiler: 1200 }

// ─── Production Nodes: 7 hero-themed floors ──────────────────────────────────
// baseCost   = coins to unlock / first upgrade
// rcps       = Raw Code per second per upgrade level (before milestone mult)
// costScale  = geometric cost multiplier per level (1.15 = +15% each level)
const FLOORS = [
  { id:'spell-lab',   name:"Arcanos' Spell Lab",  short:'SPELL LAB',   desc:'Formula Casting',    hero:'Arcanos',  emoji:'🧙‍♂️', color:'#a855f7', glow:'rgba(168,85,247,.28)', bg:'rgba(168,85,247,.07)', baseCost:15,       rcps:0.1,    costScale:1.15 },
  { id:'battle-dojo', name:"Blaze's Battle Dojo",  short:'BATTLE DOJO', desc:'Combat Equations',   hero:'Blaze',    emoji:'🔥',  color:'#f97316', glow:'rgba(249,115,22,.28)', bg:'rgba(249,115,22,.07)', baseCost:100,      rcps:0.5,    costScale:1.15 },
  { id:'moon-studio', name:"Luna's Moon Studio",   short:'MOON STUDIO', desc:'Visual Geometry',    hero:'Luna',     emoji:'🌙',  color:'#ec4899', glow:'rgba(236,72,153,.28)', bg:'rgba(236,72,153,.07)', baseCost:1100,     rcps:4,      costScale:1.15 },
  { id:'speed-desk',  name:"Zenith's Speed Desk",  short:'SPEED DESK',  desc:'Quick Calculations', hero:'Zenith',   emoji:'⚡',  color:'#f59e0b', glow:'rgba(245,158,11,.28)', bg:'rgba(245,158,11,.07)', baseCost:12000,    rcps:30,     costScale:1.15 },
  { id:'power-core',  name:"Titan's Power Core",   short:'POWER CORE',  desc:'Heavy Algebra',      hero:'Titan',    emoji:'💪',  color:'#22c55e', glow:'rgba(34,197,94,.28)',  bg:'rgba(34,197,94,.07)',  baseCost:130000,   rcps:200,    costScale:1.15 },
  { id:'storm-lab',   name:"Tempest's Storm Lab",  short:'STORM LAB',   desc:'Advanced Physics',   hero:'Tempest',  emoji:'🌪️', color:'#3b82f6', glow:'rgba(59,130,246,.28)', bg:'rgba(59,130,246,.07)', baseCost:1400000,  rcps:1500,   costScale:1.15 },
  { id:'shadow-den',  name:"Shadow's Code Den",    short:'CODE DEN',    desc:'Logic & Proofs',     hero:'Shadow',   emoji:'🥷',  color:'#00c8ff', glow:'rgba(0,200,255,.28)',  bg:'rgba(0,200,255,.07)',  baseCost:20000000, rcps:15000,  costScale:1.15 },
]
const FLOORS_VIS = 4
// Index of the starting floor (Code Den / Shadow's Code Den) — the bottom-most
// floor in the UI (displayFloor=1). Extracted as a constant so the buildDefault
// seed logic doesn't rely on a fragile magic number.
const CODE_DEN_INDEX = FLOORS.findIndex(f => f.id === 'shadow-den')

// ─── Data Bus defaults ────────────────────────────────────────────────────────
const INIT_BUS = {
  // Transfer Capacity: Raw Code picked up per trip
  capacity: 25, capacityLevel: 0, capacityCost: 50,
  // Travel Speed: trips per second (1 trip / 2 s default)
  speed: 0.5,  speedLevel: 0,    speedCost: 150,
}

// ─── Compiler defaults ────────────────────────────────────────────────────────
const INIT_COMPILER = {
  // Batch Size: Raw Code consumed per compile cycle
  batchSize: 5, batchLevel: 0, batchCost: 100,
  // Processing Time: seconds per compile cycle
  procTime: 3,  procLevel: 0,  procCost: 200,
  // Conversion Rate: Tycoon Coins earned per Raw Code unit
  convRate: 1,  convLevel: 0,  convCost: 500,
}

// ─── Economy helpers ──────────────────────────────────────────────────────────
const milestoneMult  = (level) => 1 + MILESTONE_LEVELS.filter(m => level >= m).length
const floorRCPS      = (def, level) => level === 0 ? 0 : level * def.rcps * milestoneMult(level)
// Progressive cost curve: gentle early (L0-4 ×1.05), moderate mid (L5-9 ×1.09), aggressive late (L10+ ×1.15)
const effectiveScale = (level) => level < 5 ? 1.05 : level < 10 ? 1.09 : 1.15
const levelCost      = (def, level) => Math.ceil(def.baseCost * Math.pow(effectiveScale(level), level))
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

// ─── Persistence ──────────────────────────────────────────────────────────────
// v4: split rawCode into productionBuffer + compilerBuffer; old saves migrate
const SAVE_KEY = 'mst_economy_v4'
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
}
function buildDefault() {
  return {
    // 🌱 Seed Funding: player starts with 150 coins — enough to immediately
    //    buy the first Automation Manager (100🪙) and feel instant progress.
    coins: 150, lifetime: 0,
    productionBuffer: 0, prodCap: 150,   // +50 for Code Den starting at L1
    compilerBuffer: 0,
    // Floor 1 (Code Den / Shadow's Code Den, FLOORS index 6) starts at Level 1
    // so the player has immediate production without needing to unlock it.
    floors: FLOORS.map((_, i) => ({ level: i === CODE_DEN_INDEX ? 1 : 0 })),
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

  // ── Auto poll: trigger bus cycle when idle and buffer is non-empty ─────────
  useEffect(() => {
    if (!auto.dataBus) return
    const id = setInterval(() => {
      if (busStateRef.current === 'IDLE' && productionBufferRef.current > 0) runBusCycle()
    }, 300)
    return () => clearInterval(id)
  }, [auto.dataBus, runBusCycle])

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
        // Localized coin float — anchored to the bottom-right compiler section
        spawnFloatRef.current?.(`+${fmtN(earned)}🪙`, window.innerWidth - 60, window.innerHeight - 55, '#22c55e')
        playChaChing()
        confetti({ particleCount: 18, spread: 35, origin: { x: .5, y: .8 }, colors: ['#fbbf24','#22c55e','#a855f7'], ticks: 80 })
        setCompileProgress(0)
        setCompilerState('IDLE')
        compilerStateRef.current = 'IDLE'
      }, procMs)
    }, COMPILER_FETCH_MS)
  }, [])

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

  // ── Auto poll: trigger compiler cycle when idle and buffer is non-empty ────
  useEffect(() => {
    if (!auto.compiler) return
    const id = setInterval(() => {
      if (compilerStateRef.current === 'IDLE' && compilerBufferRef.current > 0) runCompilerCycle()
    }, 300)
    return () => clearInterval(id)
  }, [auto.compiler, runCompilerCycle])

  // ═══════════════════════════════════════════════════════════════════════════
  // PILLAR 1 — PRODUCTION (1 s tick → productionBuffer)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!auto.production) return
    const id = setInterval(() => {
      const rcps = floorsRef.current.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level), 0)
      if (rcps <= 0) return
      setProductionBuffer(b => r2(Math.min(b + rcps, prodCapRef.current)))
    }, 1000)
    return () => clearInterval(id)
  }, [auto.production])

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const handleManualProduce = useCallback((e) => {
    // At least 15 RC per click (≥15% of first auto-manager cost) and scales
    // at 10% of current RCPS so clicks feel powerful relative to automation.
    const gain = Math.max(15, r2(totalRCPS * 0.1))
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
        return { ...prev, capacity: 10 + lv * 10, capacityLevel: lv, capacityCost: Math.ceil(50 * Math.pow(1.2, lv)) }
      }
      const lv = prev.speedLevel + 1
      return { ...prev, speed: r2(0.25 + lv * 0.05), speedLevel: lv, speedCost: Math.ceil(150 * Math.pow(1.25, lv)) }
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
        return { ...prev, batchSize: 5 + lv * 5, batchLevel: lv, batchCost: Math.ceil(100 * Math.pow(1.25, lv)) }
      } else if (type === 'proc') {
        const lv = prev.procLevel + 1
        return { ...prev, procTime: Math.max(0.5, r2(3 - lv * 0.2)), procLevel: lv, procCost: Math.ceil(200 * Math.pow(1.3, lv)) }
      }
      const lv = prev.convLevel + 1
      return { ...prev, convRate: r2(1 + lv * 0.25), convLevel: lv, convCost: Math.ceil(500 * Math.pow(1.4, lv)) }
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
    spawnFloat('+' + fmtN(bonus) + ' 🪙 QUEST BONUS', window.innerWidth / 2, window.innerHeight / 2, '#00c8ff')
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

  const visFloors = FLOORS.slice(floorScroll, floorScroll + FLOORS_VIS)
  const visFSt    = floors.slice(floorScroll, floorScroll + FLOORS_VIS)

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
        {lifetime > 0 && <div style={{ position:'absolute', bottom:20, fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#374151', letterSpacing:'1px' }}>💾 SAVED · {fmtN(lifetime)} LIFETIME COINS</div>}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PLAY SCREEN — BUILDING LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════
  const wClasses = ['w-a','w-b','w-c','w-d']

  // ── Phase 1: Smooth elevator transition matching actual travel time ──────────
  // travelMs mirrors the exact value used inside runBusCycle's setTimeout so the
  // CSS animation finishes precisely when the state-machine fires the next step.
  const travelMs = Math.max(MIN_BUS_TRAVEL_MS, Math.round(1000 / bus.speed))
  // Non-zero small value used when the elevator is not moving: prevents a
  // single-frame flicker that can appear when transition flips from 0s to Xs
  // in the same React commit as a position change on the next state transition.
  const ELEV_INSTANT = '0.1s'
  // During travel states apply a linear transition; for IDLE / LOADING the
  // elevator is already at its target position so use the instant value.
  const elevTransitionDur = (busState === 'TRAVELING_TO_PROD' || busState === 'TRAVELING_TO_COMPILER')
    ? `${(travelMs / 1000).toFixed(2)}s`
    : ELEV_INSTANT
  // Elevator car Y: sets the TARGET bottom% — CSS transition handles animation
  const elevBottom = { IDLE:'5%', TRAVELING_TO_PROD:'72%', LOADING:'72%', TRAVELING_TO_COMPILER:'5%' }[busState] ?? '5%'

  // Shared AutoToggle button (used inside bus + compiler popups)
  const AutoToggle = ({ pillar }) => {
    const active = auto[pillar], cost = AUTO_COSTS[pillar], can = coins >= cost
    return (
      <button onClick={() => handleToggleAuto(pillar)}
        style={{ width:'100%', padding:'8px', background: active ? 'rgba(34,197,94,.1)' : can ? 'rgba(0,200,255,.05)' : 'rgba(10,15,30,.8)', border:`1px solid ${active ? '#22c55e50' : can ? 'rgba(0,200,255,.2)' : '#0f1e3a'}`, borderRadius:9, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: active ? '#22c55e' : can ? '#00c8ff' : '#1e293b', cursor:'pointer', letterSpacing:'1px', transition:'all .2s' }}>
        {active ? '🤖 AUTO: ON' : can ? `🔓 AUTO ${fmtN(cost)}🪙` : `🔒 AUTO ${fmtN(cost)}🪙`}
      </button>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'#080c1a', overflow:'hidden', fontFamily:"'Rajdhani',sans-serif" }}>
      <style>{ANIM_CSS}</style>

      {/* Floating numbers */}
      {floats.map(n => <div key={n.id} className="float-num" style={{ left:n.x-14, top:n.y-20, color:n.color??'#fbbf24' }}>{n.val}</div>)}

      {/* ════ TOP BAR ════════════════════════════════════════════════════════ */}
      <div style={{ background:'linear-gradient(180deg,#0c1530 0%,#090e1e 100%)', borderBottom:'2px solid rgba(251,191,36,.15)', padding:'7px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <button onClick={() => { playClick(); setScreen('title') }}
          style={{ background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', borderRadius:8, color:'#94a3b8', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, cursor:'pointer', padding:'5px 9px', flexShrink:0, letterSpacing:'1px' }}>◀ MAP</button>

        {/* Coins — prominent */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>🪙</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:20, fontWeight:900, color:'#fbbf24', lineHeight:1, textShadow:'0 0 18px rgba(251,191,36,.45)' }}>{fmtN(coins)}</div>
            <div style={{ fontSize:7, color:'#4b5563', letterSpacing:'2px', textAlign:'center' }}>TYCOON COINS</div>
          </div>
        </div>

        {/* Phase 4: pipeline mini-stats */}
        <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:10 }}>⚡</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:'#a855f7' }}>{fmtRC(productionBuffer)}</span>
            <span style={{ color:'#374151', fontSize:8 }}>/{fmtN(prodCap)} PROD</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:10 }}>🛗</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:'#3b82f6' }}>{fmtRC(busPayload)}</span>
            <span style={{ color:'#374151', fontSize:8 }}>{busState !== 'IDLE' ? busState.replace(/_/g,' ') : 'IDLE'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:10 }}>⚙️</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:'#22c55e' }}>{fmtRC(compilerBuffer)}</span>
            <span style={{ color:'#374151', fontSize:8 }}>QUEUED</span>
          </div>
        </div>
      </div>

      {/* ════ BUILDING ════════════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* ── Elevator shaft (left) ──────────────────────────────────────── */}
        <div style={{ width:74, flexShrink:0, display:'flex', flexDirection:'column', background:'rgba(4,7,18,.97)', borderRight:'2px solid #0d1a32' }}>

          {/* Scroll UP */}
          <button onClick={() => setFloorScroll(s => Math.max(0, s-1))} disabled={floorScroll === 0}
            style={{ height:40, flexShrink:0, background: floorScroll>0 ? 'rgba(59,130,246,.12)' : 'transparent', border:'none', borderBottom:'1px solid #0d1a32', color: floorScroll>0 ? '#3b82f6' : '#1a2a4a', fontSize:20, cursor: floorScroll>0 ? 'pointer' : 'default', transition:'all .2s' }}>↑</button>

          {/* Shaft — click to open bus popup */}
          <div style={{ flex:1, position:'relative', overflow:'hidden', cursor:'pointer' }} onClick={() => setBusPopupOpen(true)}>
            {/* Guide rails */}
            <div style={{ position:'absolute', left:20, top:0, bottom:32, width:3, background:'linear-gradient(180deg,rgba(59,130,246,.4),rgba(59,130,246,.08))', borderRadius:2 }} />
            <div style={{ position:'absolute', right:20, top:0, bottom:32, width:3, background:'linear-gradient(180deg,rgba(59,130,246,.4),rgba(59,130,246,.08))', borderRadius:2 }} />
            {[0,1,2,3,4,5].map(i => (
              <div key={i} style={{ position:'absolute', left:20, right:20, top:`${6+i*15}%`, height:2, background:'rgba(59,130,246,.06)' }} />
            ))}

            {/* Elevator car — transition-duration exactly matches bus travel speed */}
            <div
              style={{
                position:'absolute', left:'50%', bottom: elevBottom,
                transform:'translateX(-50%)',
                transition: `bottom ${elevTransitionDur} linear`,
                width:40, height:48,
                background: busState === 'IDLE'
                  ? 'linear-gradient(160deg,rgba(20,30,60,.9),rgba(10,16,36,.9))'
                  : 'linear-gradient(160deg,rgba(30,58,138,.9),rgba(59,130,246,.2))',
                border:`2px solid rgba(59,130,246,${busState==='IDLE'?.2:.85})`,
                borderRadius:8,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                boxShadow: busState !== 'IDLE' ? '0 0 20px rgba(59,130,246,.6),0 0 40px rgba(59,130,246,.15)' : 'none',
                animation: busState === 'LOADING' ? 'load-flash .5s ease-in-out infinite' : 'none',
                zIndex:2,
              }}>
              <span style={{ fontSize:18 }}>
                {busState === 'LOADING' ? '📦' : busState === 'IDLE' ? '💤' : '🛗'}
              </span>
              {busPayload > 0 && (
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:6, color:'#93c5fd', lineHeight:1, marginTop:1, textAlign:'center' }}>{fmtRC(busPayload)}</div>
              )}
            </div>

            {/* Production buffer indicator bar at shaft bottom */}
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:30, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', padding:'0 4px 3px', gap:2 }}>
              <div style={{ width:'84%', height:4, background:'rgba(168,85,247,.1)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${prodCap > 0 ? Math.min(100, productionBuffer/prodCap*100) : 0}%`, background:'linear-gradient(90deg,#a855f7,#3b82f6)', borderRadius:2, transition:'width .5s' }} />
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace", fontSize:5, color:'#1e3a5f', letterSpacing:'.8px' }}>LIFT</div>
            </div>
          </div>

          {/* Scroll DOWN */}
          <button onClick={() => setFloorScroll(s => Math.min(FLOORS.length-FLOORS_VIS, s+1))} disabled={floorScroll+FLOORS_VIS >= FLOORS.length}
            style={{ height:40, flexShrink:0, background: floorScroll+FLOORS_VIS<FLOORS.length ? 'rgba(59,130,246,.12)' : 'transparent', border:'none', borderTop:'1px solid #0d1a32', color: floorScroll+FLOORS_VIS<FLOORS.length ? '#3b82f6' : '#1a2a4a', fontSize:20, cursor: floorScroll+FLOORS_VIS<FLOORS.length ? 'pointer' : 'default', transition:'all .2s' }}>↓</button>
        </div>

        {/* ── Floor rooms ────────────────────────────────────────────────── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          {visFloors.map((def, vi) => {
            const ri      = floorScroll + vi
            const fs      = visFSt[vi]
            const lv      = fs.level
            const locked  = lv === 0
            const canAfrd = coins >= (locked ? def.baseCost : levelCost(def, lv))
            const rcps    = floorRCPS(def, lv)
            const wc      = workerCount(lv)
            const displayFloor = FLOORS.length - ri   // highest number at top
            return (
              <div key={def.id}
                onClick={() => { playClick(); setPopupIdx(ri) }}
                style={{ flex:1, display:'flex', alignItems:'stretch', borderBottom:'2px solid #08101e', background: locked ? 'linear-gradient(90deg,#08101e,#090d1c)' : `linear-gradient(90deg,${def.bg} 0%,rgba(8,12,26,.97) 65%)`, cursor:'pointer', position:'relative', overflow:'hidden', transition:'filter .15s' }}
                onMouseEnter={e => { e.currentTarget.style.filter='brightness(1.18)' }}
                onMouseLeave={e => { e.currentTarget.style.filter='brightness(1)' }}>

                {/* Ceiling accent */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,${locked?'#0f1e3a':def.color}30,transparent 60%)` }} />

                {/* Floor number badge */}
                <div style={{ width:38, flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.32)', borderRight:`1px solid ${locked?'#0d1a32':def.color+'28'}` }}>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16, fontWeight:900, color: locked ? '#1e293b' : def.color, lineHeight:1 }}>{displayFloor}</div>
                  <div style={{ fontSize:6, color:'#374151', letterSpacing:'.8px', marginTop:1 }}>FLR</div>
                </div>

                {/* Room interior */}
                <div style={{ flex:1, padding:'4px 6px 4px 8px', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color: locked ? '#1e293b' : '#8b9cc4', letterSpacing:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{def.short}</div>
                    {!locked && <div style={{ fontFamily:"'Orbitron',monospace", fontSize:8, color:'#22c55e', flexShrink:0, marginLeft:4 }}>+{fmtCPS(rcps)}/s</div>}
                  </div>

                  {/* Workers walking */}
                  <div style={{ position:'relative', flex:1, minHeight:0, overflow:'hidden' }}>
                    {locked ? (
                      <div style={{ display:'flex', alignItems:'center', height:'100%', gap:8, paddingTop:4 }}>
                        <span style={{ fontSize:24, filter:'grayscale(1)', opacity:0.08 }}>{def.emoji}</span>
                        <div>
                          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#374151' }}>LOCKED</div>
                          <div style={{ fontSize:9, color:'#1e293b' }}>🪙 {fmtN(def.baseCost)}</div>
                        </div>
                      </div>
                    ) : (
                      Array.from({length: wc}, (_, wi) => {
                        // Phase 2: distinct visual states per production status
                        // idle   → production manager not yet bought
                        // w-work → lead worker bobs at their desk (auto ON, slot 0)
                        // w-a/b/c/d → other workers walk left/right (auto ON)
                        const wClass = !auto.production
                          ? 'w-idle'
                          : wi === 0 ? 'w-work' : wClasses[(wi - 1) % 4]
                        return (
                          <span key={wi} className={wClass}
                            style={{ fontSize:26, position:'absolute', bottom:0, left:`${6 + wi * 22}%`, filter:`drop-shadow(0 2px 8px ${def.color}80)`, zIndex:1 }}>
                            {def.emoji}
                          </span>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Level badge (right) */}
                <div style={{ width:44, flexShrink:0, background:'rgba(0,0,0,.45)', borderLeft:`2px solid ${locked?'#0d1525':def.color+'40'}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  {locked ? (
                    <>
                      <span style={{ fontSize:16, opacity:0.25 }}>🔒</span>
                      {canAfrd && <div style={{ fontSize:6, color:def.color, fontFamily:"'Orbitron',monospace", marginTop:2 }}>TAP!</div>}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:7, color:'#4b5563', fontFamily:"'Orbitron',monospace", letterSpacing:'1px' }}>LEVEL</div>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:900, color:def.color, lineHeight:1 }}>{lv}</div>
                      {canAfrd && <div style={{ fontSize:6, color:'#22c55e', fontFamily:"'Orbitron',monospace", marginTop:1 }}>▲ UP</div>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ════ BOTTOM BAR (3 sections) ════════════════════════════════════════ */}
      <div style={{ display:'flex', background:'linear-gradient(0deg,#060a14 0%,#080c1a 100%)', borderTop:'2px solid #0d1828', flexShrink:0 }}>

        {/* PRODUCTION */}
        <div style={{ flex:1, padding:'7px 8px', borderRight:'1px solid #0f1e3a', display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11 }}>⚡</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color:'#a855f7', letterSpacing:'1px' }}>PRODUCE</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:8, color:'#22c55e', marginLeft:'auto' }}>+{fmtCPS(totalRCPS)}/s</span>
          </div>
          {/* Phase 4: buffer bar */}
          <div style={{ height:3, background:'rgba(255,255,255,.04)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${prodCap > 0 ? Math.min(100, productionBuffer/prodCap*100) : 0}%`, background:'linear-gradient(90deg,#7c3aed,#a855f7)', borderRadius:2, transition:'width .5s' }} />
          </div>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color:'#4b5563' }}>{fmtRC(productionBuffer)}/{fmtN(prodCap)} RC</div>
          {auto.production
            ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color:'#22c55e' }}>🤖 AUTO</div>
            : <button onClick={handleManualProduce} style={{ padding:'4px', background:'rgba(124,58,237,.25)', border:'1px solid rgba(167,139,250,.2)', borderRadius:5, color:'#c4b5fd', fontFamily:"'Orbitron',monospace", fontSize:7, fontWeight:700, cursor:'pointer', letterSpacing:'1px' }}>⚡ PRODUCE</button>}
          <button onClick={() => handleToggleAuto('production')}
            style={{ background:'none', border:'none', cursor: coins >= AUTO_COSTS.production || auto.production ? 'pointer' : 'default', fontFamily:"'Orbitron',monospace", fontSize:6, color: auto.production ? '#22c55e' : coins >= AUTO_COSTS.production ? '#3b82f6' : '#1e293b', letterSpacing:'1px', padding:0, textAlign:'left' }}>
            {auto.production ? '✓ AUTO ON' : `🔒 AUTO ${fmtN(AUTO_COSTS.production)}🪙`}
          </button>
        </div>

        {/* DATA BUS */}
        <div style={{ flex:1, padding:'7px 8px', borderRight:'1px solid #0f1e3a', display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11 }}>🛗</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color:'#3b82f6', letterSpacing:'1px' }}>DATA BUS</span>
          </div>
          {/* Phase 4: state label */}
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color: busState !== 'IDLE' ? '#3b82f6' : '#374151' }}>
            {busState === 'IDLE' ? '● IDLE' : busState === 'TRAVELING_TO_PROD' ? '▲ TO FLOORS' : busState === 'LOADING' ? '📦 LOADING' : '▼ TO OFFICE'}
          </div>
          <div style={{ fontSize:7, color:'#374151' }}>{bus.capacity}RC · {(1/bus.speed).toFixed(1)}s/trip</div>
          {auto.dataBus
            ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color:'#22c55e' }}>🤖 AUTO</div>
            : <button onClick={handleManualTransfer} disabled={busState !== 'IDLE' || productionBuffer <= 0}
                style={{ padding:'4px', background: busState==='IDLE' && productionBuffer>0 ? 'rgba(29,78,216,.35)' : 'rgba(10,15,30,.5)', border:`1px solid ${busState==='IDLE'&&productionBuffer>0?'rgba(59,130,246,.3)':'#0f1e3a'}`, borderRadius:5, color: busState==='IDLE'&&productionBuffer>0 ? '#93c5fd' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:7, fontWeight:700, cursor: busState==='IDLE'&&productionBuffer>0 ? 'pointer' : 'not-allowed', letterSpacing:'1px' }}>
                🛗 SEND
              </button>}
          <button onClick={() => setBusPopupOpen(true)}
            style={{ background:'none', border:'none', cursor:'pointer', fontFamily:"'Orbitron',monospace", fontSize:6, color:'#1e40af', letterSpacing:'1px', padding:0, textAlign:'left' }}>⚙ UPGRADE BUS</button>
        </div>

        {/* COMPILER / SALES OFFICE */}
        <div style={{ flex:1, padding:'7px 8px', display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:11, animation: compilerState==='PROCESSING' ? 'gear-spin 1s linear infinite' : 'none', display:'inline-block' }}>⚙️</span>
            <span style={{ fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color:'#22c55e', letterSpacing:'1px' }}>OFFICE</span>
          </div>
          {/* Phase 4: processing bar */}
          <div style={{ height:3, background:'rgba(255,255,255,.04)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:2, transition:'width .05s linear' }} />
          </div>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color: compilerState!=='IDLE' ? '#22c55e' : '#374151', animation: compilerState==='FETCHING' ? 'fetch-pulse .6s ease-in-out infinite' : 'none' }}>
            {compilerState==='IDLE' ? `● ${fmtRC(compilerBuffer)}RC QUEUED` : compilerState==='FETCHING' ? '⬇ FETCHING' : `⚙ ${compileProgress.toFixed(0)}%`}
          </div>
          {auto.compiler
            ? <div style={{ fontFamily:"'Orbitron',monospace", fontSize:7, color:'#22c55e' }}>🤖 AUTO</div>
            : <button onClick={handleManualCompile} disabled={compilerState!=='IDLE' || compilerBuffer<=0}
                style={{ padding:'4px', background: compilerState==='IDLE'&&compilerBuffer>0 ? 'rgba(21,128,61,.3)' : 'rgba(10,15,30,.5)', border:`1px solid ${compilerState==='IDLE'&&compilerBuffer>0?'rgba(34,197,94,.3)':'#0f1e3a'}`, borderRadius:5, color: compilerState==='IDLE'&&compilerBuffer>0 ? '#86efac' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:7, fontWeight:700, cursor: compilerState==='IDLE'&&compilerBuffer>0 ? 'pointer' : 'not-allowed', letterSpacing:'1px' }}>
                ⚙️ COMPILE
              </button>}
          <button onClick={() => setCompilerPopupOpen(true)}
            style={{ background:'none', border:'none', cursor:'pointer', fontFamily:"'Orbitron',monospace", fontSize:6, color:'#14532d', letterSpacing:'1px', padding:0, textAlign:'left' }}>⚙ UPGRADE</button>
        </div>
      </div>

      {/* ════ HIDDEN PHASER ══════════════════════════════════════════════════ */}
      <div id="phaser-game-container" ref={phaserContainerRef}
        style={{ position:'absolute', left:'-9999px', top:'-9999px', opacity:0, pointerEvents:'none' }} />

      {/* ════ FLOOR UPGRADE POPUP ═════════════════════════════════════════════ */}
      {popDef && popFloor && (
        <div onClick={() => setPopupIdx(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.82)', backdropFilter:'blur(8px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:14 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(160deg,#0f1629 0%,#0d1221 100%)', border:`2px solid ${popDef.color}`, borderRadius:18, padding:20, width:'100%', maxWidth:360, boxShadow:`0 0 50px ${popDef.glow},0 20px 60px rgba(0,0,0,.6)`, position:'relative', maxHeight:'90vh', overflowY:'auto' }}>
            <button onClick={() => setPopupIdx(null)}
              style={{ position:'absolute', top:12, right:12, width:28, height:28, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:14, cursor:'pointer' }}>✕</button>

            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:54, height:54, background:'rgba(0,0,0,.5)', border:`2px solid ${popDef.color}`, borderRadius:13, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:`0 0 18px ${popDef.glow}` }}>{popDef.emoji}</div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:popDef.color, letterSpacing:'1px' }}>{popDef.short}</div>
                <div style={{ fontSize:11, color:'#64748b' }}>{popDef.hero} · {popDef.desc}</div>
                <div style={{ display:'inline-block', background:'rgba(0,0,0,.5)', border:`1px solid ${popDef.color}60`, borderRadius:5, padding:'2px 8px', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color:popDef.color, marginTop:4 }}>LEVEL {popFloor.level}</div>
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
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5, fontSize:11 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:10 }}>{val}</span>
                    {nxt && <span style={{ color:'#22c55e', fontSize:10 }}>{nxt}</span>}
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
                  style={{ flex:1, padding:'8px 4px', background: buyQty===v ? clr : 'rgba(15,22,42,.8)', border:`1px solid ${buyQty===v ? clr : 'rgba(255,255,255,.08)'}`, borderRadius:8, color: buyQty===v ? '#fff' : '#64748b', fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, cursor:'pointer', transition:'all .15s' }}>{l}</button>
              ))}
            </div>

            <div style={{ textAlign:'center', marginBottom:10, fontSize:12, color:'#4b8fa8', minHeight:18 }}>
              {popQty > 0
                ? <>Upgrade <span style={{ color:popDef.color, fontWeight:700 }}>×{fmtN(popQty)}</span> for <span style={{ color:'#fbbf24', fontWeight:700 }}>🪙 {fmtN(popCost)}</span></>
                : <span style={{ color:'#1e293b' }}>Not enough coins</span>}
            </div>

            <button disabled={popQty===0 || coins<popCost}
              onClick={() => { if(popQty>0&&coins>=popCost) handleBuyFloor(popupIdx,popQty,popCost) }}
              style={{ width:'100%', padding:'14px', background:(popQty>0&&coins>=popCost)?`linear-gradient(135deg,${popDef.color},${popDef.color}90)`:'rgba(20,30,55,.6)', border:`1px solid ${(popQty>0&&coins>=popCost)?popDef.color:'#1a2035'}`, borderRadius:12, color:(popQty>0&&coins>=popCost)?'#fff':'#1e293b', fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700, letterSpacing:'1px', cursor:(popQty>0&&coins>=popCost)?'pointer':'not-allowed', boxShadow:(popQty>0&&coins>=popCost)?`0 0 24px ${popDef.glow}`:'none', transition:'all .2s' }}>
              {popFloor.level === 0 ? '🔓 UNLOCK FLOOR' : `UPGRADE  🪙 ${fmtN(popCost)}`}
            </button>
          </div>
        </div>
      )}

      {/* ════ DATA BUS UPGRADE POPUP ══════════════════════════════════════════ */}
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
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#3b82f6' }}>DATA BUS</div>
                <div style={{ fontSize:11, color:'#64748b' }}>Elevator · Transfer System</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color: busState!=='IDLE' ? '#22c55e' : '#374151', marginTop:4 }}>
                  {busState==='IDLE'?'● IDLE':busState==='LOADING'?'📦 LOADING':busState==='TRAVELING_TO_PROD'?'▲ HEADING UP':'▼ DELIVERING'}
                </div>
              </div>
            </div>

            <div style={{ background:'rgba(59,130,246,.05)', border:'1px solid rgba(59,130,246,.15)', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[['CAPACITY',`${bus.capacity} RC/trip`],['TRAVEL SPEED',`${(1/bus.speed).toFixed(1)}s/trip`],['PAYLOAD',`${fmtRC(busPayload)} RC on board`],['PROD BUFFER',`${fmtRC(productionBuffer)}/${fmtN(prodCap)} RC`]].map(([lbl,val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:10 }}>{val}</span>
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
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8' }}>{r.label}</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#e8e8f0' }}>{r.value}</div>
                </div>
                <button onClick={r.fn} disabled={!r.can}
                  style={{ padding:'6px 12px', background: r.can ? 'linear-gradient(135deg,#1d4ed8,#3b82f6)' : 'rgba(20,30,55,.8)', border:'none', borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: r.can ? '#fff' : '#1e293b', cursor: r.can ? 'pointer' : 'not-allowed' }}>
                  UP<br/>{fmtN(r.cost)}🪙
                </button>
              </div>
            ))}
            <AutoToggle pillar="dataBus" />
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
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#22c55e' }}>SALES OFFICE</div>
                <div style={{ fontSize:11, color:'#64748b' }}>Compiler · Coin Generator</div>
              </div>
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ height:6, background:'rgba(255,255,255,.05)', borderRadius:3, overflow:'hidden', marginBottom:3 }}>
                <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:3, transition:'width .05s linear' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#4b5563' }}>
                <span style={{ animation: compilerState==='FETCHING' ? 'fetch-pulse .6s ease-in-out infinite' : 'none' }}>
                  {compilerState==='IDLE' ? 'IDLE' : compilerState==='FETCHING' ? 'FETCHING...' : 'PROCESSING'}
                </span>
                <span style={{ color:'#22c55e' }}>{compileProgress.toFixed(0)}%</span>
              </div>
            </div>

            <div style={{ background:'rgba(34,197,94,.04)', border:'1px solid rgba(34,197,94,.12)', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[
                ['BATCH SIZE',  `${compiler.batchSize} RC/batch`],
                ['PROC SPEED',  `${compiler.procTime}s/batch`],
                ['CONV RATE',   `×${compiler.convRate.toFixed(2)} coins/RC`],
                ['QUEUED',      `${fmtRC(compilerBuffer)} RC`],
                ['COINS/BATCH', `${fmtN(compiler.batchSize * compiler.convRate)}🪙`],
              ].map(([lbl,val]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <span style={{ color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:10 }}>{val}</span>
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
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8' }}>{r.label}</div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#e8e8f0' }}>{r.value}</div>
                </div>
                <button onClick={r.fn} disabled={!r.can}
                  style={{ padding:'6px 12px', background: r.can ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:'none', borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: r.can ? '#fff' : '#1e293b', cursor: r.can ? 'pointer' : 'not-allowed' }}>
                  UP<br/>{fmtN(r.cost)}🪙
                </button>
              </div>
            ))}

            {!auto.compiler && (
              <button onClick={() => { handleManualCompile(); setCompilerPopupOpen(false) }}
                style={{ width:'100%', padding:'10px', background: compilerState==='IDLE'&&compilerBuffer>0 ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:`1px solid ${compilerState==='IDLE'&&compilerBuffer>0?'rgba(34,197,94,.4)':'#1a2035'}`, borderRadius:10, color: compilerState==='IDLE'&&compilerBuffer>0 ? '#fff' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, cursor: compilerState==='IDLE'&&compilerBuffer>0 ? 'pointer' : 'not-allowed', marginTop:4, marginBottom:6 }}>
                ⚙️ COMPILE BATCH
              </button>
            )}
            <AutoToggle pillar="compiler" />
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
  )
}
