/**
 * easings.js
 *
 * Custom easing functions for tactile UI animation.
 *
 * All functions accept a normalized time parameter `t` in [0, 1] and return
 * a scalar output.  They are pure, dependency-free, and safe to call from any
 * thread or delta-time loop.
 *
 * Usage with Phaser 3 tweens:
 *
 *   import { easeOutBack } from '../utils/easings.js'
 *
 *   this.tweens.add({
 *     targets: gameObject,
 *     scaleX:  1,
 *     scaleY:  1,
 *     duration: 320,
 *     ease:    (t) => easeOutBack(t),
 *   })
 *
 * ─── Functions ───────────────────────────────────────────────────────────────
 *
 *  easeOutBack(t, overshoot)
 *    Polynomial curve that overshoots the target value and snaps back.
 *    The output briefly exceeds 1.0 near t ≈ 0.6 before settling at exactly
 *    1.0 at t = 1.  Ideal for the release phase of a tactile button press.
 *    Default overshoot constant 1.70158 produces ~10 % overshoot.
 *
 *  easeInQuad(t)
 *    Quadratic ease-in — smooth acceleration from zero velocity.  Appropriate
 *    for the compress phase of a button press because the movement should feel
 *    like a physical object being pushed in.
 *
 *  springDecay(t, tension, friction)
 *    Physics-based spring formula.  Simulates a damped harmonic oscillator:
 *    starts at 0, oscillates around 1, and converges toward 1 as t → 1.
 *    Higher tension increases oscillation frequency; higher friction damps it.
 *    Provides a more "physical" alternative to easeOutBack for longer animations.
 */

// ─── easeOutBack ─────────────────────────────────────────────────────────────

/**
 * easeOutBack
 *
 * Output starts at 0 (t = 0), overshoots 1, and returns to exactly 1 (t = 1).
 *
 * Mathematical form (c1 = overshoot, c3 = c1 + 1):
 *   f(t) = 1 + c3·(t−1)³ + c1·(t−1)²
 *
 * This is the standard easeOutBack polynomial as specified in the CSS Easing
 * Functions specification, parameterised by `overshoot`.
 *
 * Peak overshoot occurs near t ≈ 1 − (2·c1) / (3·c3):
 *   overshoot 1.70158 → peak ≈ +10 % above 1.0  at t ≈ 0.58
 *   overshoot 2.5     → peak ≈ +17 % above 1.0  (more dramatic)
 *   overshoot 0       → degenerates to easeOutCubic (no overshoot)
 *
 * @param {number} t           – Normalized time in [0, 1].
 * @param {number} [overshoot=1.70158] – Overshoot constant.  Standard value is
 *                               1.70158 (derived from 70.158 % overshoot of the
 *                               derivative, corresponding to ~10 % position overshoot).
 * @returns {number}  Eased value.  Briefly exceeds 1.0 near the peak.
 */
export function easeOutBack(t, overshoot = 1.70158) {
  const c1 = overshoot
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// ─── easeInQuad ──────────────────────────────────────────────────────────────

/**
 * easeInQuad
 *
 * Quadratic ease-in: accelerates from zero velocity to full speed.
 *
 *   f(t) = t²
 *
 * Output: 0 at t = 0, 1 at t = 1, monotonically increasing.  Used for the
 * compress phase of a button press (quick, feels like physical depression).
 *
 * @param {number} t – Normalized time in [0, 1].
 * @returns {number}  Eased value in [0, 1].
 */
export function easeInQuad(t) {
  return t * t
}

// ─── springDecay ─────────────────────────────────────────────────────────────

/**
 * springDecay
 *
 * Physics-based damped harmonic oscillator.  Produces a value that starts at 0,
 * oscillates around 1, and asymptotically converges to 1.
 *
 * Formula:
 *   f(t) = 1 − e^(−friction·t) · cos(ω·t)
 *   where ω = sqrt(max(0, tension − friction²/4))
 *
 * This is the analytical solution to a damped spring system with:
 *   - tension   → spring stiffness (higher = faster oscillation)
 *   - friction  → damping coefficient (higher = less overshoot / faster settle)
 *
 * Useful ranges:
 *   tension  120-250, friction 10-16 → noticeable spring with clean settle
 *   tension  400,     friction  8    → fast, dramatic oscillation
 *
 * Note: the output may exceed 1.0 or dip below 0 for under-damped configs.
 * At t = 1 the value has converged close to (but not exactly) 1.0.
 * For use as a Phaser ease callback, pass the function directly:
 *
 *   ease: (t) => springDecay(t, 180, 12)
 *
 * @param {number} t               – Normalized time in [0, 1].
 * @param {number} [tension=180]   – Spring stiffness.
 * @param {number} [friction=12]   – Damping coefficient.
 * @returns {number}  Spring value, may transiently exceed [0, 1].
 */
export function springDecay(t, tension = 180, friction = 12) {
  const discriminant = tension - (friction * friction) / 4
  const omega = Math.sqrt(Math.max(0, discriminant))
  return 1 - Math.exp(-friction * t) * Math.cos(omega * t)
}
