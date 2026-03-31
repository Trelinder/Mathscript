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
const AUTO_COSTS = { production: 250, dataBus: 750, compiler: 1500 }

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

// ─── Data Bus defaults ────────────────────────────────────────────────────────
const INIT_BUS = {
  // Transfer Capacity: Raw Code picked up per trip
  capacity: 10, capacityLevel: 0, capacityCost: 50,
  // Travel Speed: trips per second (1 trip / 4 s default)
  speed: 0.25,  speedLevel: 0,    speedCost: 150,
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
const milestoneMult = (level) => 1 + MILESTONE_LEVELS.filter(m => level >= m).length
const floorRCPS     = (def, level) => level === 0 ? 0 : level * def.rcps * milestoneMult(level)
const levelCost     = (def, level) => Math.ceil(def.baseCost * Math.pow(def.costScale, level))
const nextML        = (level) => MILESTONE_LEVELS.find(m => m > level) ?? null
const workerCount   = (level) => level === 0 ? 0 : Math.min(1 + Math.floor(Math.log(level + 1) / Math.log(5)), 4)

function getBulkCost(def, startLevel, qty) {
  const s = def.costScale
  return Math.ceil(def.baseCost * Math.pow(s, startLevel) * (Math.pow(s, qty) - 1) / (s - 1))
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
function fmtRC(n) { return n < 10 ? n.toFixed(1) : fmtN(n) }
function fmtCPS(n) { return n < 0.01 ? '0' : n < 10 ? n.toFixed(2) : fmtN(n) }

// ─── Persistence ──────────────────────────────────────────────────────────────
const SAVE_KEY = 'mst_economy_v3'
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') } catch { return null }
}
function buildDefault() {
  return {
    coins: 0, lifetime: 0,
    rawCode: 0, rawCodeCap: 100,
    inTransit: 0,
    floors: FLOORS.map(() => ({ level: 0 })),
    bus: { ...INIT_BUS },
    compiler: { ...INIT_COMPILER },
    auto: { production: false, dataBus: false, compiler: false },
  }
}
function hydrate(saved) {
  const def = buildDefault()
  if (!saved) return def
  return {
    coins:       saved.coins      ?? def.coins,
    lifetime:    saved.lifetime   ?? def.lifetime,
    rawCode:     saved.rawCode    ?? def.rawCode,
    rawCodeCap:  saved.rawCodeCap ?? def.rawCodeCap,
    inTransit:   saved.inTransit  ?? def.inTransit,
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

// ─── Shared CSS ───────────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes walk-r  { 0%,100%{transform:translateX(0) scaleX(1)}  45%{transform:translateX(28px) scaleX(1)}  55%{transform:translateX(28px) scaleX(-1)} 95%{transform:translateX(0) scaleX(-1)} }
  @keyframes walk-l  { 0%,100%{transform:translateX(0) scaleX(-1)} 45%{transform:translateX(-28px) scaleX(-1)} 55%{transform:translateX(-28px) scaleX(1)} 95%{transform:translateX(0) scaleX(1)} }
  @keyframes float-up{ 0%{opacity:1;transform:translateY(0) scale(1)} 60%{opacity:.9;transform:translateY(-44px) scale(1.15)} 100%{opacity:0;transform:translateY(-80px) scale(.8)} }
  @keyframes glow-cyan{ 0%,100%{text-shadow:0 0 16px rgba(0,200,255,.5)} 50%{text-shadow:0 0 32px rgba(0,200,255,1),0 0 56px rgba(0,200,255,.4)} }
  @keyframes pulse    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.85;transform:scale(1.04)} }
  @keyframes orbit    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes orbit-rev{ from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
  @keyframes hero-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  @keyframes gear-spin{ from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes lift-up  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
  @keyframes bar-flash{ 0%,100%{opacity:1} 50%{opacity:.5} }
  @keyframes coin-pop { 0%{opacity:1;transform:scale(.8)} 30%{transform:scale(1.3)} 100%{opacity:0;transform:scale(1) translateY(-40px)} }
  .w-a{ animation: walk-r 3.8s ease-in-out infinite;     display:inline-block }
  .w-b{ animation: walk-l 4.5s ease-in-out infinite .8s; display:inline-block }
  .w-c{ animation: walk-r 3.2s ease-in-out infinite 1.4s;display:inline-block }
  .w-d{ animation: walk-l 5.0s ease-in-out infinite .3s; display:inline-block }
  .float-num{ position:fixed;pointer-events:none;font-family:'Orbitron',monospace;font-size:17px;font-weight:800;color:#fbbf24;text-shadow:0 0 8px rgba(251,191,36,.8);z-index:9999;animation:float-up .9s ease-out forwards }
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
  const [screen,     setScreen]     = useState('title') // 'title' | 'play'
  const [activeTab,  setActiveTab]  = useState('prod')  // mobile: 'prod'|'bus'|'comp'
  const [isMobile,   setIsMobile]   = useState(() => typeof window !== 'undefined' && window.innerWidth < 720)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 720)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [])

  // ── Economy state (hydrated from localStorage) ─────────────────────────────
  const init = hydrate(loadSave())

  const [coins,      setCoins]      = useState(init.coins)
  const [lifetime,   setLifetime]   = useState(init.lifetime)
  const [rawCode,    setRawCode]    = useState(init.rawCode)
  const [rawCodeCap, setRawCodeCap] = useState(init.rawCodeCap)
  const [inTransit,  setInTransit]  = useState(init.inTransit)
  const [floors,     setFloors]     = useState(init.floors)   // [{ level }]
  const [bus,        setBus]        = useState(init.bus)
  const [compiler,   setCompiler]   = useState(init.compiler)
  const [auto,       setAuto]       = useState(init.auto)

  // Floating coin animations
  const [floats, setFloats] = useState([])

  // Floor popup
  const [popupIdx,   setPopupIdx]   = useState(null)
  const [buyQty,     setBuyQty]     = useState('1')
  const [floorScroll,setFloorScroll]= useState(0)

  // Compiler progress bar (0–100, driven by interval)
  const [compileProgress, setCompileProgress] = useState(0)

  // Elevator animation flag
  const [busMoving, setBusMoving] = useState(false)

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totalRCPS = floors.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level), 0)

  // ── Stale-closure-safe refs ────────────────────────────────────────────────
  const rawCodeRef  = useRef(rawCode)
  const inTransitRef= useRef(inTransit)
  const busRef      = useRef(bus)
  const compilerRef = useRef(compiler)
  const coinsRef    = useRef(coins)
  const floorsRef   = useRef(floors)
  const rawCapRef   = useRef(rawCodeCap)
  useEffect(() => { rawCodeRef.current   = rawCode    }, [rawCode])
  useEffect(() => { inTransitRef.current = inTransit  }, [inTransit])
  useEffect(() => { busRef.current       = bus        }, [bus])
  useEffect(() => { compilerRef.current  = compiler   }, [compiler])
  useEffect(() => { coinsRef.current     = coins      }, [coins])
  useEffect(() => { floorsRef.current    = floors     }, [floors])
  useEffect(() => { rawCapRef.current    = rawCodeCap }, [rawCodeCap])

  // ── Persistence (debounced save) ───────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ coins, lifetime, rawCode, rawCodeCap, inTransit, floors: floors.map(f => ({ level: f.level })), bus, compiler, auto }))
      } catch {}
    }, 2000)
    return () => clearTimeout(id)
  }, [coins, lifetime, rawCode, rawCodeCap, inTransit, floors, bus, compiler, auto])

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTOMATION INTERVALS
  // Each pillar has its own setInterval that only runs when auto[pillar]=true.
  // useRef patterns prevent stale closures from reading outdated state.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Pillar 1: Production (1 s tick) ───────────────────────────────────────
  useEffect(() => {
    if (!auto.production) return
    const id = setInterval(() => {
      const rcps = floorsRef.current.reduce((s, fs, i) => s + floorRCPS(FLOORS[i], fs.level), 0)
      if (rcps <= 0) return
      setRawCode(rc => parseFloat(Math.min(rc + rcps, rawCapRef.current).toFixed(2)))
    }, 1000)
    return () => clearInterval(id)
  }, [auto.production])

  // ── Pillar 2: Data Bus transfer ────────────────────────────────────────────
  const busIntervalMs = Math.max(200, Math.round(1000 / bus.speed))
  useEffect(() => {
    if (!auto.dataBus) return
    const id = setInterval(() => {
      const rc  = rawCodeRef.current
      const cap = busRef.current.capacity
      const amt = parseFloat(Math.min(cap, rc).toFixed(2))
      if (amt <= 0) return
      setBusMoving(true)
      setRawCode(r => parseFloat(Math.max(0, r - amt).toFixed(2)))
      setInTransit(it => parseFloat((it + amt).toFixed(2)))
      setTimeout(() => setBusMoving(false), Math.min(busIntervalMs * 0.6, 800))
    }, busIntervalMs)
    return () => clearInterval(id)
  }, [auto.dataBus, busIntervalMs])

  // ── Pillar 3: Compiler ─────────────────────────────────────────────────────
  const compilerIntervalMs = Math.max(200, Math.round(compiler.procTime * 1000))
  const compilerTickMs     = 100  // progress bar tick rate
  const progressPerTick    = (compilerTickMs / compilerIntervalMs) * 100

  useEffect(() => {
    if (!auto.compiler) { setCompileProgress(0); return }
    // Progress bar ticker (visual only)
    const barId = setInterval(() => {
      setCompileProgress(p => {
        const next = p + progressPerTick
        return next >= 100 ? 0 : next
      })
    }, compilerTickMs)
    // Actual compile tick
    const compileId = setInterval(() => {
      const it    = inTransitRef.current
      const batch = compilerRef.current.batchSize
      const rate  = compilerRef.current.convRate
      const amt   = parseFloat(Math.min(batch, it).toFixed(2))
      if (amt <= 0) return
      setInTransit(t => parseFloat(Math.max(0, t - amt).toFixed(2)))
      const earned = parseFloat((amt * rate).toFixed(2))
      setCoins(c => parseFloat((c + earned).toFixed(2)))
      setLifetime(l => parseFloat((l + earned).toFixed(2)))
      playChaChing()
    }, compilerIntervalMs)
    return () => { clearInterval(barId); clearInterval(compileId) }
  }, [auto.compiler, compilerIntervalMs, progressPerTick])

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL ACTIONS (used when automation is OFF)
  // ═══════════════════════════════════════════════════════════════════════════

  const spawnFloat = useCallback((val, x, y, color = '#fbbf24') => {
    const id = Date.now() + Math.random()
    setFloats(f => [...f, { id, x, y, val, color }])
    setTimeout(() => setFloats(f => f.filter(n => n.id !== id)), 900)
  }, [])

  // Manual produce: earn Raw Code equal to max(1, 0.5% of totalRCPS) per click
  const handleManualProduce = useCallback((e) => {
    const gain = Math.max(1, parseFloat((totalRCPS * 0.005).toFixed(2))) || 1
    setRawCode(rc => parseFloat(Math.min(rc + gain, rawCapRef.current).toFixed(2)))
    playClick()
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    spawnFloat('+' + fmtRC(gain) + ' RC', x, y, '#a855f7')
  }, [totalRCPS, spawnFloat])

  // Manual transfer: one Data Bus trip
  const handleManualTransfer = useCallback((e) => {
    const rc  = rawCodeRef.current
    const amt = parseFloat(Math.min(busRef.current.capacity, rc).toFixed(2))
    if (amt <= 0) return
    setBusMoving(true)
    setRawCode(r => parseFloat(Math.max(0, r - amt).toFixed(2)))
    setInTransit(it => parseFloat((it + amt).toFixed(2)))
    playClick()
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    spawnFloat('→ ' + fmtRC(amt) + ' RC', x, y, '#3b82f6')
    setTimeout(() => setBusMoving(false), 700)
  }, [spawnFloat])

  // Manual compile: one compiler batch
  const handleManualCompile = useCallback((e) => {
    const it    = inTransitRef.current
    const batch = compilerRef.current.batchSize
    const rate  = compilerRef.current.convRate
    const amt   = parseFloat(Math.min(batch, it).toFixed(2))
    if (amt <= 0) return
    setInTransit(t => parseFloat(Math.max(0, t - amt).toFixed(2)))
    const earned = parseFloat((amt * rate).toFixed(2))
    setCoins(c => parseFloat((c + earned).toFixed(2)))
    setLifetime(l => parseFloat((l + earned).toFixed(2)))
    playChaChing()
    setCompileProgress(100)
    setTimeout(() => setCompileProgress(0), 300)
    const x = e?.clientX ?? window.innerWidth / 2
    const y = e?.clientY ?? window.innerHeight / 2
    spawnFloat('+' + fmtN(earned) + ' 🪙', x, y, '#fbbf24')
    confetti({ particleCount: 30, spread: 40, origin: { x: .5, y: .6 }, colors: ['#fbbf24','#a855f7','#00c8ff'], ticks: 100 })
  }, [spawnFloat])

  // ── Buy floor upgrade ──────────────────────────────────────────────────────
  const handleBuyFloor = useCallback((idx, qty, cost) => {
    if (cost <= 0 || qty <= 0 || coinsRef.current < cost) return
    setCoins(c => parseFloat((c - cost).toFixed(2)))
    setFloors(prev => prev.map((fs, i) => {
      if (i !== idx) return fs
      const newLevel = fs.level + qty
      return { level: newLevel }
    }))
    // Expand raw code capacity when unlocking new floors
    setRawCodeCap(cap => cap + qty * 50)
    playChaChing()
    trackEvent('tycoon_floor_upgrade', { floor: FLOORS[idx]?.id, qty, cost })
    confetti({ particleCount: Math.min(40 + qty * 2, 120), spread: 55, origin: { x: .35, y: .5 }, colors: [FLOORS[idx]?.color ?? '#00c8ff', '#fbbf24', '#a855f7'], ticks: 130 })
  }, [])

  // ── Automation unlock ──────────────────────────────────────────────────────
  const handleToggleAuto = useCallback((pillar) => {
    if (auto[pillar]) {
      // Turn off (free)
      setAuto(a => ({ ...a, [pillar]: false }))
      return
    }
    const cost = AUTO_COSTS[pillar]
    if (coinsRef.current < cost) return
    setCoins(c => parseFloat((c - cost).toFixed(2)))
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
      setCoins(c => parseFloat((c - cost).toFixed(2)))
      playClick()
      if (type === 'capacity') {
        const newLevel = prev.capacityLevel + 1
        return { ...prev, capacity: 10 + newLevel * 10, capacityLevel: newLevel, capacityCost: Math.ceil(50 * Math.pow(1.2, newLevel)) }
      } else {
        const newLevel = prev.speedLevel + 1
        return { ...prev, speed: parseFloat((0.25 + newLevel * 0.05).toFixed(2)), speedLevel: newLevel, speedCost: Math.ceil(150 * Math.pow(1.25, newLevel)) }
      }
    })
  }, [])

  // ── Compiler upgrades ──────────────────────────────────────────────────────
  const handleCompilerUpgrade = useCallback((type) => {
    setCompiler(prev => {
      const cost = { batch: prev.batchCost, proc: prev.procCost, conv: prev.convCost }[type]
      if (coinsRef.current < cost) return prev
      setCoins(c => parseFloat((c - cost).toFixed(2)))
      playClick()
      if (type === 'batch') {
        const lv = prev.batchLevel + 1
        return { ...prev, batchSize: 5 + lv * 5, batchLevel: lv, batchCost: Math.ceil(100 * Math.pow(1.25, lv)) }
      } else if (type === 'proc') {
        const lv = prev.procLevel + 1
        return { ...prev, procTime: Math.max(0.5, parseFloat((3 - lv * 0.2).toFixed(1))), procLevel: lv, procCost: Math.ceil(200 * Math.pow(1.3, lv)) }
      } else {
        const lv = prev.convLevel + 1
        return { ...prev, convRate: 1 + lv * 0.25, convLevel: lv, convCost: Math.ceil(500 * Math.pow(1.4, lv)) }
      }
    })
  }, [])

  // ── Phaser integration (hidden background) ─────────────────────────────────
  const milestoneCBRef = useRef(onAnalogyMilestone)
  useEffect(() => { milestoneCBRef.current = onAnalogyMilestone }, [onAnalogyMilestone])

  const handleMilestone = useCallback((data) => {
    setOverlayConceptId(data?.conceptId ?? null)
    setOverlayVisible(true)
    milestoneCBRef.current?.(data)
  }, [])

  const handleOverlayComplete = useCallback(() => {
    setOverlayVisible(false)
    // Reward: bonus coins for completing a math puzzle
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
      const Phaser = mod
      const { width, height } = computeCanvasSize()
      const game = new Phaser.Game({ type: Phaser.AUTO, width, height, parent: 'phaser-game-container', backgroundColor: '#0a0e1a', scale: { mode: Phaser.Scale.NONE }, scene: [BootScene, PreloadScene, PlayScene] })
      gameRef.current = game
      game.registry.set('onAnalogyMilestone', handleMilestone)
    })
    window.addEventListener('resize', handleCanvasResize)
    return () => { cancelled = true; window.removeEventListener('resize', handleCanvasResize); if (gameRef.current) { gameRef.current.destroy(true); gameRef.current = null } }
  }, [handleCanvasResize, handleMilestone])

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIVED popup values
  // ═══════════════════════════════════════════════════════════════════════════
  const popDef   = popupIdx !== null ? FLOORS[popupIdx] : null
  const popFloor = popupIdx !== null ? floors[popupIdx] : null
  let popQty = 0, popCost = 0
  if (popFloor && popDef) {
    if (buyQty === '1')  { popQty = 1;  popCost = popFloor.level === 0 ? popDef.baseCost : levelCost(popDef, popFloor.level) }
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
        {/* Orbit ring */}
        <div style={{ position:'absolute', width:320, height:320, animation:'orbit 22s linear infinite', pointerEvents:'none' }}>
          {ORBIT.map((em, i) => {
            const a = (i / ORBIT.length) * 2 * Math.PI
            return <div key={i} style={{ position:'absolute', left: 160 + 145 * Math.cos(a) - 14, top: 160 + 145 * Math.sin(a) - 14, fontSize:24, animation:'orbit-rev 22s linear infinite', filter:'drop-shadow(0 0 6px rgba(0,200,255,.5))' }}>{em}</div>
          })}
        </div>
        <div style={{ position:'absolute', width:308, height:308, borderRadius:'50%', border:'1px solid rgba(0,200,255,.16)', boxShadow:'0 0 28px rgba(0,200,255,.06) inset', pointerEvents:'none' }} />
        <div style={{ fontSize:82, animation:'hero-bob 3s ease-in-out infinite', zIndex:10, marginBottom:4, filter:'drop-shadow(0 0 22px rgba(168,85,247,.7))' }}>🧙‍♂️</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(16px,4vw,26px)', fontWeight:900, color:'#00c8ff', letterSpacing:'3px', animation:'glow-cyan 2.5s ease-in-out infinite', zIndex:10, textAlign:'center', marginBottom:2 }}>MATH SCRIPT</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:'clamp(26px,6.5vw,44px)', fontWeight:900, color:'#fbbf24', letterSpacing:'5px', textShadow:'0 0 22px rgba(251,191,36,.7)', zIndex:10, textAlign:'center', marginBottom:6 }}>TYCOON</div>
        <div style={{ fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#4b8fa8', letterSpacing:'4px', textTransform:'uppercase', zIndex:10, marginBottom:10 }}>BUILD · BALANCE · AUTOMATE</div>
        {/* Economy preview badges */}
        <div style={{ display:'flex', gap:8, marginBottom:32, zIndex:10 }}>
          {[['⚡','PRODUCE','#a855f7'],['🛗','TRANSFER','#3b82f6'],['⚙️','COMPILE','#22c55e']].map(([ic,lbl,clr]) => (
            <div key={lbl} style={{ padding:'5px 12px', background:`rgba(0,0,0,.4)`, border:`1px solid ${clr}40`, borderRadius:8, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color:clr, letterSpacing:'1px', textAlign:'center' }}>
              {ic}<br/>{lbl}
            </div>
          ))}
        </div>
        <button onClick={() => { playClick(); setScreen('play') }}
          style={{ padding:'15px 60px', background:'linear-gradient(135deg,#f59e0b,#fbbf24)', border:'none', borderRadius:12, color:'#0a0e1a', fontFamily:"'Orbitron',monospace", fontSize:18, fontWeight:900, letterSpacing:'3px', cursor:'pointer', zIndex:10, boxShadow:'0 0 28px rgba(251,191,36,.5), 0 4px 18px rgba(0,0,0,.4)', animation:'pulse 2s ease-in-out infinite', transition:'transform .15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform='scale(1.06)' }}
          onMouseLeave={e => { e.currentTarget.style.transform='scale(1)' }}>PLAY</button>
        {lifetime > 0 && <div style={{ position:'absolute', bottom:20, fontFamily:"'Rajdhani',sans-serif", fontSize:11, color:'#374151', letterSpacing:'1px' }}>�� SAVED · {fmtN(lifetime)} LIFETIME COINS</div>}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS FOR PANEL RENDERING
  // ═══════════════════════════════════════════════════════════════════════════

  // AutoToggle button shared across all three panels
  const AutoToggle = ({ pillar, label }) => {
    const active = auto[pillar]
    const cost   = AUTO_COSTS[pillar]
    const can    = coins >= cost
    return (
      <button onClick={() => handleToggleAuto(pillar)}
        style={{ width:'100%', padding:'8px', background: active ? 'rgba(34,197,94,.12)' : can ? 'rgba(0,200,255,.06)' : 'rgba(15,22,42,.8)', border:`1px solid ${active ? '#22c55e' : can ? 'rgba(0,200,255,.25)' : '#1a2035'}`, borderRadius:9, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: active ? '#22c55e' : can ? '#00c8ff' : '#374151', cursor:'pointer', letterSpacing:'1px', transition:'all .2s' }}>
        {active ? '🤖 AUTO: ON' : can ? `🔓 AUTO ${fmtN(cost)}🪙` : `🔒 AUTO ${fmtN(cost)}🪙`}
      </button>
    )
  }

  // Upgrade row used in Bus and Compiler panels
  const UpgradeRow = ({ icon, label, value, cost, canAfford, onClick }) => (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', background:'rgba(10,14,26,.8)', borderRadius:8, border:'1px solid rgba(255,255,255,.06)', marginBottom:5 }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'.4px' }}>{label}</div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:'#e8e8f0' }}>{value}</div>
      </div>
      <button onClick={onClick} disabled={!canAfford}
        style={{ padding:'5px 10px', background: canAfford ? 'linear-gradient(135deg,#0099cc,#00c8ff)' : 'rgba(20,30,55,.8)', border:'none', borderRadius:7, fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: canAfford ? '#0a0e1a' : '#1e293b', cursor: canAfford ? 'pointer' : 'not-allowed', minWidth:52, transition:'all .15s' }}>
        UP<br/>{fmtN(cost)}🪙
      </button>
    </div>
  )

  // Shared panel wrapper style
  const panelStyle = (accent) => ({
    display:'flex', flexDirection:'column', gap:6,
    background:'linear-gradient(160deg,#0d1424 0%,#0a0e1a 100%)',
    border:`1px solid ${accent}40`,
    borderTop:`3px solid ${accent}`,
    borderRadius:12,
    padding:'10px 10px 8px',
    flex:1, minWidth:0, overflow:'hidden',
  })
  const panelHead = (icon, title, accent, extra) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
      <span style={{ fontSize:18 }}>{icon}</span>
      <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color:accent, letterSpacing:'1.5px', flex:1 }}>{title}</span>
      {extra}
    </div>
  )

  // ── Buffer bar ─────────────────────────────────────────────────────────────
  const BufferBar = ({ value, max, color, label }) => {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
    const full = pct >= 99
    return (
      <div style={{ marginBottom:5 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#4b8fa8', marginBottom:3 }}>
          <span>{label}</span>
          <span style={{ color: full ? '#ef4444' : '#e8e8f0' }}>{fmtRC(value)} / {fmtN(max)}</span>
        </div>
        <div style={{ height:7, background:'rgba(255,255,255,.06)', borderRadius:4, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background: full ? 'linear-gradient(90deg,#ef4444,#f97316)' : `linear-gradient(90deg,${color},${color}aa)`, borderRadius:4, transition:'width .5s ease', boxShadow:`0 0 6px ${color}`, animation: full ? 'bar-flash 1s ease-in-out infinite' : 'none' }} />
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PILLAR 1 — PRODUCTION NODES
  // ═══════════════════════════════════════════════════════════════════════════
  const ProductionPanel = () => (
    <div style={panelStyle('#a855f7')}>
      {panelHead('⚡', 'PRODUCTION', '#a855f7',
        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#22c55e' }}>+{fmtCPS(totalRCPS)}RC/s</span>
      )}

      <BufferBar value={rawCode} max={rawCodeCap} color='#a855f7' label='RAW CODE BUFFER' />

      {/* Floor scroll arrows */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:4, marginBottom:2 }}>
        {[['▲', floorScroll > 0, () => setFloorScroll(s => Math.max(0, s-1))],
          ['▼', floorScroll + FLOORS_VIS < FLOORS.length, () => setFloorScroll(s => Math.min(FLOORS.length - FLOORS_VIS, s+1))]].map(([lbl,can,fn]) => (
          <button key={lbl} onClick={fn} disabled={!can}
            style={{ width:22, height:22, background: can ? 'rgba(168,85,247,.15)' : 'rgba(255,255,255,.02)', border:`1px solid ${can ? '#a855f740' : 'transparent'}`, borderRadius:5, color: can ? '#a855f7' : '#1e293b', fontSize:11, cursor: can ? 'pointer' : 'default' }}>{lbl}</button>
        ))}
      </div>

      {/* Floor list */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3, overflowY:'hidden' }}>
        {visFloors.map((def, vi) => {
          const ri  = floorScroll + vi
          const fs  = visFSt[vi]
          const lv  = fs.level
          const locked  = lv === 0
          const canAfrd = coins >= (locked ? def.baseCost : levelCost(def, lv))
          const rcps    = floorRCPS(def, lv)
          const wc      = workerCount(lv)
          const nm      = nextML(lv)
          const wClasses = ['w-a','w-b','w-c','w-d']
          return (
            <div key={def.id} onClick={() => { playClick(); setPopupIdx(ri) }}
              style={{ flex:1, background: locked ? 'rgba(12,18,36,.7)' : `linear-gradient(135deg,${def.bg} 0%,rgba(10,14,26,.9) 60%)`, border:`1px solid ${locked ? 'rgba(255,255,255,.04)' : def.glow}`, borderLeft:`3px solid ${locked ? '#1a2035' : def.color}`, borderRadius:7, padding:'5px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:7, overflow:'hidden', transition:'filter .2s' }}
              onMouseEnter={e => { e.currentTarget.style.filter='brightness(1.1)' }}
              onMouseLeave={e => { e.currentTarget.style.filter='brightness(1)' }}>
              {/* Floor num */}
              <div style={{ width:26, height:26, background:'rgba(0,0,0,.45)', border:`1px solid ${locked ? '#1a2035' : def.color}`, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: locked ? '#1e293b' : def.color, flexShrink:0 }}>{locked ? '🔒' : ri+1}</div>
              {/* Workers + name */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  {locked ? <span style={{ fontSize:17, filter:'grayscale(1) opacity(.2)' }}>{def.emoji}</span>
                           : Array.from({length: wc}, (_,wi) => <span key={wi} className={wClasses[wi%4]} style={{ fontSize:17 }}>{def.emoji}</span>)}
                  <div style={{ minWidth:0, overflow:'hidden' }}>
                    <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, color: locked ? '#1e293b' : '#e8e8f0', letterSpacing:'.5px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{def.short}</div>
                    {!locked && <div style={{ fontSize:9, color:'#4b8fa8' }}>+{fmtCPS(rcps)}/s</div>}
                  </div>
                </div>
                {!locked && nm && <div style={{ height:2, background:`rgba(255,255,255,.06)`, borderRadius:1, marginTop:3, overflow:'hidden' }}><div style={{ height:'100%', width:`${Math.min(100,(lv/nm)*100)}%`, background:def.color, borderRadius:1 }} /></div>}
              </div>
              {/* Action */}
              <div onClick={e => { e.stopPropagation(); const c = locked ? def.baseCost : levelCost(def,lv); if(coins>=c) handleBuyFloor(ri,1,c) }}
                style={{ flexShrink:0, padding:'4px 7px', background: canAfrd ? `linear-gradient(135deg,${def.color},rgba(0,0,0,.3))` : 'rgba(20,30,55,.8)', border:`1px solid ${canAfrd ? def.color : '#1a2035'}`, borderRadius:6, fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color: canAfrd ? '#fff' : '#1e293b', cursor: canAfrd ? 'pointer' : 'default', textAlign:'center', lineHeight:1.6 }}>
                {locked ? <>{fmtN(def.baseCost)}<br/>🔓</> : <>{fmtN(levelCost(def,lv))}<br/>▲</>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Manual produce + auto */}
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginTop:2 }}>
        {!auto.production && (
          <button onClick={handleManualProduce}
            style={{ width:'100%', padding:'8px', background:'linear-gradient(135deg,#7c3aed,#5b21b6)', border:'1px solid rgba(167,139,250,.35)', borderRadius:8, color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, cursor:'pointer', boxShadow:'0 0 12px rgba(124,58,237,.3)' }}>
            ⚡ PRODUCE RAW CODE
          </button>
        )}
        <AutoToggle pillar="production" />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // PILLAR 2 — DATA BUS (ELEVATOR)
  // ═══════════════════════════════════════════════════════════════════════════
  const DataBusPanel = () => (
    <div style={panelStyle('#3b82f6')}>
      {panelHead('🛗', 'DATA BUS', '#3b82f6',
        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#3b82f6' }}>{fmtRC(inTransit)} IN TRANSIT</span>
      )}

      {/* Elevator visual */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'8px 0', gap:4 }}>
        <div style={{ width:64, height:64, background:'rgba(59,130,246,.1)', border:'2px solid rgba(59,130,246,.35)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, boxShadow:'0 0 18px rgba(59,130,246,.2)', animation: busMoving ? 'lift-up .8s ease-in-out infinite' : 'none' }}>
          🛗
        </div>
        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color: busMoving ? '#22c55e' : '#374151', transition:'color .3s', letterSpacing:'1px' }}>
          {busMoving ? '▲ TRANSFERRING ▲' : '— IDLE —'}
        </div>
        {/* Transfer flow arrow */}
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#4b8fa8' }}>
          <span style={{ color:'#a855f7' }}>⚡RC</span>
          <span style={{ color: busMoving ? '#22c55e' : '#1e293b', transition:'color .3s' }}>{'─→─→─'}</span>
          <span style={{ color:'#3b82f6' }}>📦</span>
        </div>
      </div>

      {/* Upgrade rows */}
      <UpgradeRow icon="📦" label="TRANSFER CAPACITY"
        value={`${bus.capacity} RC / trip`}
        cost={bus.capacityCost} canAfford={coins >= bus.capacityCost}
        onClick={() => handleBusUpgrade('capacity')} />
      <UpgradeRow icon="🚀" label="TRAVEL SPEED"
        value={`${(1/bus.speed).toFixed(1)}s / trip`}
        cost={bus.speedCost} canAfford={coins >= bus.speedCost}
        onClick={() => handleBusUpgrade('speed')} />

      {/* In-transit buffer display */}
      <div style={{ padding:'7px 10px', background:'rgba(59,130,246,.05)', border:'1px solid rgba(59,130,246,.15)', borderRadius:8, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
        <span style={{ fontSize:10, color:'#4b8fa8', fontWeight:600 }}>IN TRANSIT</span>
        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:700, color:'#3b82f6' }}>{fmtRC(inTransit)}</span>
      </div>

      {/* Manual + auto */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {!auto.dataBus && (
          <button onClick={handleManualTransfer}
            style={{ width:'100%', padding:'8px', background:'linear-gradient(135deg,#1d4ed8,#3b82f6)', border:'1px solid rgba(59,130,246,.35)', borderRadius:8, color:'#e8e8f0', fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, cursor:'pointer', boxShadow:'0 0 12px rgba(59,130,246,.3)' }}>
            🛗 TRANSFER NOW
          </button>
        )}
        <AutoToggle pillar="dataBus" />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // PILLAR 3 — COMPILER (SALES DESK)
  // ═══════════════════════════════════════════════════════════════════════════
  const CompilerPanel = () => (
    <div style={panelStyle('#22c55e')}>
      {panelHead('⚙️', 'COMPILER', '#22c55e',
        <span style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#fbbf24' }}>{fmtN(coins)} ��</span>
      )}

      {/* Gear + progress */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px 0', gap:4 }}>
        <div style={{ fontSize:38, animation: auto.compiler && inTransit > 0 ? 'gear-spin 1s linear infinite' : 'none', filter: auto.compiler && inTransit > 0 ? 'drop-shadow(0 0 10px rgba(34,197,94,.8))' : 'none' }}>
          ⚙️
        </div>
        {/* Progress bar */}
        <div style={{ width:'100%' }}>
          <div style={{ height:8, background:'rgba(255,255,255,.06)', borderRadius:4, overflow:'hidden', marginBottom:3 }}>
            <div style={{ height:'100%', width:`${compileProgress}%`, background:'linear-gradient(90deg,#22c55e,#fbbf24)', borderRadius:4, transition:'width .1s linear', boxShadow:'0 0 6px rgba(34,197,94,.6)' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#4b5563' }}>
            <span>PROCESSING</span>
            <span style={{ color:'#22c55e' }}>{compileProgress.toFixed(0)}%</span>
          </div>
        </div>
        {/* Conversion display */}
        <div style={{ display:'flex', gap:8, fontSize:10, color:'#4b8fa8', alignItems:'center' }}>
          <span style={{ color:'#3b82f6' }}>{compiler.batchSize}RC</span>
          <span>→</span>
          <span style={{ color:'#fbbf24' }}>{fmtN(compiler.batchSize * compiler.convRate)}🪙</span>
          <span style={{ fontSize:9, color:'#374151' }}>per {compiler.procTime}s</span>
        </div>
      </div>

      {/* Upgrade rows */}
      <UpgradeRow icon="📦" label="BATCH SIZE"
        value={`${compiler.batchSize} RC / batch`}
        cost={compiler.batchCost} canAfford={coins >= compiler.batchCost}
        onClick={() => handleCompilerUpgrade('batch')} />
      <UpgradeRow icon="⏱️" label="PROCESSING SPEED"
        value={`${compiler.procTime}s / batch`}
        cost={compiler.procCost} canAfford={coins >= compiler.procCost}
        onClick={() => handleCompilerUpgrade('proc')} />
      <UpgradeRow icon="💱" label="CONVERSION RATE"
        value={`×${compiler.convRate.toFixed(2)} coins/RC`}
        cost={compiler.convCost} canAfford={coins >= compiler.convCost}
        onClick={() => handleCompilerUpgrade('conv')} />

      {/* Manual + auto */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {!auto.compiler && (
          <button onClick={handleManualCompile}
            style={{ width:'100%', padding:'8px', background: inTransit > 0 ? 'linear-gradient(135deg,#15803d,#22c55e)' : 'rgba(20,30,55,.8)', border:`1px solid ${inTransit > 0 ? 'rgba(34,197,94,.4)' : '#1a2035'}`, borderRadius:8, color: inTransit > 0 ? '#e8e8f0' : '#1e293b', fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, cursor: inTransit > 0 ? 'pointer' : 'not-allowed', boxShadow: inTransit > 0 ? '0 0 12px rgba(34,197,94,.3)' : 'none' }}>
            ⚙️ COMPILE BATCH
          </button>
        )}
        <AutoToggle pillar="compiler" />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN PLAY SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  const TAB_DEFS = [
    { key:'prod', icon:'⚡', label:'PRODUCE',  accent:'#a855f7' },
    { key:'bus',  icon:'🛗', label:'TRANSFER', accent:'#3b82f6' },
    { key:'comp', icon:'⚙️', label:'COMPILE',  accent:'#22c55e' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', flexDirection:'column', background:'#0a0e1a', overflow:'hidden', fontFamily:"'Rajdhani',sans-serif" }}>
      <style>{ANIM_CSS}</style>

      {/* Floating number overlays */}
      {floats.map(n => <div key={n.id} className="float-num" style={{ left:n.x-14, top:n.y-20, color:n.color ?? '#fbbf24' }}>{n.val}</div>)}

      {/* ── TOP BAR ──────────────────────────────────────────────────────── */}
      <div style={{ background:'linear-gradient(180deg,#0f1629 0%,#0a0e1a 100%)', borderBottom:'1px solid rgba(0,200,255,.15)', padding:'7px 12px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <button onClick={() => setScreen('title')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:'#4b8fa8', padding:'3px 6px', borderRadius:6 }}>◀</button>
        {/* Coins */}
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(251,191,36,.07)', border:'1px solid rgba(251,191,36,.2)', borderRadius:9, padding:'4px 10px', flex:1 }}>
          <span style={{ fontSize:18 }}>🪙</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:'#fbbf24', lineHeight:1 }}>{fmtN(coins)}</div>
            <div style={{ fontSize:9, color:'#4b5563' }}>TYCOON COINS</div>
          </div>
        </div>
        {/* Raw Code */}
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(168,85,247,.07)', border:'1px solid rgba(168,85,247,.2)', borderRadius:9, padding:'4px 10px', flex:1 }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:'#a855f7', lineHeight:1 }}>{fmtRC(rawCode)}</div>
            <div style={{ fontSize:9, color:'#4b5563' }}>RAW CODE</div>
          </div>
        </div>
        {/* In Transit */}
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(59,130,246,.07)', border:'1px solid rgba(59,130,246,.2)', borderRadius:9, padding:'4px 10px', flex:1 }}>
          <span style={{ fontSize:18 }}>🛗</span>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:15, fontWeight:700, color:'#3b82f6', lineHeight:1 }}>{fmtRC(inTransit)}</div>
            <div style={{ fontSize:9, color:'#4b5563' }}>IN TRANSIT</div>
          </div>
        </div>
      </div>

      {/* ── PANELS ───────────────────────────────────────────────────────── */}
      {isMobile ? (
        /* Mobile: single active panel */
        <div style={{ flex:1, padding:'8px', overflow:'hidden' }}>
          {activeTab === 'prod' && <ProductionPanel />}
          {activeTab === 'bus'  && <DataBusPanel />}
          {activeTab === 'comp' && <CompilerPanel />}
        </div>
      ) : (
        /* Desktop: three columns */
        <div style={{ flex:1, display:'flex', gap:8, padding:'8px', overflow:'hidden' }}>
          <ProductionPanel />
          {/* Flow arrow */}
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, flexShrink:0, width:28 }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#3b82f6', writingMode:'vertical-rl', letterSpacing:'2px', animation: busMoving ? 'pulse 1s ease-in-out infinite' : 'none' }}>▶▶</div>
          </div>
          <DataBusPanel />
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, flexShrink:0, width:28 }}>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:'#22c55e', writingMode:'vertical-rl', letterSpacing:'2px', animation: auto.compiler && inTransit > 0 ? 'pulse 1s ease-in-out infinite' : 'none' }}>▶▶</div>
          </div>
          <CompilerPanel />
        </div>
      )}

      {/* ── MOBILE TAB BAR ───────────────────────────────────────────────── */}
      {isMobile && (
        <div style={{ display:'flex', borderTop:'1px solid rgba(0,200,255,.12)', background:'#0a0e1a', flexShrink:0 }}>
          {TAB_DEFS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ flex:1, padding:'10px 4px', background: activeTab === t.key ? `${t.accent}14` : 'transparent', border:'none', borderTop: activeTab === t.key ? `2px solid ${t.accent}` : '2px solid transparent', color: activeTab === t.key ? t.accent : '#374151', fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, cursor:'pointer', letterSpacing:'1px', transition:'all .2s' }}>
              <div style={{ fontSize:20, marginBottom:2 }}>{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── HIDDEN PHASER CANVAS (milestone detection) ───────────────────── */}
      <div id="phaser-game-container" ref={phaserContainerRef}
        style={{ position:'absolute', left:'-9999px', top:'-9999px', opacity:0, pointerEvents:'none' }} />

      {/* ── FLOOR DETAIL POPUP ───────────────────────────────────────────── */}
      {popDef && popFloor && (
        <div onClick={() => setPopupIdx(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', backdropFilter:'blur(7px)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:14 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'linear-gradient(135deg,#0f1629 0%,#12172a 100%)', border:`2px solid ${popDef.color}`, borderRadius:18, padding:20, width:'100%', maxWidth:340, boxShadow:`0 0 40px ${popDef.glow}`, position:'relative', maxHeight:'88vh', overflowY:'auto' }}>

            <button onClick={() => setPopupIdx(null)} style={{ position:'absolute', top:12, right:12, width:26, height:26, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)', borderRadius:7, color:'#94a3b8', fontSize:12, cursor:'pointer' }}>✕</button>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:52, height:52, background:'rgba(0,0,0,.45)', border:`2px solid ${popDef.color}`, borderRadius:13, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:`0 0 14px ${popDef.glow}` }}>{popDef.emoji}</div>
              <div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, color:popDef.color, letterSpacing:'1px' }}>{popDef.short}</div>
                <div style={{ fontSize:11, color:'#64748b' }}>{popDef.hero} · {popDef.desc}</div>
                <div style={{ display:'inline-block', background:'rgba(0,0,0,.4)', border:`1px solid ${popDef.color}`, borderRadius:5, padding:'1px 7px', fontFamily:"'Orbitron',monospace", fontSize:8, fontWeight:700, color:popDef.color, marginTop:4 }}>LEVEL {popFloor.level}</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ background:'rgba(0,200,255,.04)', border:'1px solid rgba(0,200,255,.1)', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
              {[
                ['RC OUTPUT', `${fmtCPS(floorRCPS(popDef, popFloor.level))}/s`, popQty > 0 ? `→ ${fmtCPS(floorRCPS(popDef, popFloor.level + popQty))}/s` : null],
                ['PER LEVEL', `+${popDef.rcps} RC/s × ${milestoneMult(popFloor.level)}×`, null],
                ['NEXT MILESTONE', (() => { const nm = nextML(popFloor.level); return nm ? `Lv ${nm} → ×${milestoneMult(nm)}` : '✦ MAX' })(), null],
              ].map(([lbl,val,next]) => (
                <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5, fontSize:11 }}>
                  <span style={{ color:'#4b8fa8', fontWeight:600 }}>{lbl}</span>
                  <div style={{ display:'flex', gap:7, alignItems:'center' }}>
                    <span style={{ color:'#e8e8f0' }}>{val}</span>
                    {next && <span style={{ color:'#22c55e', fontSize:10 }}>{next}</span>}
                  </div>
                </div>
              ))}
              {/* Milestone bar */}
              {(() => { const nm = nextML(popFloor.level); if (!nm) return null; return (
                <div style={{ marginTop:5 }}>
                  <div style={{ height:5, background:'rgba(255,255,255,.05)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(100,(popFloor.level/nm)*100)}%`, background:`linear-gradient(90deg,${popDef.color},#fbbf24)`, borderRadius:3, boxShadow:`0 0 5px ${popDef.color}` }} />
                  </div>
                </div>
              )})()}
            </div>

            {/* Qty */}
            <div style={{ display:'flex', gap:5, marginBottom:9 }}>
              {[['1','×1'],['10','×10'],['50','×50'],['max','MAX']].map(([v,l]) => (
                <button key={v} onClick={() => setBuyQty(v)}
                  style={{ flex:1, padding:'7px 2px', background: buyQty===v ? popDef.color : 'rgba(15,22,42,.8)', border:`1px solid ${buyQty===v ? popDef.color : 'rgba(255,255,255,.07)'}`, borderRadius:7, color: buyQty===v ? '#0a0e1a' : '#64748b', fontFamily:"'Orbitron',monospace", fontSize:9, fontWeight:700, cursor:'pointer' }}>{l}</button>
              ))}
            </div>

            {/* Cost */}
            <div style={{ textAlign:'center', marginBottom:9, fontSize:11, color:'#4b8fa8', minHeight:16 }}>
              {popQty > 0 ? <>Buy <span style={{ color:popDef.color, fontWeight:700 }}>×{fmtN(popQty)}</span> for <span style={{ color:'#fbbf24' }}>{fmtN(popCost)} 🪙</span></> : <span style={{ color:'#1e293b' }}>Not enough coins</span>}
            </div>

            {/* Upgrade btn */}
            <button disabled={popQty===0||coins<popCost}
              onClick={() => { if(popQty>0&&coins>=popCost) handleBuyFloor(popupIdx,popQty,popCost) }}
              style={{ width:'100%', padding:'12px', background:(popQty>0&&coins>=popCost)?`linear-gradient(135deg,${popDef.color},rgba(0,0,0,.25))`:'rgba(20,30,55,.6)', border:`1px solid ${(popQty>0&&coins>=popCost)?popDef.color:'#1a2035'}`, borderRadius:11, color:(popQty>0&&coins>=popCost)?'#fff':'#1e293b', fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700, letterSpacing:'1px', cursor:(popQty>0&&coins>=popCost)?'pointer':'not-allowed', boxShadow:(popQty>0&&coins>=popCost)?`0 0 18px ${popDef.glow}`:'none', transition:'all .2s' }}>
              {popFloor.level===0 ? 'UNLOCK DEPARTMENT' : `UPGRADE ⚡ ${fmtN(popCost)} 🪙`}
            </button>
          </div>
        </div>
      )}

      {/* ── ANALOGY OVERLAY (math puzzle from Phaser milestones) ─────────── */}
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
