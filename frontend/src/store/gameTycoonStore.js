/**
 * gameTycoonStore.js
 *
 * Zustand global store for Mathscript Tycoon core game state.
 *
 * ─── Why Zustand? ──────────────────────────────────────────────────────────
 * The production tick fires every 200 ms and updates coins, compilerBuffer,
 * bus/compiler state machines, and floor output bins.  Using React useState
 * for all these values causes the entire GamePlayerPage component tree to
 * re-render on every tick, which becomes a bottleneck as the game scales.
 *
 * Moving the high-frequency economic state into a Zustand store allows:
 *   • React components to subscribe to only the slices they need
 *     (e.g. the top-bar only re-renders when `coins` changes).
 *   • Background tick callbacks to call `getState()` / `setState()` directly
 *     without needing stale-closure-safe refs for these values.
 *   • Multi-city buildings to share state without prop-drilling.
 *
 * ─── Store slices ──────────────────────────────────────────────────────────
 *
 *  Economic
 *    coins          — current spendable dollars
 *    lifetime       — all-time earned dollars (prestige currency)
 *    compilerBuffer — RC queued in the warehouse waiting to compile
 *
 *  Bus (Elevator) state machine
 *    busState       — 'IDLE'|'MOVING_UP'|'LOADING'|'MOVING_DOWN'|'UNLOADING'
 *    busPayload     — RC currently carried in the elevator car
 *    busCurrentFloor — slot index (-1 = ground, 0..N-1 = floor from bottom)
 *    busTransitionMs — CSS transition duration for the elevator car position
 *    loadingFloor   — floor index being loaded (null when not loading)
 *
 *  Compiler state machine
 *    compilerState  — 'IDLE'|'FETCHING'|'PROCESSING'
 *    compileProgress — 0–100 percent of the current processing cycle
 *
 * All setters follow the pattern `set<Field>(value)` and accept either a
 * direct value or a functional updater `(prev) => next` — mirroring React's
 * useState signature so call-sites require minimal changes.
 */

import { create } from 'zustand'

export const useTycoonStore = create((set, get) => ({
  // ── Economic state ─────────────────────────────────────────────────────────
  coins:          0,
  lifetime:       0,
  compilerBuffer: 0,

  setCoins: (v) => set(s => ({ coins: typeof v === 'function' ? v(s.coins) : v })),
  setLifetime: (v) => set(s => ({ lifetime: typeof v === 'function' ? v(s.lifetime) : v })),
  setCompilerBuffer: (v) => set(s => ({ compilerBuffer: typeof v === 'function' ? v(s.compilerBuffer) : v })),

  // Atomic update used by the production tick to avoid two separate set calls
  addEarnings: (earned) => set(s => ({
    coins:    s.coins    + earned,
    lifetime: s.lifetime + earned,
  })),

  // ── Bus (Elevator) state machine ───────────────────────────────────────────
  busState:        'IDLE',
  busPayload:      0,
  busCurrentFloor: -1,
  busTransitionMs: 800,
  loadingFloor:    null,

  setBusState: (v) => set(s => ({ busState: typeof v === 'function' ? v(s.busState) : v })),
  setBusPayload: (v) => set(s => ({ busPayload: typeof v === 'function' ? v(s.busPayload) : v })),
  setBusCurrentFloor: (v) => set(s => ({ busCurrentFloor: typeof v === 'function' ? v(s.busCurrentFloor) : v })),
  setBusTransitionMs: (v) => set(s => ({ busTransitionMs: typeof v === 'function' ? v(s.busTransitionMs) : v })),
  setLoadingFloor: (v) => set(s => ({ loadingFloor: typeof v === 'function' ? v(s.loadingFloor) : v })),

  // ── Compiler state machine ─────────────────────────────────────────────────
  compilerState:   'IDLE',
  compileProgress: 0,

  setCompilerState: (v) => set(s => ({ compilerState: typeof v === 'function' ? v(s.compilerState) : v })),
  setCompileProgress: (v) => set(s => ({ compileProgress: typeof v === 'function' ? v(s.compileProgress) : v })),

  // ── Bulk hydrate — used on save/load and offline earnings apply ────────────
  // Call this with the subset of fields you want to overwrite at once.
  hydrateTycoonStore: (partial) => set(partial),
}))
