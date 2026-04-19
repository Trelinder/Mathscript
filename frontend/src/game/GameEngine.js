/**
 * GameEngine.js
 *
 * Vanilla-JS singleton that owns the Math Script Tycoon idle-game simulation
 * **outside of the React render cycle**.  React components subscribe via
 * `useGameEngine` (see `src/hooks/useGameEngine.js`) and are only told to
 * re-render when the slice they select actually changes — so the Bank number
 * ticking once per animation frame no longer drags 3 000 lines of floor JSX
 * through React's reconciler.
 *
 * ─── Why a singleton? ────────────────────────────────────────────────────────
 * The idle-game economy is inherently a single process — there is one Bank,
 * one bus, one compiler.  A singleton keeps the engine trivially reachable
 * from non-React code paths too (Phaser scenes, `beforeunload` save handlers,
 * Web Worker bridge), which is *much* harder with a Context-scoped store.
 *
 * ─── What's inside the state tree ───────────────────────────────────────────
 * The three canonical idle-game bottlenecks requested in the persona spec:
 *
 *   produceNode:   { level, compileTime, capacity, walkSpeed, baseRatePerLevel, rawCode }
 *   transferBus:   { level, movementSpeed, loadingSpeed, capacity, payload, state }
 *   compileServer: { level, walkSpeed, processingTime, transporterCapacity,
 *                    buffer, state }
 *
 * Plus cross-cutting economy state:
 *
 *   bank:          { coins, lifetime, lastUpdateTs }
 *
 * Actions mutate state through `dispatch(action)` or the high-level helpers
 * (`upgrade`, `tapProduce`, …).  Every mutation goes through `_commit()`
 * which bumps a version counter and notifies subscribers — that's what
 * `useSyncExternalStore` watches.
 *
 * ─── Why delta-time? ────────────────────────────────────────────────────────
 * `setInterval(fn, 1000)` silently drops to ≈1 Hz in background tabs (Chrome)
 * or stops completely (iOS Safari low-power mode).  `requestAnimationFrame`
 * pauses in background tabs and resumes on focus — we measure the wall-clock
 * gap via `performance.now()` and award the missed production in a single
 * catch-up tick (capped at `MAX_CATCHUP_MS` so a laptop that slept for 8 h
 * doesn't dump 28 800 s of production into one frame).
 *
 * ─── Integration strategy ───────────────────────────────────────────────────
 * This engine is *additive* — the existing production game in
 * `pages/GamePlayerPage.jsx` still runs its own loop and is the source of
 * truth until individual systems migrate over.  A future PR can migrate the
 * Bank display, then the production floors, then the bus, one at a time, by
 * dispatching the same actions this engine already handles.
 */

import {
  DEFAULT_GROWTH_RATE,
  DEFAULT_MILESTONES,
  cumulativeUpgradeCost,
  effectiveThroughput,
  milestoneMultiplier,
  upgradeCost,
} from '../utils/upgradeMath.js'

// ─── Tuning constants ────────────────────────────────────────────────────────

/**
 * Hard cap on the wall-clock gap applied in a single catch-up tick (ms).
 * 4 h of idle production is plenty for background-tab throttling, and it
 * leaves longer offline periods to the dedicated offline-earnings modal
 * which caps with its own UX (“OFFLINE ×2 for 2 h” promos etc.).
 */
const MAX_CATCHUP_MS = 4 * 60 * 60 * 1000

/**
 * If a single RAF frame reports a `dt` longer than this (e.g. the browser
 * hiccuped, or DevTools was paused on a breakpoint), clamp it so the physics
 * of the tick don't explode.  20 Hz floor is conservative.
 */
const MAX_DT_MS = 1000 / 20

/** The three top-level subtree keys the engine manages. */
export const NODE_IDS = Object.freeze({
  PRODUCE: 'produceNode',
  BUS:     'transferBus',
  COMPILE: 'compileServer',
})

