import { describe, it, expect } from 'vitest'
import { parseArithmeticSteps } from '../parseArithmeticSteps.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the labels from steps for compact assertion */
const labels = (steps) => steps.map(s => s.label)

// ─────────────────────────────────────────────────────────────────────────────
// Null / empty / trivial inputs
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — empty / trivial inputs', () => {
  it('returns [] for null', () => expect(parseArithmeticSteps(null)).toEqual([]))
  it('returns [] for undefined', () => expect(parseArithmeticSteps(undefined)).toEqual([]))
  it('returns [] for empty string', () => expect(parseArithmeticSteps('')).toEqual([]))
  it('returns [] for whitespace-only string', () => expect(parseArithmeticSteps('   ')).toEqual([]))
  it('returns [] for a lone number', () => expect(parseArithmeticSteps('42')).toEqual([]))
  it('returns [] for algebra ("x + 5 = 10 → x = ?")', () => {
    expect(parseArithmeticSteps('x + 5 = 10  →  x = ?')).toEqual([])
  })
  it('returns [] for algebraic expression with variable', () => {
    expect(parseArithmeticSteps('2n + 3')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Single binary operation
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — single operation', () => {
  it('addition: 5 + 3', () => {
    const steps = parseArithmeticSteps('5 + 3')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ stepNum: 1, left: 5, op: '+', right: 3, result: 8 })
    expect(steps[0].label).toBe('5 + 3 = 8')
  })

  it('subtraction with ASCII minus: 10 - 4', () => {
    const steps = parseArithmeticSteps('10 - 4')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ stepNum: 1, left: 10, op: '−', right: 4, result: 6 })
    expect(steps[0].label).toBe('10 − 4 = 6')
  })

  it('subtraction with unicode minus: 10 − 4', () => {
    const steps = parseArithmeticSteps('10 − 4')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 10, op: '−', right: 4, result: 6 })
  })

  it('multiplication with *: 6 * 7', () => {
    const steps = parseArithmeticSteps('6 * 7')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 6, op: '×', right: 7, result: 42 })
    expect(steps[0].label).toBe('6 × 7 = 42')
  })

  it('multiplication with unicode ×: 6 × 7', () => {
    const steps = parseArithmeticSteps('6 × 7')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 6, op: '×', right: 7, result: 42 })
  })

  it('multiplication with bare x: 6 x 7', () => {
    const steps = parseArithmeticSteps('6 x 7')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 6, op: '×', right: 7, result: 42 })
  })

  it('multiplication with capital X: 6 X 7', () => {
    const steps = parseArithmeticSteps('6 X 7')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 6, op: '×', right: 7, result: 42 })
  })

  it('division with /: 20 / 4', () => {
    const steps = parseArithmeticSteps('20 / 4')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 20, op: '÷', right: 4, result: 5 })
    expect(steps[0].label).toBe('20 ÷ 4 = 5')
  })

  it('division with unicode ÷: 20 ÷ 4', () => {
    const steps = parseArithmeticSteps('20 ÷ 4')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 20, op: '÷', right: 4, result: 5 })
  })

  it('exponentiation: 2 ^ 3', () => {
    const steps = parseArithmeticSteps('2 ^ 3')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 2, op: '^', right: 3, result: 8 })
    expect(steps[0].label).toBe('2 ^ 3 = 8')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Multi-step chains (same precedence — left-to-right)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — multi-step chains', () => {
  it('5 * 6 * 6 → two steps', () => {
    const steps = parseArithmeticSteps('5 * 6 * 6')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ stepNum: 1, left: 5, op: '×', right: 6, result: 30 })
    expect(steps[1]).toMatchObject({ stepNum: 2, left: 30, op: '×', right: 6, result: 180 })
    expect(labels(steps)).toEqual(['5 × 6 = 30', '30 × 6 = 180'])
  })

  it('2 + 3 + 4 → two steps', () => {
    const steps = parseArithmeticSteps('2 + 3 + 4')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ left: 2, op: '+', right: 3, result: 5 })
    expect(steps[1]).toMatchObject({ left: 5, op: '+', right: 4, result: 9 })
    expect(labels(steps)).toEqual(['2 + 3 = 5', '5 + 4 = 9'])
  })

  it('10 - 3 - 2 → two steps (left-associative)', () => {
    const steps = parseArithmeticSteps('10 - 3 - 2')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ left: 10, op: '−', right: 3, result: 7 })
    expect(steps[1]).toMatchObject({ left: 7, op: '−', right: 2, result: 5 })
  })

  it('2 * 3 * 4 * 5 → three steps', () => {
    const steps = parseArithmeticSteps('2 * 3 * 4 * 5')
    expect(steps).toHaveLength(3)
    expect(steps[0].result).toBe(6)
    expect(steps[1].result).toBe(24)
    expect(steps[2].result).toBe(120)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Mixed precedence
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — operator precedence', () => {
  it('3 + 4 * 2 — multiplication before addition', () => {
    const steps = parseArithmeticSteps('3 + 4 * 2')
    expect(steps).toHaveLength(2)
    // 4 * 2 = 8 happens first (deeper in AST)
    expect(steps[0]).toMatchObject({ left: 4, op: '×', right: 2, result: 8 })
    // then 3 + 8 = 11
    expect(steps[1]).toMatchObject({ left: 3, op: '+', right: 8, result: 11 })
  })

  it('10 - 2 * 3 — subtraction after multiplication', () => {
    const steps = parseArithmeticSteps('10 - 2 * 3')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ left: 2, op: '×', right: 3, result: 6 })
    expect(steps[1]).toMatchObject({ left: 10, op: '−', right: 6, result: 4 })
  })

  it('100 / 5 + 3 * 4', () => {
    const steps = parseArithmeticSteps('100 / 5 + 3 * 4')
    // Division and multiplication first (l-to-r within parseTerm)
    // (100 / 5 = 20) and (3 * 4 = 12) then (20 + 12 = 32)
    expect(steps).toHaveLength(3)
    const resultValues = steps.map(s => s.result)
    expect(resultValues).toContain(20)
    expect(resultValues).toContain(12)
    expect(resultValues[2]).toBe(32)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Parentheses
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — parentheses', () => {
  it('(2 + 3) * 4', () => {
    const steps = parseArithmeticSteps('(2 + 3) * 4')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ left: 2, op: '+', right: 3, result: 5 })
    expect(steps[1]).toMatchObject({ left: 5, op: '×', right: 4, result: 20 })
  })

  it('2 * (3 + 4)', () => {
    const steps = parseArithmeticSteps('2 * (3 + 4)')
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ left: 3, op: '+', right: 4, result: 7 })
    expect(steps[1]).toMatchObject({ left: 2, op: '×', right: 7, result: 14 })
  })

  it('(2 + 3) * (4 - 1)', () => {
    const steps = parseArithmeticSteps('(2 + 3) * (4 - 1)')
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatchObject({ left: 2, op: '+', right: 3, result: 5 })
    expect(steps[1]).toMatchObject({ left: 4, op: '−', right: 1, result: 3 })
    expect(steps[2]).toMatchObject({ left: 5, op: '×', right: 3, result: 15 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Narrative suffix stripping ("5x6x6 = 180 holds true")
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — narrative suffix stripping', () => {
  it('strips "= 180 holds true" suffix', () => {
    const steps = parseArithmeticSteps('5 * 6 * 6 = 180 holds true')
    expect(steps).toHaveLength(2)
    expect(steps[1].result).toBe(180)
  })

  it('strips "= 42" suffix', () => {
    const steps = parseArithmeticSteps('6 × 7 = 42')
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ left: 6, op: '×', right: 7, result: 42 })
  })

  it('strips algebra arrow suffix', () => {
    expect(parseArithmeticSteps('x + 5 = 10  →  x = ?')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Decimal and fractional results
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — decimal results', () => {
  it('10 / 4 gives 2.5', () => {
    const steps = parseArithmeticSteps('10 / 4')
    expect(steps).toHaveLength(1)
    expect(steps[0].result).toBeCloseTo(2.5)
    expect(steps[0].label).toBe('10 ÷ 4 = 2.5')
  })

  it('1 / 3 formats without trailing noise', () => {
    const steps = parseArithmeticSteps('1 / 3')
    expect(steps).toHaveLength(1)
    // Should not have more than 4 decimal places
    const decimalPart = steps[0].label.split('= ')[1]
    expect(decimalPart.replace('.', '').replace(/\d/g, '').length).toBe(0) // only digits + dot
    expect(decimalPart.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Step shape — all fields present
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — step object shape', () => {
  it('each step has stepNum, left, op, right, result, label', () => {
    const steps = parseArithmeticSteps('5 * 6 * 6')
    for (const s of steps) {
      expect(s).toHaveProperty('stepNum')
      expect(s).toHaveProperty('left')
      expect(s).toHaveProperty('op')
      expect(s).toHaveProperty('right')
      expect(s).toHaveProperty('result')
      expect(s).toHaveProperty('label')
      expect(typeof s.stepNum).toBe('number')
      expect(typeof s.left).toBe('number')
      expect(typeof s.right).toBe('number')
      expect(typeof s.result).toBe('number')
      expect(typeof s.label).toBe('string')
    }
  })

  it('stepNums are 1-based and sequential', () => {
    const steps = parseArithmeticSteps('2 + 3 + 4 + 5')
    expect(steps.map(s => s.stepNum)).toEqual([1, 2, 3])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Exponentiation
// ─────────────────────────────────────────────────────────────────────────────

describe('parseArithmeticSteps — exponentiation', () => {
  it('2 ^ 3 ^ 2 is right-associative (2 ^ 9 = 512)', () => {
    const steps = parseArithmeticSteps('2 ^ 3 ^ 2')
    expect(steps).toHaveLength(2)
    // 3 ^ 2 = 9  (innermost)
    expect(steps[0]).toMatchObject({ left: 3, op: '^', right: 2, result: 9 })
    // 2 ^ 9 = 512
    expect(steps[1]).toMatchObject({ left: 2, op: '^', right: 9, result: 512 })
  })
})
