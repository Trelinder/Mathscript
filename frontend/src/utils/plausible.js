/**
 * plausible.js — helpers for Plausible Analytics custom events.
 *
 * Uses window.plausible if the script is loaded (index.html <head>).
 * Falls back to a no-op so non-production environments are silent.
 */

/**
 * Fire a Plausible custom event.
 * @param {string} name  — event name (e.g. 'start_clicked')
 * @param {object} [props] — optional key/value props (strings/numbers only)
 */
export function trackPlausible(name, props) {
  try {
    if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
      window.plausible(name, props ? { props } : undefined)
    }
  } catch { /* never throw */ }
}