// ─── Default state factories ─────────────────────────────────────────────────

/**
 * Build the default ProduceNode state.  Fields named exactly as the persona
 * spec requested: `level`, `compileTime`, `capacity`, `walkSpeed`.  The extra
 * `baseRatePerLevel` and `rawCode` are internal bookkeeping.
 *
 * @returns {ProduceNodeState}
 */
function _defaultProduceNode() {
  return {
    level: 0,
    /** Seconds per internal "compile" (micro-cycle) within the node. */
    compileTime: 2.0,
    /** Maximum raw-code units the node can hold before it stalls. */
    capacity: 100,
    /** Worker walk speed multiplier (1 = baseline). */
    walkSpeed: 1.0,
    /** Raw-code generated per level per second, before milestone multiplier. */
    baseRatePerLevel: 0.5,
    /** Current raw-code reservoir (consumed by the bus). */
    rawCode: 0,
    /** Base cost of the very first level-up, in coins. */
    baseCost: 8,
  }
}

/**
 * Build the default TransferBus state.  Fields named as the persona spec:
 * `level`, `movementSpeed`, `loadingSpeed`, `capacity`.
 *
 * @returns {TransferBusState}
 */
function _defaultTransferBus() {
  return {
    level: 0,
    /** Trips per second (full cycle = pickup + travel + drop). */
    movementSpeed: 0.5,
    /** Loading delay in milliseconds (lower = faster). */
    loadingSpeed: 1500,
    /** Raw-code units moved per trip. */
    capacity: 30,
    /** What the bus is currently carrying this trip. */
    payload: 0,
    /** 'IDLE' | 'LOADING' | 'TRAVELING' — simple FSM for animations. */
    state: 'IDLE',
    baseCost: 25,
  }
}

/**
 * Build the default CompileServer state.  Fields named as the persona spec:
 * `level`, `walkSpeed`, `processingTime`, `transporterCapacity`.
 *
 * @returns {CompileServerState}
 */
function _defaultCompileServer() {
  return {
    level: 0,
    /** Sales-worker walk speed multiplier. */
    walkSpeed: 1.0,
    /** Seconds per compile cycle. */
    processingTime: 2.0,
    /** Raw-code units fetched per compile cycle. */
    transporterCapacity: 3,
    /** Raw-code currently in the compile buffer. */
    buffer: 0,
    /** Coins earned per raw-code unit consumed. */
    conversionRate: 2,
    /** 'IDLE' | 'FETCHING' | 'PROCESSING'. */
    state: 'IDLE',
    /** Accumulator for current processing cycle (seconds). */
    cycleElapsed: 0,
    baseCost: 30,
  }
}

/** Build the default full engine state tree. */
function _defaultState() {
  return {
    bank: {
      coins: 0,
      /** Lifetime coins earned — never decreases. */
      lifetime: 0,
      /** Wall-clock timestamp of the last commit, for offline catch-up. */
      lastUpdateTs: 0,
    },
    [NODE_IDS.PRODUCE]: _defaultProduceNode(),
    [NODE_IDS.BUS]:     _defaultTransferBus(),
    [NODE_IDS.COMPILE]: _defaultCompileServer(),
  }
}

// ─── Engine implementation ───────────────────────────────────────────────────

/**
 * The core engine class.  Do not `new` this directly — import the shared
 * singleton `gameEngine` from the bottom of this file.  A class is used
 * purely so the internals stay encapsulated and testable; external callers
 * only ever see the public methods.
 */
export class GameEngine {
  constructor() {
    /** @type {EngineState} */
    this._state = _defaultState()
    /** Monotonically-increasing snapshot id — bumped on every commit. */
    this._version = 0
    /** Subscriber callbacks registered via `subscribe()`. */
    this._listeners = new Set()
    /** Current RAF request id, or 0 when the loop is stopped. */
    this._rafId = 0
    /** `performance.now()` of the previous frame, or 0 before the first. */
    this._lastFrameTs = 0
    /** Wall-clock `Date.now()` of the previous commit, for visibility-change catch-up. */
    this._lastWallTs = 0
    /** Bound visibility handler so we can `removeEventListener` it later. */
    this._onVisibility = () => this._handleVisibilityChange()
    /** Whether the loop is currently running. */
    this._running = false
  }

