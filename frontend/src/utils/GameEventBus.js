/**
 * GameEventBus.js — Synchronous event bus for the MathScript Tycoon pipeline.
 *
 * Decouples the core economy state machine (React, GamePlayerPage.jsx) from
 * the rendering engine (Phaser, IsoTycoonScene.js).  The React layer emits
 * events; the Phaser layer subscribes to them without either side holding a
 * direct reference to the other.
 *
 * Events emitted by GamePlayerPage.jsx
 * ──────────────────────────────────────
 *  'floor:progress'  { floorId: string, progress: number }   0.0 – 1.0 float
 *    Fired on every animation frame tick while a floor is producing.
 *    Drives the character animation state machine in IsoTycoonScene.
 *
 *  'floor:cycle'     { floorId: string, earned: number }
 *    Fired once per completed production cycle (progress reached 1.0).
 *    Triggers the floating currency particle effect anchored to the desk.
 *
 *  'floor:upgraded'  { floorId: string, newLevel: number }
 *    Fired after a successful upgrade purchase.
 *    Triggers the workstation texture tier swap in IsoTycoonScene.
 */

const _listeners = new Map()

/**
 * Subscribe to an event.
 * @param {string}   event   - Event name (e.g. 'floor:progress')
 * @param {Function} handler - Callback invoked with the event payload
 * @returns {Function} Unsubscribe function — call it to remove the listener
 */
export function on(event, handler) {
  if (!_listeners.has(event)) _listeners.set(event, new Set())
  _listeners.get(event).add(handler)
  return () => off(event, handler)
}

/**
 * Unsubscribe a previously registered handler.
 * @param {string}   event
 * @param {Function} handler
 */
export function off(event, handler) {
  _listeners.get(event)?.delete(handler)
}

/**
 * Emit an event synchronously to all registered handlers.
 * @param {string} event
 * @param {*}      payload
 */
export function emit(event, payload) {
  _listeners.get(event)?.forEach(fn => fn(payload))
}

/**
 * Remove ALL handlers for every event.
 * Useful in test teardown or when the game is fully reset.
 */
export function clear() {
  _listeners.clear()
}
