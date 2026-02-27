import { describe, expect, it } from 'vitest'
import {
  getMathInputHint,
  hasBalancedDelimiters,
  latexToPlainMath,
  normalizeMathInput,
  plainMathToLatex,
} from './mathExpression'

describe('mathExpression utilities', () => {
  it('normalizes unicode operators to ascii', () => {
    expect(normalizeMathInput('5 × 4 − 2')).toBe('5 * 4 - 2')
  })

  it('converts simple latex fractions and operators to plain math', () => {
    const plain = latexToPlainMath('\\frac{12}{3}+4\\times2')
    expect(plain).toBe('(12)/(3)+4*2')
  })

  it('converts plain expression to preview latex', () => {
    expect(plainMathToLatex('5*5')).toBe('5\\times 5')
  })

  it('detects delimiter balance and offers actionable hint', () => {
    expect(hasBalancedDelimiters('(5+4)')).toBe(true)
    expect(hasBalancedDelimiters('(5+4')).toBe(false)
    expect(getMathInputHint('(5+4')).toMatch(/missing parenthesis/i)
  })
})
