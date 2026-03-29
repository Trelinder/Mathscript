/**
 * featureFlags.js — runtime feature-flag system for The Math Script.
 *
 * Flags are read from Vite's `import.meta.env` at build time, but because
 * Vite inlines `VITE_*` variables, you can also override them at *runtime*
 * by injecting `window.__FEATURE_FLAGS__` before the React bundle loads
 * (e.g. via an Azure App Service Application Setting rendered into a tiny
 * inline <script> in index.html — no redeploy needed).
 *
 * Priority (highest wins):
 *   1. window.__FEATURE_FLAGS__.<FLAG>   ← runtime injection (no redeploy)
 *   2. import.meta.env.VITE_<FLAG>       ← build-time .env
 *   3. false                              ← safe default (off)
 *
 * USAGE
 * ─────
 * import { FEATURES, FeatureGate } from '../utils/featureFlags'
 *
 * // Boolean check
 * if (FEATURES.CONCRETE_PACKERS) { ... }
 *
 * // Gate component (renders children only when flag is on)
 * <FeatureGate flag="CONCRETE_PACKERS">
 *   <ConcretePackersButton />
 * </FeatureGate>
 *
 * ADDING A NEW FLAG
 * ─────────────────
 * 1. Add `VITE_FEATURE_MY_FLAG=false` to .env.example (and your real .env)
 * 2. Register it in FLAG_DEFINITIONS below with a description.
 * 3. Use FEATURES.MY_FLAG or <FeatureGate flag="MY_FLAG"> in the UI.
 * 4. Add the matching FEATURE_MY_FLAG env var to your Azure App Service
 *    Application Settings (prefix is stripped — see window injection note).
 */

/** All known feature flags with their descriptions. */
const FLAG_DEFINITIONS = {
  /** "The Concrete Packers" — drag-and-drop addition/place-value game for age 5-7 */
  CONCRETE_PACKERS: 'VITE_FEATURE_CONCRETE_PACKERS',
  /** "Potion Alchemists" — fraction equivalence pouring game for age 8-11 */
  POTION_ALCHEMISTS: 'VITE_FEATURE_POTION_ALCHEMISTS',
}

/**
 * Resolve a single flag to a boolean.
 * Accepts "true" / "1" / "yes" as truthy; everything else is falsy.
 */
function resolveFlag(envKey) {
  // 1. Runtime window injection (Azure Application Settings → index.html script)
  const runtimeFlags =
    typeof window !== 'undefined' && window.__FEATURE_FLAGS__
      ? window.__FEATURE_FLAGS__
      : {}
  const runtimeKey = envKey.replace(/^VITE_/, '')  // strip Vite prefix for runtime map
  if (Object.prototype.hasOwnProperty.call(runtimeFlags, runtimeKey)) {
    const val = String(runtimeFlags[runtimeKey]).toLowerCase()
    return val === 'true' || val === '1' || val === 'yes'
  }

  // 2. Build-time Vite env var
  const buildVal = import.meta.env[envKey]
  if (buildVal !== undefined) {
    const val = String(buildVal).toLowerCase()
    return val === 'true' || val === '1' || val === 'yes'
  }

  // 3. Default: off
  return false
}

/** Resolved feature flags object — read-only at runtime. */
export const FEATURES = Object.fromEntries(
  Object.entries(FLAG_DEFINITIONS).map(([name, envKey]) => [name, resolveFlag(envKey)])
)

/**
 * FeatureGate component.
 *
 * Renders its children only when the named feature flag is enabled.
 * Renders `fallback` (default null) when the flag is off.
 *
 * @param {{ flag: string, fallback?: React.ReactNode, children: React.ReactNode }} props
 */
export function FeatureGate({ flag, fallback = null, children }) {
  if (!FEATURES[flag]) return fallback
  return children
}
