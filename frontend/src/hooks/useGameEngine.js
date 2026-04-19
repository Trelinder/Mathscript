/**
 * useGameEngine.js
 *
 * React adapter for the vanilla `GameEngine` singleton.  Components become
 * *observers* of the engine: they render from the selected slice and the
 * engine's `requestAnimationFrame` loop drives all simulation.  A component
 * using this hook only re-renders when its selected slice actually changes
 * — the RAF loop bumping `bank.coins` once per frame does NOT force every
 * subscribed component to reconcile.
 *
 * ─── Why `useSyncExternalStore`? ────────────────────────────────────────────
 * React 18+'s `useSyncExternalStore` is the officially-blessed primitive for
 * subscribing to an external mutable store.  It:
 *   • handles concurrent-mode tearing for us,
 *   • only calls the selector when the engine commits,
 *   • only re-renders when the selector result changes (via the
 *     `isEqual` fn we pass, or `Object.is` by default).
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *   import { useGameEngine } from '../hooks/useGameEngine'
 *   import { gameEngine } from '../game/GameEngine'
 *
 *   function BankDisplay() {
 *     const coins = useGameEngine(s => s.bank.coins)
 *     return <span>${coins.toFixed(0)}</span>
 *   }
 *
 *   function UpgradeBusBtn() {
 *     const bus = useGameEngine(s => s.transferBus, shallowEqual)
 *     return (
 *       <button onClick={() => gameEngine.dispatch({ type:'UPGRADE', node:'transferBus' })}>
 *         Upgrade Bus · Lv {bus.level}
 *       </button>
 *     )
 *   }
 *
 * ─── Lifecycle ──────────────────────────────────────────────────────────────
 * Mount `<GameEngineProvider>` (or call `gameEngine.start()` yourself in an
 * effect) exactly once, near the root of the React tree, so the RAF loop is
 * running by the time observer components mount.  The provider handles both
 * `start()` on mount and `stop()` on unmount so hot-module reload and route
 * changes don't leak an orphan RAF loop.
 */

import { useSyncExternalStore, useEffect, useRef, useCallback } from 'react'

import { gameEngine } from '../game/GameEngine.js'

/**
 * Identity selector — returned when callers pass `undefined`.  Kept outside
 * the hook so its reference is stable across renders.
 *
 * @param {import('../game/GameEngine.js').EngineState} s
 * @returns {import('../game/GameEngine.js').EngineState}
 */
const _identity = (s) => s

/**
 * Shallow-equality helper for object slices.  Export so callers don't have
 * to import it from `react-redux` or write their own.
 *
 * @template {object} T
 * @param {T} a
 * @param {T} b
 * @returns {boolean}
 */
export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null) return false
  if (typeof b !== 'object' || b === null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i]
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!Object.is(a[k], b[k])) return false
  }
  return true
}

/**
 * Subscribe to a slice of the GameEngine state.  The component re-renders
 * only when the slice changes (compared with `isEqual`, default `Object.is`).
 *
 * @template T
 * @param {(s: import('../game/GameEngine.js').EngineState) => T} [selector]
 *        Pure function returning the slice this component cares about.
 *        Defaults to the full state tree (use sparingly — any engine commit
 *        will re-render the component).
 * @param {(a:T, b:T) => boolean} [isEqual]
 *        Equality check.  Defaults to `Object.is`; pass `shallowEqual` for
 *        object slices.
 * @returns {T} The currently-selected slice.
 */
export function useGameEngine(selector = _identity, isEqual) {
  // Keep the previous snapshot across renders so we can short-circuit via
  // `isEqual` — without this, `useSyncExternalStore` would compare slice
  // references with `Object.is`, which defeats the point of selecting.
  const lastSliceRef = useRef()
  const hasRef = useRef(false)

  const getSnapshot = useCallback(() => {
    const next = selector(gameEngine.getState())
    if (!hasRef.current) {
      hasRef.current = true
      lastSliceRef.current = next
      return next
    }
    const prev = lastSliceRef.current
    const same = isEqual ? isEqual(prev, next) : Object.is(prev, next)
    if (same) return prev
    lastSliceRef.current = next
    return next
  }, [selector, isEqual])

  const subscribe = useCallback((fn) => gameEngine.subscribe(fn), [])

  // `useSyncExternalStore` guarantees concurrent-safe tearing-free reads.
  // The third arg (`getServerSnapshot`) mirrors the client snapshot for SSR.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * React provider that owns the RAF loop's start/stop lifecycle.  Drop this
 * near the root of your tree — e.g. `<GameEngineProvider><App/></GameEngineProvider>`
 * — and the engine will be running for every observer mounted below it.
 *
 * Children render unchanged; the provider contributes *no* DOM.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactNode}
 */
export function GameEngineProvider({ children }) {
  useEffect(() => {
    gameEngine.start()
    return () => gameEngine.stop()
  }, [])
  return children
}