  // ── Public: lifecycle ──────────────────────────────────────────────────────

  /**
   * Start the `requestAnimationFrame` loop.  Idempotent — calling twice does
   * nothing on the second call.  Also registers a `visibilitychange` listener
   * that awards missed-time production when the tab regains focus.
   */
  start() {
    if (this._running) return
    if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
      // SSR or non-browser — nothing to do.  Actions still mutate state
      // synchronously, so unit tests run without a DOM.
      this._running = true
      return
    }
    this._running = true
    this._lastFrameTs = performance.now()
    this._lastWallTs = Date.now()
    this._state.bank.lastUpdateTs = this._lastWallTs
    document.addEventListener('visibilitychange', this._onVisibility)
    const loop = (ts) => {
      if (!this._running) return
      this._tick(ts)
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  /**
   * Stop the RAF loop and remove the visibility listener.  Safe to call even
   * if `start()` was never called.
   */
  stop() {
    this._running = false
    if (typeof window !== 'undefined') {
      if (this._rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this._rafId)
      }
      document.removeEventListener('visibilitychange', this._onVisibility)
    }
    this._rafId = 0
  }

  /** Whether the RAF loop is currently running. */
  isRunning() { return this._running }

  // ── Public: pub/sub ────────────────────────────────────────────────────────

  /**
   * Register a listener that will be called (with no arguments) every time
   * the engine commits a state change.  Returns an unsubscribe function.
   *
   * This signature is deliberately compatible with `useSyncExternalStore`.
   *
   * @param {() => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  /**
   * Return the current state snapshot.  The returned object is the *live*
   * state tree — React observers should use selector functions and compare by
   * reference (the engine produces new object identities on every commit of
   * affected subtrees, see `_commit`).
   *
   * @returns {EngineState}
   */
  getState() { return this._state }

  /** Current version counter — useful for custom equality checks. */
  getVersion() { return this._version }

  // ── Public: actions ────────────────────────────────────────────────────────

  /**
   * Dispatch an action to mutate state.  Recognised action types:
   *
   *   { type: 'UPGRADE', node: 'produceNode'|'transferBus'|'compileServer' }
   *   { type: 'TAP_PRODUCE', amount?: number }
   *   { type: 'RESET' }
   *   { type: 'HYDRATE', state: Partial<EngineState> }
   *
   * Unknown types are ignored (a warning is logged in development builds).
   *
   * @param {EngineAction} action
   */
  dispatch(action) {
    if (!action || typeof action.type !== 'string') return
    switch (action.type) {
      case 'UPGRADE':    this.upgrade(action.node); break
      case 'TAP_PRODUCE': this.tapProduce(action.amount ?? 1); break
      case 'RESET':      this._state = _defaultState(); this._commit(['bank', NODE_IDS.PRODUCE, NODE_IDS.BUS, NODE_IDS.COMPILE]); break
      case 'HYDRATE':    this.hydrate(action.state); break
      default:
        if (import.meta.env?.DEV) {
          console.warn('[GameEngine] unknown action', action)
        }
    }
  }

