/**
 * confetti.js — Thin wrapper around canvas-confetti.
 *
 * Usage:  celebrate()  — fires a quick burst of colourful confetti.
 */
import confetti from 'canvas-confetti'

export function celebrate() {
  confetti({
    particleCount: 120,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#7c3aed', '#00d4ff', '#fbbf24', '#22c55e', '#f97316', '#ec4899'],
  })
}
