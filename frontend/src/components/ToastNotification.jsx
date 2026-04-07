/**
 * ToastNotification.jsx
 *
 * Object-oriented notification system for MathScript Tycoon.
 *
 * Architecture
 * ────────────
 * ToastNotification is a self-contained React component.  It subscribes to the
 * shared GameEventBus on mount and renders a stacked list of transient toasts
 * that slide in from the right and auto-dismiss after a configurable duration.
 *
 * Any layer of the application (React, Phaser, setTimeout callbacks) can show
 * a notification with a single bus emit:
 *
 *   GameEventBus.emit('ui:notify', {
 *     icon:     '✅',           // emoji or short string
 *     title:    'UPGRADE COMPLETE',
 *     body:     'Code Den  →  Level 3',
 *     color:    '#22c55e',      // accent colour for the left border + glow
 *     duration: 4000,           // ms before auto-dismiss  (default 4000)
 *   })
 *
 * Notification shape
 * ──────────────────
 *   icon?    {string}  – Leading emoji / symbol (optional)
 *   title    {string}  – Bold headline (Orbitron font, uppercase)
 *   body?    {string}  – Supporting copy (Rajdhani font)
 *   color?   {string}  – CSS colour for accent border + shadow (default #60a5fa)
 *   duration?{number}  – Lifetime in ms (default 4000; max capped at 8000)
 *
 * Behaviour
 * ─────────
 * • Maximum QUEUE_MAX (4) toasts visible simultaneously.  When the limit is
 *   reached, the oldest toast is forcibly dismissed before the new one enters.
 * • Each toast enters with a slide-in-right animation and exits with a
 *   slide-out-right animation driven by the `exiting` flag.
 * • Reduced-motion: when `prefers-reduced-motion: reduce` is set, all
 *   transitions are replaced with a simple opacity fade.
 * • Manual dismiss: tap/click the × button to immediately begin the exit
 *   animation and remove the toast from the queue.
 * • The component is purely presentational — it never touches economy state.
 */

import { useEffect, useReducer, useRef, useCallback } from 'react'
import * as GameEventBus from '../utils/GameEventBus'

// ─── constants ───────────────────────────────────────────────────────────────

const QUEUE_MAX       = 4       // maximum simultaneously visible toasts
const DEFAULT_DUR     = 4000    // ms
const MAX_DUR         = 8000    // hard cap so callers can't freeze the screen
const EXIT_ANIM_MS    = 220     // duration of the slide-out animation
const ENTER_ANIM_MS   = 320     // duration of the slide-in animation

// ─── reducer — exported for unit testing ─────────────────────────────────────

export function toastReducer(state, action) {
  switch (action.type) {
    case 'PUSH': {
      let next = [...state, action.payload]
      // When the queue is full, flag the oldest toast as exiting (it will be
      // removed by a subsequent REMOVE action triggered by its exit animation).
      if (next.length > QUEUE_MAX) {
        next = next.map((t, i) => (i === 0 ? { ...t, exiting: true } : t))
      }
      return next
    }
    case 'EXIT':
      return state.map(t => (t.id === action.id ? { ...t, exiting: true } : t))
    case 'REMOVE':
      return state.filter(t => t.id !== action.id)
    default:
      return state
  }
}

// ─── component ───────────────────────────────────────────────────────────────

/**
 * ToastNotification
 *
 * Drop this component once anywhere in your React tree (GamePlayerPage renders
 * it near the root so it sits on top of all game layers).  No props needed.
 */