  /**
   * Attempt to upgrade the given node by one level.  The cost is computed
   * from `upgradeMath.upgradeCost(baseCost, level, DEFAULT_GROWTH_RATE)` and
   * debited from the Bank.  If the player can't afford it this is a no-op
   * and returns `false`.
   *
   * Derived stats (capacity, speed, …) are re-computed from the new level so
   * observers never see an inconsistent slice.
   *
   * @param {'produceNode'|'transferBus'|'compileServer'} nodeId
   * @returns {boolean} `true` if the upgrade was applied.
   */
  upgrade(nodeId) {
    const node = this._state[nodeId]
    if (!node) return false
    const cost = upgradeCost(node.baseCost, node.level, DEFAULT_GROWTH_RATE)
    if (this._state.bank.coins < cost) return false

    const newLevel = node.level + 1
    const bank = { ...this._state.bank, coins: this._state.bank.coins - cost }
    let nextNode
    if (nodeId === NODE_IDS.PRODUCE) {
      nextNode = {
        ...node,
        level: newLevel,
        // Each level shaves 3 % off the internal compile time (floor at 0.5 s)
        compileTime: Math.max(0.5, node.compileTime * 0.97),
        capacity: node.capacity + 10,
        walkSpeed: Math.min(3, node.walkSpeed + 0.01),
      }
    } else if (nodeId === NODE_IDS.BUS) {
      nextNode = {
        ...node,
        level: newLevel,
        movementSpeed: Math.min(2.5, node.movementSpeed + 0.05),
        loadingSpeed:  Math.max(300, node.loadingSpeed - 100),
        capacity: node.capacity + 10,
      }
    } else { // COMPILE
      nextNode = {
        ...node,
        level: newLevel,
        walkSpeed: Math.min(3, node.walkSpeed + 0.01),
        processingTime: Math.max(0.5, node.processingTime * 0.97),
        transporterCapacity: node.transporterCapacity + 3,
      }
    }
    this._state = { ...this._state, bank, [nodeId]: nextNode }
    this._commit(['bank', nodeId])
    return true
  }

  /**
   * Manual click on the ProduceNode — adds `amount` raw-code units directly.
   * Useful for the Floor-tap interaction and the FTUE tutorial.
   *
   * @param {number} amount
   */
  tapProduce(amount) {
    const add = Math.max(0, Number(amount) || 0)
    if (add === 0) return
    const p = this._state[NODE_IDS.PRODUCE]
    this._state = {
      ...this._state,
      [NODE_IDS.PRODUCE]: { ...p, rawCode: Math.min(p.capacity, p.rawCode + add) },
    }
    this._commit([NODE_IDS.PRODUCE])
  }

  /**
   * Read the upgrade cost for `nodeId` at its current level.  Observers use
   * this for "costs $N" labels and the affordability check in the upgrade
   * button.
   *
   * @param {'produceNode'|'transferBus'|'compileServer'} nodeId
   * @returns {number}
   */
  getUpgradeCost(nodeId) {
    const node = this._state[nodeId]
    if (!node) return Infinity
    return upgradeCost(node.baseCost, node.level, DEFAULT_GROWTH_RATE)
  }

  /** @see cumulativeUpgradeCost */
  getBulkUpgradeCost(nodeId, qty) {
    const node = this._state[nodeId]
    if (!node) return Infinity
    return cumulativeUpgradeCost(node.baseCost, node.level, qty, DEFAULT_GROWTH_RATE)
  }

  /**
   * Replace state with whatever is in `partial` (deep-merged at the subtree
   * level).  Invalid/absent subtrees fall back to defaults so corrupt save
   * data never crashes the engine.
   *
   * @param {Partial<EngineState>} partial
   */
  hydrate(partial) {
    const base = _defaultState()
    if (!partial || typeof partial !== 'object') {
      this._state = base
    } else {
      this._state = {
        bank: { ...base.bank, ...(partial.bank ?? {}) },
        [NODE_IDS.PRODUCE]: { ...base[NODE_IDS.PRODUCE], ...(partial[NODE_IDS.PRODUCE] ?? {}) },
        [NODE_IDS.BUS]:     { ...base[NODE_IDS.BUS],     ...(partial[NODE_IDS.BUS]     ?? {}) },
        [NODE_IDS.COMPILE]: { ...base[NODE_IDS.COMPILE], ...(partial[NODE_IDS.COMPILE] ?? {}) },
      }
    }
    this._commit(['bank', NODE_IDS.PRODUCE, NODE_IDS.BUS, NODE_IDS.COMPILE])
  }

