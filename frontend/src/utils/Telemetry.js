/**
 * Telemetry.js — Fire-and-forget event tracker.
 *
 * Usage:
 *   trackEvent('spell_cast', { correct: true, level: 3 })
 *   trackEvent('tycoon_purchase', { upgrade_name: 'AutoScribe', cost: 10 })
 */

const BASE_URL = import.meta.env.VITE_API_BASE ?? ''

function getSessionId() {
  try {
    return window.localStorage.getItem('mathscript_session_id') || 'anon'
  } catch {
    return 'anon'
  }
}

/**
 * Send a telemetry event to /api/client-telemetry without blocking the UI.
 *
 * @param {string} eventType
 * @param {Record<string, unknown>} [metadata]
 */
export function trackEvent(eventType, metadata = {}) {
  const payload = {
    event_type: eventType,
    session_id: getSessionId(),
    metadata,
    timestamp: new Date().toISOString(),
  }
  // Use sendBeacon when available (page unload safe), fall back to fetch
  const url = `${BASE_URL}/api/client-telemetry`
  const body = JSON.stringify(payload)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
  } else {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* silent */ })
  }
}
