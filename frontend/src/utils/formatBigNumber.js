/**
 * formatBigNumber.js
 *
 * Canonical large-number formatter for the Mathscript incremental game.
 *
 * ─── Why a single utility? ────────────────────────────────────────────────────
 * The codebase previously had five independent formatters (fmtN in
 * GamePlayerPage, formatBinAmount in PlayScene, _fmtCoins / _fmtRate in
 * IsoTycoonScene, and inline template literals in CombatScene and MiniGame).
 * They were inconsistent — some stopped at M, some at B, none handled numbers
 * above 1e12.  As the economy scales exponentially, raw numbers would overflow
 * their containing elements at ~1e13.
 *
 * This module provides two functions that are the single source of truth for
 * all number display across React, Phaser, and plain-JS contexts:
 *
 *   formatBigNumber(n, opts?)  — plain compact notation  e.g. "4.5T", "12.3Qa"
 *   formatCurrency(n, opts?)   — same but prefixed with $ e.g. "$4.5T"
 *
 * ─── Tier table ───────────────────────────────────────────────────────────────
 *
 *   n < 1 000                  →  floor(n)         e.g.  "42"
 *   n < 1 000 000              →  X.XXK             e.g.  "4.52K"
 *   n < 1 000 000 000          →  X.XXM             e.g.  "3.14M"
 *   n < 1e12                   →  X.XXB             e.g.  "1.00B"
 *   n < 1e15                   →  X.XXT             e.g.  "2.50T"
 *   n < 1e18                   →  X.XXQa            e.g.  "9.87Qa"
 *   n < 1e21                   →  X.XXQi            e.g.  "1.23Qi"
 *   n < 1e24                   →  X.XXSx            e.g.  "5.67Sx"
 *   n < 1e24                   →  X.XXSp            e.g.  "3.21Sp"
 *   n >= 1e24 & < 1e27         →  1–999.99Sp
 *   n >= 1e27                  →  alphabetical       e.g.  "1aa", "1ab", "3.5bz"
 *   very large (beyond zz)     →  scientific         e.g.  "1.23e+2055"
 *
 * Decimal places default to 2.  The mantissa is **truncated** (not rounded)
 * to avoid jump artefacts — e.g. 999 999 truncates to "999.99K" rather than
 * rounding up to "1000K".  Trailing decimal zeros are stripped unless
 * `keepTrailingZeros` is set.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { formatBigNumber, formatCurrency } from '../utils/formatBigNumber.js'
 *
 *   formatBigNumber(0)           // "0"
 *   formatBigNumber(999)         // "999"
 *   formatBigNumber(1500)        // "1.5K"
 *   formatBigNumber(1_000_000)   // "1M"
 *   formatBigNumber(1_500_000)   // "1.5M"
 *   formatBigNumber(1.5e12)      // "1.5T"
 *   formatBigNumber(1.5e15)      // "1.5Qa"
 *   formatBigNumber(-9999)       // "-9.99K"
 *
 *   formatCurrency(1500)         // "$1.5K"
 *   formatCurrency(1.5e9)        // "$1.5B"
 *
 *   formatBigNumber(1500, { decimals: 1 })              // "1.5K"
 *   formatBigNumber(1500, { keepTrailingZeros: true })  // "1.50K"
 *
 * ─── Rate variant ─────────────────────────────────────────────────────────────
 *
 *   formatRate(n, opts?)  — for per-second production rates.  Numbers < 10 are
 *   shown with two decimal places for precision; larger values use compact form.
 *
 *   formatRate(0.005)    // "0"
 *   formatRate(3.14)     // "3.14"
 *   formatRate(10)       // "10"
 *   formatRate(12500)    // "12.5K"
 */

// ─── Tier definitions (sorted descending by threshold) ───────────────────────
// Suffixes follow standard incremental-game convention:
//   K  Thousand      1e3
//   M  Million       1e6
//   B  Billion       1e9
//   T  Trillion      1e12
//   Qa Quadrillion   1e15
//   Qi Quintillion   1e18
//   Sx Sextillion    1e21
//   Sp Septillion    1e24
//   aa–az            1e27–1e102  (26 tiers, +3 exponent each)
//   ba–zz            1e105–      (beyond, up to zz = 1e27 + 25*3*26 tiers)
//
// The alphabetical (aa, ab, …, zz) suffixes are the standard incremental-game
// extension used when numbers grow beyond the named Latin prefixes.
// Each tier represents ×1000 (three orders of magnitude) of the previous one.