  /** Serialise the current state tree as a plain JSON-safe object. */
  serialize() {
    return JSON.parse(JSON.stringify(this._state))
  }

  // ── Internal: RAF tick ────────────────────────────────────────────────────

  /**
   * One RAF frame.  Computes the time delta since the last frame, clamps it
   * to `MAX_DT_MS` for numerical stability, and hands off to `_advance`.
   */
  _tick(ts) {
    const prev = this._lastFrameTs || ts
    const rawDtMs = ts - prev
    this._lastFrameTs = ts
    if (rawDtMs <= 0) return
    const dtMs = Math.min(MAX_DT_MS, rawDtMs)
    this._advance(dtMs / 1000)
  }

  /**
   * Background-tab catch-up: when the document becomes visible again, check
   * the wall-clock gap since the last commit and replay it as a single
   * large `_advance` — capped at `MAX_CATCHUP_MS` so a week-long sleep
   * doesn't dump a century of production into one frame.
   */
  _handleVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    const gapMs = Math.min(MAX_CATCHUP_MS, Math.max(0, now - this._lastWallTs))
    if (gapMs > 0) {
      this._advance(gapMs / 1000)
    }
    // Reset the RAF-dt baseline so the first frame after focus doesn't
    // double-count the gap we just awarded.
    this._lastFrameTs = typeof performance !== 'undefined' ? performance.now() : 0
    this._lastWallTs = now
  }

  /**
   * Advance the simulation by `dt` seconds.  Pure math — no DOM access.
   *
   * Pipeline:
   *   1. ProduceNode generates raw-code  = effectiveThroughput(base, level) × dt
   *      (clamped to the node's `capacity`).
   *   2. TransferBus moves min(capacity, produceNode.rawCode) × movementSpeed × dt
   *      raw-code units into the CompileServer buffer per second.  Loading
   *      delay is modelled by dividing movementSpeed by (1 + loadingSpeed/1000).
   *   3. CompileServer consumes `transporterCapacity` raw-code every
   *      `processingTime` seconds and credits `conversionRate` coins per unit.
   *
   * @param {number} dt seconds
   */
  _advance(dt) {
    if (dt <= 0) return
    const produce = this._state[NODE_IDS.PRODUCE]
    const bus     = this._state[NODE_IDS.BUS]
    const comp    = this._state[NODE_IDS.COMPILE]
    const bank    = this._state.bank

    // 1. Production (uses the exponential × milestone curve from upgradeMath)
    const throughput = effectiveThroughput(produce.baseRatePerLevel, produce.level, DEFAULT_MILESTONES)
    let newRaw = produce.rawCode + throughput * dt
    if (newRaw > produce.capacity) newRaw = produce.capacity

    // 2. Transfer (no-op until the bus has a level)
    let movedRaw = 0
    if (bus.level > 0) {
      // Effective trips/sec with loading penalty folded in
      const loadingPenalty = 1 + (bus.loadingSpeed / 1000)
      const tripsPerSec = bus.movementSpeed / loadingPenalty
      const wantMove = bus.capacity * tripsPerSec * dt
      movedRaw = Math.min(newRaw, wantMove)
      newRaw -= movedRaw
    }

    // 3. Compile (no-op until the compiler has a level)
    let newBuffer = comp.buffer + movedRaw
    let newCycleElapsed = comp.cycleElapsed
    let coinsGained = 0
    if (comp.level > 0 && comp.processingTime > 0) {
      newCycleElapsed += dt
      // Drain complete cycles — tolerant of very large dt from catch-up.
      while (newCycleElapsed >= comp.processingTime && newBuffer > 0) {
        const batch = Math.min(comp.transporterCapacity, newBuffer)
        newBuffer -= batch
        coinsGained += batch * comp.conversionRate
        // Apply the compile-server's milestone curve to throughput too so a
        // heavily-upgraded compiler earns bonus coins per cycle.
        coinsGained *= milestoneMultiplier(comp.level, DEFAULT_MILESTONES) /
                       Math.max(1, milestoneMultiplier(comp.level - 1, DEFAULT_MILESTONES))
        newCycleElapsed -= comp.processingTime
      }
    }

    const nowWall = Date.now()
    this._state = {
      ...this._state,
      bank: {
        ...bank,
        coins: bank.coins + coinsGained,
        lifetime: bank.lifetime + Math.max(0, coinsGained),
        lastUpdateTs: nowWall,
      },
      [NODE_IDS.PRODUCE]: { ...produce, rawCode: newRaw },
      [NODE_IDS.BUS]:     { ...bus,     payload: movedRaw },
      [NODE_IDS.COMPILE]: { ...comp,    buffer: newBuffer, cycleElapsed: newCycleElapsed },
    }
    this._lastWallTs = nowWall

    // Mark every subtree as changed — the observer hook still short-circuits
    // re-renders via its own equality check, so an unchanged slice (e.g. a
    // ProduceNode the player hasn't levelled) won't trigger a React render.
    this._commit(['bank', NODE_IDS.PRODUCE, NODE_IDS.BUS, NODE_IDS.COMPILE])
  }

  /**
   * Bump the version counter and notify subscribers.  A future optimisation
   * can accept a `changedKeys` list to drive scoped subscribers; the
   * `useGameEngine` observer hook already short-circuits re-renders via its
   * own equality check, so this function currently fires all listeners.
   */
  _commit() {
    this._version++
    this._listeners.forEach((fn) => {
      try { fn() } catch (err) {
        // A buggy observer must not poison the rest — log and continue.
        console.error('[GameEngine] subscriber threw', err)
      }
    })
  }
}

