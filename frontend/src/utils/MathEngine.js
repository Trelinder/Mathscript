/**
 * MathEngine.js  –  Dynamic math problem generator for The Math Script.
 *
 * generateProblem(level)  →  { problem, solution, type, hint, solutionDisplay,
 *                              [solutionFraction, solutionNumerator, solutionDenominator] }
 *
 * checkAnswer(userInput, problem)  →  boolean
 *
 * Difficulty bands
 * ─────────────────
 * Levels 1–3   Basic addition & subtraction
 * Levels 4–7   Multiplication & division
 * Levels 8+    Fraction addition OR simple algebra  (x + a = b)
 */

function gcd(a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  return b === 0 ? a : gcd(b, a % b)
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generate a math problem appropriate for `level` (integer ≥ 1).
 */
export function generateProblem(level) {
  const lvl = Math.max(1, Math.floor(level ?? 1))

  // ── Levels 1–3: Basic addition / subtraction ────────────────────────────
  if (lvl <= 3) {
    const max = lvl * 10
    const a = randInt(1, max)
    const b = randInt(1, max)
    if (Math.random() < 0.5) {
      return {
        problem: `${a} + ${b}`,
        solution: a + b,
        solutionDisplay: String(a + b),
        type: 'integer',
        hint: `Add ${a} and ${b} together`,
      }
    }
    const [x, y] = a >= b ? [a, b] : [b, a]
    return {
      problem: `${x} − ${y}`,
      solution: x - y,
      solutionDisplay: String(x - y),
      type: 'integer',
      hint: `Subtract ${y} from ${x}`,
    }
  }

  // ── Levels 4–7: Multiplication / division ───────────────────────────────
  if (lvl <= 7) {
    const maxFactor = lvl <= 5 ? lvl + 4 : lvl + 6
    const a = randInt(2, maxFactor)
    const b = randInt(2, maxFactor)
    if (Math.random() < 0.5) {
      return {
        problem: `${a} × ${b}`,
        solution: a * b,
        solutionDisplay: String(a * b),
        type: 'integer',
        hint: `Multiply ${a} by ${b}`,
      }
    }
    const product = a * b
    return {
      problem: `${product} ÷ ${a}`,
      solution: b,
      solutionDisplay: String(b),
      type: 'integer',
      hint: `Divide ${product} by ${a}`,
    }
  }

  // ── Levels 8+: Fractions or basic algebra ───────────────────────────────
  if (Math.random() < 0.5) {
    // Simple algebra: x + a = b  →  find x
    const x = randInt(1, 30)
    const a = randInt(1, 20)
    const b = x + a
    return {
      problem: `x + ${a} = ${b}  →  x = ?`,
      solution: x,
      solutionDisplay: String(x),
      type: 'integer',
      hint: `Subtract ${a} from both sides`,
    }
  }

  // Fraction addition: n1/d1 + n2/d2
  const d1 = randInt(2, 6)
  const d2 = randInt(2, 6)
  const n1 = randInt(1, d1 - 1)
  const n2 = randInt(1, d2 - 1)
  const rn = n1 * d2 + n2 * d1
  const rd = d1 * d2
  const g = gcd(rn, rd)
  const sn = rn / g          // simplified numerator
  const sd = rd / g          // simplified denominator

  if (sd === 1) {
    // Result is a whole number
    return {
      problem: `${n1}/${d1} + ${n2}/${d2}`,
      solution: sn,
      solutionDisplay: String(sn),
      type: 'integer',
      hint: `Common denominator is ${d1 * d2}`,
    }
  }

  return {
    problem: `${n1}/${d1} + ${n2}/${d2}`,
    solution: sn / sd,
    solutionDisplay: `${sn}/${sd}`,
    solutionFraction: `${sn}/${sd}`,
    solutionNumerator: sn,
    solutionDenominator: sd,
    type: 'fraction',
    hint: `Common denominator is ${d1 * d2}, then simplify`,
  }
}

/**
 * Return true when `userInput` is a correct answer for `problem`.
 * Accepts integer, decimal, or fraction string ("3/4") notation.
 */
export function checkAnswer(userInput, problem) {
  if (!problem) return false
  const trimmed = String(userInput ?? '').trim()
  if (!trimmed) return false

  if (problem.type === 'fraction') {
    // Accept fraction string notation
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/')
      if (parts.length === 2) {
        const n = parseInt(parts[0].trim(), 10)
        const d = parseInt(parts[1].trim(), 10)
        if (!isNaN(n) && !isNaN(d) && d !== 0) {
          const g = gcd(Math.abs(n), Math.abs(d))
          return n / g === problem.solutionNumerator && d / g === problem.solutionDenominator
        }
      }
    }
    // Accept decimal approximation
    const dec = parseFloat(trimmed)
    return !isNaN(dec) && Math.abs(dec - problem.solution) < 0.001
  }

  // Integer / whole-number answer
  const parsed = parseInt(trimmed, 10)
  if (!isNaN(parsed) && parsed === problem.solution) return true

  // Fallback: float comparison
  const float = parseFloat(trimmed)
  return !isNaN(float) && Math.abs(float - problem.solution) < 0.001
}

/**
 * Returns the XP threshold required to advance from `level` to `level + 1`.
 */
export function xpThreshold(level) {
  return Math.max(1, Math.floor(level)) * 50
}

/**
 * Returns XP earned for one correct answer at `level`.
 */
export function xpEarned(level) {
  return Math.max(1, Math.floor(level)) * 10
}