export default function ToastNotification() {
  const [toasts, dispatch] = useReducer(toastReducer, [])

  // Stable ref so the GameEventBus handler never captures a stale dispatch.
  const dispatchRef = useRef(dispatch)
  useEffect(() => { dispatchRef.current = dispatch }, [])

  // Timer map: toastId → timeoutId.  Stored in a ref so it survives re-renders
  // and is cleaned up properly on unmount.
  const timers = useRef(new Map())

  const scheduleRemoval = useCallback((id, delay) => {
    // Begin the exit animation after `delay`, then remove from DOM after the
    // animation completes.
    const exitTimer = setTimeout(() => {
      dispatchRef.current({ type: 'EXIT', id })
      const removeTimer = setTimeout(() => {
        dispatchRef.current({ type: 'REMOVE', id })
        timers.current.delete(id)
      }, EXIT_ANIM_MS + 20)
      timers.current.set(id + '_remove', removeTimer)
    }, delay)
    timers.current.set(id, exitTimer)
  }, [])

  // Subscribe to 'ui:notify' on mount and clean up on unmount.
  useEffect(() => {
    const unsubscribe = GameEventBus.on('ui:notify', (payload) => {
      const id       = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const duration = Math.min(payload.duration ?? DEFAULT_DUR, MAX_DUR)
      const toast    = {
        id,
        icon:     payload.icon  ?? '',
        title:    payload.title ?? '',
        body:     payload.body  ?? '',
        color:    payload.color ?? '#60a5fa',
        exiting:  false,
      }
      dispatchRef.current({ type: 'PUSH', payload: toast })
      scheduleRemoval(id, duration)
    })

    return () => {
      unsubscribe()
      // Cancel all pending timers on unmount.
      timers.current.forEach(t => clearTimeout(t))
      timers.current.clear()
    }
  }, [scheduleRemoval])

  const handleDismiss = useCallback((id) => {
    // Cancel the auto-dismiss timer and begin the exit animation immediately.
    const timer = timers.current.get(id)
    if (timer != null) { clearTimeout(timer); timers.current.delete(id) }
    dispatchRef.current({ type: 'EXIT', id })
    const removeTimer = setTimeout(() => {
      dispatchRef.current({ type: 'REMOVE', id })
      timers.current.delete(id + '_remove')
    }, EXIT_ANIM_MS + 20)
    timers.current.set(id + '_remove', removeTimer)
  }, [])

  if (toasts.length === 0) return null

  return (
    <>
      {/* Keyframe animations injected once via a <style> tag so we stay
          dependency-free (no CSS modules, no styled-components). */}
      <style>{STYLES}</style>

      <div
        aria-live="polite"
        aria-atomic="false"
        style={{
          position:   'fixed',
          top:        72,           // below the game HUD (typically 56-64px)
          right:      12,
          zIndex:     840,          // above game canvas, below modal overlays
          display:    'flex',
          flexDirection: 'column',
          gap:        8,
          pointerEvents: 'none',    // stack itself is click-through
          maxWidth:   300,
        }}
      >
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            toast={toast}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </>
  )
}

// ─── individual toast ─────────────────────────────────────────────────────────

function Toast({ toast, onDismiss }) {
  const { id, icon, title, body, color, exiting } = toast

  return (
    <div
      role="status"
      className={exiting ? 'toast-notif toast-notif--exit' : 'toast-notif toast-notif--enter'}
      style={{
        '--toast-color': color,
        pointerEvents: 'auto',
      }}
    >
      {/* Left accent bar */}
      <div className="toast-notif__bar" />

      {/* Content */}
      <div className="toast-notif__content">
        {icon && <span className="toast-notif__icon">{icon}</span>}
        <div className="toast-notif__text">
          {title && (
            <div className="toast-notif__title">{title}</div>
          )}
          {body && (
            <div className="toast-notif__body">{body}</div>
          )}
        </div>
      </div>

      {/* Dismiss button */}
      <button
        className="toast-notif__close"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const STYLES = `
@keyframes toast-slide-in {
  from { opacity: 0; transform: translateX(calc(100% + 20px)); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes toast-slide-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(calc(100% + 20px)); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes toast-slide-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes toast-slide-out { from { opacity: 1; } to { opacity: 0; } }
}

.toast-notif {
  position: relative;
  display: flex;
  align-items: stretch;
  background: linear-gradient(135deg, #0d1a2e 0%, #0f2040 100%);
  border: 1px solid color-mix(in srgb, var(--toast-color) 40%, transparent);
  border-radius: 10px;
  overflow: hidden;
  box-shadow:
    0 0 18px color-mix(in srgb, var(--toast-color) 28%, transparent),
    0 4px 20px rgba(0, 0, 0, 0.55);
  min-width: 210px;
  max-width: 300px;
}

.toast-notif--enter {
  animation: toast-slide-in ${ENTER_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.toast-notif--exit {
  animation: toast-slide-out ${EXIT_ANIM_MS}ms ease-in forwards;
}

.toast-notif__bar {
  width: 4px;
  flex-shrink: 0;
  background: var(--toast-color);
  box-shadow: 0 0 8px var(--toast-color);
}

.toast-notif__content {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 10px 10px 12px;
  flex: 1;
  min-width: 0;
}

.toast-notif__icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 1px;
}

.toast-notif__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast-notif__title {
  font-family: 'Orbitron', monospace;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.5px;
  color: var(--toast-color);
  text-shadow: 0 0 10px color-mix(in srgb, var(--toast-color) 70%, transparent);
  text-transform: uppercase;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toast-notif__body {
  font-family: 'Rajdhani', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.toast-notif__close {
  background: transparent;
  border: none;
  color: #475569;
  font-size: 11px;
  cursor: pointer;
  padding: 6px 8px 0 0;
  line-height: 1;
  flex-shrink: 0;
  align-self: flex-start;
  transition: color 0.15s;
}
.toast-notif__close:hover {
  color: #94a3b8;
}
`