// Build the alphabetical tiers at module load time.  They start at aa = 1e27
// and use 26×26 = 676 combinations (aa…zz), covering values up to ~1e2055.
const _ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const _ALPHA_TIERS = (() => {
  const tiers = []
  let exp = 27
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      tiers.push({ threshold: Math.pow(10, exp), suffix: _ALPHA_CHARS[i] + _ALPHA_CHARS[j] })
      exp += 3
    }
  }
  // Reverse so the highest threshold comes first (matches the search loop direction)
  tiers.reverse()
  return tiers
})()

const TIERS = [
  ..._ALPHA_TIERS,
  { threshold: 1e24, suffix: 'Sp' },
  { threshold: 1e21, suffix: 'Sx' },
  { threshold: 1e18, suffix: 'Qi' },
  { threshold: 1e15, suffix: 'Qa' },
  { threshold: 1e12, suffix: 'T'  },
  { threshold: 1e9,  suffix: 'B'  },
  { threshold: 1e6,  suffix: 'M'  },
  { threshold: 1e3,  suffix: 'K'  },
]

/**
 * _truncateToFixed(value, decimals)
 *
 * Formats `value` to `decimals` decimal places using truncation (floor)
 * rather than the default rounding of Number.toFixed().  This prevents
 * artefacts like "1000K" when the unformatted value is 999 999.
 *
 * @param {number} value    – Positive finite number.
 * @param {number} decimals – Number of decimal places (0–10).
 * @returns {string}
 */
function _truncateToFixed(value, decimals) {
  if (decimals <= 0) return Math.floor(value).toString()
  const factor = Math.pow(10, decimals)
  const truncated = Math.floor(value * factor) / factor
  return truncated.toFixed(decimals)
}

/**
 * formatBigNumber(n, opts?)
 *
 * Converts a numeric value to a compact human-readable string.
 *
 * @param {number}  n                       – The value to format.
 * @param {object}  [opts={}]
 * @param {number}  [opts.decimals=2]       – Maximum decimal places (0–3).
 * @param {boolean} [opts.keepTrailingZeros=false] – Keep trailing decimal zeros.
 * @returns {string}
 */
export function formatBigNumber(n, opts = {}) {
  const { decimals = 2, keepTrailingZeros = false } = opts

  if (!Number.isFinite(n)) return '0'

  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  // Sub-thousand: plain integer
  if (abs < 1e3) return sign + Math.floor(abs).toString()

  // Find the right tier and format with truncation (includes aa–zz alphabetical tiers)
  for (const { threshold, suffix } of TIERS) {
    if (abs >= threshold) {
      let formatted = _truncateToFixed(abs / threshold, decimals)
      if (!keepTrailingZeros) {
        // Strip trailing zeros after decimal point, then trailing dot
        formatted = formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
      }
      return sign + formatted + suffix
    }
  }

  // Fallback: scientific notation for values beyond the zz tier (~1e2055)
  return sign + abs.toExponential(2)
}

/**
 * formatCurrency(n, opts?)
 *
 * Like formatBigNumber but prefixed with a dollar sign.
 * Use for all coin / cash / dollar displays.
 *
 * @param {number}  n
 * @param {object}  [opts={}]
 * @returns {string}  e.g. "$1.5K"
 */
export function formatCurrency(n, opts = {}) {
  return '$' + formatBigNumber(n, opts)
}

/**
 * formatRate(n, opts?)
 *
 * Formats a per-second rate value.  Values below 0.01 return "0".
 * Values below 10 use toFixed(2) for precision.  Larger values use compact.
 *
 * @param {number}  n
 * @param {object}  [opts={}]
 * @returns {string}
 */
export function formatRate(n, opts = {}) {
  if (!Number.isFinite(n) || n < 0.01) return '0'
  if (n < 10) return n.toFixed(2)
  return formatBigNumber(n, opts)
}

/**
 * formatDamage(n)
 *
 * Formats a combat damage or HP value.  Integers below 1000 are shown as-is;
 * larger values use compact notation with 1 decimal place to stay narrow in the
 * Phaser canvas where space is tight.
 *
 * @param {number}  n
 * @returns {string}  e.g. "850", "1.5K", "4.2M"
 */
export function formatDamage(n) {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs < 1e3) return Math.floor(abs).toString()
  return formatBigNumber(n, { decimals: 1 })
}
