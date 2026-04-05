import { describe, it, expect } from 'vitest'
import { generateProblem, checkAnswer, xpThreshold, xpEarned } from '../MathEngine.js'

// ─────────────────────────────────────────────────────────────────────────────
// generateProblem
// ─────────────────────────────────────────────────────────────────────────────
describe('generateProblem', () => {
  describe('levels 1–3 (addition / subtraction)', () => {
    it('returns a problem object with required fields', () => {
      const p = generateProblem(1)
      expect(p).toHaveProperty('problem')
      expect(p).toHaveProperty('solution')
      expect(p).toHaveProperty('solutionDisplay')
      expect(p).toHaveProperty('type')
      expect(p).toHaveProperty('hint')
    })

    it('has type "integer" at level 1', () => {
      for (let i = 0; i < 20; i++) {
        expect(generateProblem(1).type).toBe('integer')
      }
    })

    it('solution is a non-negative integer at level 1', () => {
      for (let i = 0; i < 50; i++) {
        const p = generateProblem(1)
        expect(p.solution).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(p.solution)).toBe(true)
      }
    })

    it('solutionDisplay matches solution at level 2', () => {
      for (let i = 0; i < 20; i++) {
        const p = generateProblem(2)
        expect(p.solutionDisplay).toBe(String(p.solution))
      }
    })

    it('subtraction never produces a negative result', () => {
      for (let i = 0; i < 100; i++) {
        const p = generateProblem(3)
        if (p.problem.includes('−')) {
          expect(p.solution).toBeGreaterThanOrEqual(0)
        }
      }
    })
  })

  describe('levels 4–7 (multiplication / division)', () => {
    it('generates integer-type problems at level 5', () => {
      for (let i = 0; i < 20; i++) {
        expect(generateProblem(5).type).toBe('integer')
      }
    })

    it('division answer is always a positive integer', () => {
      for (let i = 0; i < 50; i++) {
        const p = generateProblem(6)
        if (p.problem.includes('÷')) {
          expect(p.solution).toBeGreaterThan(0)
          expect(Number.isInteger(p.solution)).toBe(true)
        }
      }
    })

    it('multiplication problem encodes × symbol', () => {
      let seenMul = false
      for (let i = 0; i < 50; i++) {
        const p = generateProblem(4)
        if (p.problem.includes('×')) seenMul = true
      }
      expect(seenMul).toBe(true)
    })
  })

  describe('levels 8+ (fractions / algebra)', () => {
    it('returns fraction or integer type', () => {
      for (let i = 0; i < 30; i++) {
        const p = generateProblem(9)
        expect(['fraction', 'integer']).toContain(p.type)
      }
    })

    it('fraction problems include solutionNumerator and solutionDenominator', () => {
      let foundFraction = false
      for (let i = 0; i < 100; i++) {
        const p = generateProblem(10)
        if (p.type === 'fraction') {
          expect(p).toHaveProperty('solutionNumerator')
          expect(p).toHaveProperty('solutionDenominator')
          expect(p.solutionDenominator).toBeGreaterThan(1)
          foundFraction = true
          break
        }
      }
      expect(foundFraction).toBe(true)
    })

    it('fraction solution is consistent with numerator/denominator', () => {
      for (let i = 0; i < 100; i++) {
        const p = generateProblem(8)
        if (p.type === 'fraction') {
          expect(Math.abs(p.solution - p.solutionNumerator / p.solutionDenominator)).toBeLessThan(0.0001)
        }
      }
    })

    it('algebra problems have integer solutions at level 8', () => {
      let seenAlgebra = false
      for (let i = 0; i < 100; i++) {
        const p = generateProblem(8)
        if (p.type === 'integer' && p.problem.includes('x +')) {
          seenAlgebra = true
          expect(Number.isInteger(p.solution)).toBe(true)
          expect(p.solution).toBeGreaterThanOrEqual(1)
        }
      }
      expect(seenAlgebra).toBe(true)
    })
  })

  describe('edge case inputs', () => {
    it('clamps level 0 to level 1 behaviour', () => {
      const p = generateProblem(0)
      expect(p.type).toBe('integer')
    })

    it('handles null/undefined level gracefully', () => {
      expect(() => generateProblem(null)).not.toThrow()
      expect(() => generateProblem(undefined)).not.toThrow()
    })

    it('handles very large level numbers', () => {
      expect(() => generateProblem(999)).not.toThrow()
    })

    it('handles decimal level by flooring', () => {
      const p = generateProblem(2.9)
      // 2.9 floors to 2 → level 2 (addition/subtraction)
      expect(p.type).toBe('integer')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkAnswer
// ─────────────────────────────────────────────────────────────────────────────
describe('checkAnswer', () => {
  const intProblem = { type: 'integer', solution: 42 }
  const fracProblem = {
    type: 'fraction',
    solution: 3 / 4,
    solutionNumerator: 3,
    solutionDenominator: 4,
    solutionDisplay: '3/4',
  }

  describe('integer problems', () => {
    it('accepts correct integer string', () => {
      expect(checkAnswer('42', intProblem)).toBe(true)
    })

    it('rejects wrong integer', () => {
      expect(checkAnswer('43', intProblem)).toBe(false)
    })

    it('accepts correct integer with whitespace', () => {
      expect(checkAnswer('  42  ', intProblem)).toBe(true)
    })

    it('rejects empty string', () => {
      expect(checkAnswer('', intProblem)).toBe(false)
    })

    it('rejects null input', () => {
      expect(checkAnswer(null, intProblem)).toBe(false)
    })

    it('rejects undefined input', () => {
      expect(checkAnswer(undefined, intProblem)).toBe(false)
    })

    it('accepts correct float that equals integer solution', () => {
      expect(checkAnswer('42.0', intProblem)).toBe(true)
    })

    it('accepts correct integer passed as number type', () => {
      expect(checkAnswer(42, intProblem)).toBe(true)
    })

    it('accepts zero as correct answer', () => {
      const zeroProblem = { type: 'integer', solution: 0 }
      expect(checkAnswer('0', zeroProblem)).toBe(true)
    })

    it('rejects answer when problem is missing', () => {
      expect(checkAnswer('42', null)).toBe(false)
      expect(checkAnswer('42', undefined)).toBe(false)
    })
  })

  describe('fraction problems', () => {
    it('accepts correct fraction string', () => {
      expect(checkAnswer('3/4', fracProblem)).toBe(true)
    })

    it('accepts unsimplified equivalent fraction', () => {
      // 6/8 simplifies to 3/4
      expect(checkAnswer('6/8', fracProblem)).toBe(true)
    })

    it('rejects wrong fraction', () => {
      expect(checkAnswer('1/4', fracProblem)).toBe(false)
    })

    it('accepts decimal approximation within tolerance', () => {
      expect(checkAnswer('0.75', fracProblem)).toBe(true)
    })

    it('accepts close decimal within 0.001 tolerance', () => {
      expect(checkAnswer('0.7501', fracProblem)).toBe(true)
    })

    it('rejects decimal outside tolerance', () => {
      expect(checkAnswer('0.76', fracProblem)).toBe(false)
    })

    it('rejects division-by-zero fraction input', () => {
      expect(checkAnswer('3/0', fracProblem)).toBe(false)
    })

    it('rejects malformed fraction string', () => {
      expect(checkAnswer('3/4/5', fracProblem)).toBe(false)
    })

    it('handles negative fraction input without crashing', () => {
      expect(() => checkAnswer('-3/4', fracProblem)).not.toThrow()
    })

    it('returns false for empty string on fraction problem', () => {
      expect(checkAnswer('', fracProblem)).toBe(false)
    })
  })

  describe('with real generateProblem output', () => {
    it('accepts the correct solution for any generated problem', () => {
      for (let i = 0; i < 50; i++) {
        const level = Math.floor(Math.random() * 10) + 1
        const p = generateProblem(level)
        const answerStr =
          p.type === 'fraction' ? p.solutionDisplay : String(p.solution)
        expect(checkAnswer(answerStr, p)).toBe(true)
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// xpThreshold
// ─────────────────────────────────────────────────────────────────────────────
describe('xpThreshold', () => {
  it('returns 50 XP for level 1', () => {
    expect(xpThreshold(1)).toBe(50)
  })

  it('scales linearly with level', () => {
    expect(xpThreshold(3)).toBe(150)
    expect(xpThreshold(5)).toBe(250)
    expect(xpThreshold(10)).toBe(500)
  })

  it('floors decimal levels', () => {
    expect(xpThreshold(2.9)).toBe(100) // floor(2.9) = 2
  })

  it('clamps zero to level 1 (returns 50)', () => {
    expect(xpThreshold(0)).toBe(50)
  })

  it('handles negative levels as level 1', () => {
    expect(xpThreshold(-5)).toBe(50)
  })

  it('always returns a positive value', () => {
    for (let i = -10; i <= 20; i++) {
      expect(xpThreshold(i)).toBeGreaterThan(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// xpEarned
// ─────────────────────────────────────────────────────────────────────────────
describe('xpEarned', () => {
  it('returns 10 XP for level 1', () => {
    expect(xpEarned(1)).toBe(10)
  })

  it('scales linearly with level', () => {
    expect(xpEarned(3)).toBe(30)
    expect(xpEarned(5)).toBe(50)
    expect(xpEarned(10)).toBe(100)
  })

  it('floors decimal levels', () => {
    expect(xpEarned(4.7)).toBe(40)
  })

  it('clamps zero and negative to level 1 (returns 10)', () => {
    expect(xpEarned(0)).toBe(10)
    expect(xpEarned(-3)).toBe(10)
  })

  it('xpEarned is always less than xpThreshold at the same level', () => {
    for (let i = 1; i <= 15; i++) {
      expect(xpEarned(i)).toBeLessThan(xpThreshold(i))
    }
  })
})
