/**
 * featureFlags.js — Dynamic feature-flag system for The Math Script.
 *
 * Flags are resolved from three sources in priority order:
 *
 *   1. Database (via GET /api/feature-flags, fetched on app boot)   ← highest
 *      Admin Portal toggles are reflected within 30 seconds everywhere.
 *
 *   2. window.__FEATURE_FLAGS__.<FLAG>
 *      Azure App Service runtime injection — no redeploy needed.
 *      Useful as an emergency kill-switch while the DB is unreachable.
 *
 *   3. import.meta.env.VITE_FEATURE_<FLAG>
 *      Build-time .env value — the safe fallback during local development.
 *
 *   4. false (safe default — feature off)
 *
 * USAGE
 * ─────
 * import { FEATURES, FeatureGate, initFeatureFlags } from '../utils/featureFlags'
 *
 * // In App.jsx useEffect — fetch flags from API and re-render when ready
 * initFeatureFlags(() => forceUpdate())
 *
 * // Boolean check
 * if (FEATURES.CONCRETE_PACKERS) { ... }
 *
 * // Guard component — renders children only when flag is on
 * <FeatureGate flag="CONCRETE_PACKERS">
 *   <ConcretePackersButton />
 * </FeatureGate>
 *
 * ADDING A NEW FLAG
 * ─────────────────
 * 1. Register it in FLAG_DEFINITIONS below.
 * 2. Seed it in database.py init_db() INSERT … ON CONFLICT DO NOTHING.
 * 3. Use FEATURES.MY_FLAG or <FeatureGate flag="MY_FLAG"> in the UI.
 */

// ── Flag registry ─────────────────────────────────────────────────────────────
const FLAG_DEFINITIONS = {
  /** "The Concrete Packers" — drag-and-drop addition/place-value game (age 5–7) */
  CONCRETE_PACKERS: 'VITE_FEATURE_CONCRETE_PACKERS',
  /** "Potion Alchemists" — fraction equivalence pouring game (age 8–13) */
  POTION_ALCHEMISTS: 'VITE_FEATURE_POTION_ALCHEMISTS',
  /** "Orbital Engineers" — geometry/angles game (coming soon) */
  ORBITAL_ENGINEERS: 'VITE_FEATURE_ORBITAL_ENGINEERS',
}

// ── Static resolution (env vars + window injection) ───────────────────────────
function resolveStaticFlag(envKey) {
  const runtimeFlags =
    typeof window !== 'undefined' && window.__FEATURE_FLAGS__
      ? window.__FEATURE_FLAGS__
      : {}
  const runtimeKey = envKey.replace(/^VITE_/, '')
  if (Object.prototype.hasOwnProperty.call(runtimeFlags, runtimeKey)) {
    const val = String(runtimeFlags[runtimeKey]).toLowerCase()
    return val === 'true' || val === '1' || val === 'yes'
  }
  const buildVal = import.meta.env[envKey]
  if (buildVal !== undefined) {
    const val = String(buildVal).toLowerCase()
    return val === 'true' || val === '1' || val === 'yes'
  }
  return false
}

// ── Mutable FEATURES object ───────────────────────────────────────────────────
// Initialized from env vars; `initFeatureFlags()` merges DB values on top.
// Components read this object at render time — after `initFeatureFlags()`
// triggers a React state update, all gates re-evaluate with the live values.
export const FEATURES = Object.fromEntries(
  Object.entries(FLAG_DEFINITIONS).map(([name, envKey]) => [name, resolveStaticFlag(envKey)])
)

let _initialized = false

/**
 * Fetch live flag values from GET /api/feature-flags and merge them into
 * the FEATURES object.  Call this once on app boot (App.jsx useEffect).
 *
 * @param {() => void} onUpdate  Called after FEATURES is updated so React
 *                               can schedule a re-render.
 */
export async function initFeatureFlags(onUpdate) {
  if (_initialized) return
  try {
    const res = await fetch('/api/feature-flags')
    if (!res.ok) return
    const remote = await res.json()       // { CONCRETE_PACKERS: true, ... }
    let changed = false
    for (const [name, isActive] of Object.entries(remote)) {
      const next = Boolean(isActive)
      if (FEATURES[name] !== next) {
        FEATURES[name] = next
        changed = true
      }
    }
    _initialized = true
    if (changed && typeof onUpdate === 'function') onUpdate()
  } catch {
    // Network failure — keep env-var defaults; never crash the app
  }
}

/**
 * FeatureGate component.
 * Renders `children` only when the named flag is enabled.
 * Renders `fallback` (default null) when the flag is off.
 *
 * @param {{ flag: string, fallback?: React.ReactNode, children: React.ReactNode }} props
 */
export function FeatureGate({ flag, fallback = null, children }) {
  if (!FEATURES[flag]) return fallback
  return children
}