/**
 * Shared process-wide singleton.  Import this from components and non-React
 * code alike — do NOT construct `new GameEngine()` elsewhere.
 *
 * @type {GameEngine}
 */
export const gameEngine = new GameEngine()

// ─── JSDoc type aliases (for editor tooltips only) ──────────────────────────

/**
 * @typedef {object} ProduceNodeState
 * @property {number} level
 * @property {number} compileTime
 * @property {number} capacity
 * @property {number} walkSpeed
 * @property {number} baseRatePerLevel
 * @property {number} rawCode
 * @property {number} baseCost
 *
 * @typedef {object} TransferBusState
 * @property {number} level
 * @property {number} movementSpeed
 * @property {number} loadingSpeed
 * @property {number} capacity
 * @property {number} payload
 * @property {'IDLE'|'LOADING'|'TRAVELING'} state
 * @property {number} baseCost
 *
 * @typedef {object} CompileServerState
 * @property {number} level
 * @property {number} walkSpeed
 * @property {number} processingTime
 * @property {number} transporterCapacity
 * @property {number} buffer
 * @property {number} conversionRate
 * @property {'IDLE'|'FETCHING'|'PROCESSING'} state
 * @property {number} cycleElapsed
 * @property {number} baseCost
 *
 * @typedef {object} BankState
 * @property {number} coins
 * @property {number} lifetime
 * @property {number} lastUpdateTs
 *
 * @typedef {object} EngineState
 * @property {BankState} bank
 * @property {ProduceNodeState} produceNode
 * @property {TransferBusState} transferBus
 * @property {CompileServerState} compileServer
 *
 * @typedef {{ type:'UPGRADE', node:'produceNode'|'transferBus'|'compileServer' }
 *          | { type:'TAP_PRODUCE', amount?:number }
 *          | { type:'RESET' }
 *          | { type:'HYDRATE', state: Partial<EngineState> }} EngineAction
 */
