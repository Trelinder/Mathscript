import { describe, it, expect } from 'vitest'
import { formatBigNumber, formatCurrency, formatRate, formatDamage } from '../formatBigNumber.js'

// ─── formatBigNumber ──────────────────────────────────────────────────────────

describe('formatBigNumber — sub-thousand', () => {
  it('formats 0 as "0"', () => expect(formatBigNumber(0)).toBe('0'))
  it('formats 1 as "1"', () => expect(formatBigNumber(1)).toBe('1'))
  it('formats 42 as "42"', () => expect(formatBigNumber(42)).toBe('42'))
  it('formats 999 as "999"', () => expect(formatBigNumber(999)).toBe('999'))
  it('floors non-integers below 1000', () => expect(formatBigNumber(99.9)).toBe('99'))
  it('handles negative sub-thousand', () => expect(formatBigNumber(-42)).toBe('-42'))
})

describe('formatBigNumber — K tier', () => {
  it('formats 1000 as "1K"', () => expect(formatBigNumber(1000)).toBe('1K'))
  it('formats 1500 as "1.5K"', () => expect(formatBigNumber(1500)).toBe('1.5K'))
  it('formats 1050 as "1.05K"', () => expect(formatBigNumber(1050)).toBe('1.05K'))
  it('strips trailing zeros by default', () => expect(formatBigNumber(2000)).toBe('2K'))
  it('keeps trailing zeros when requested', () => expect(formatBigNumber(2000, { keepTrailingZeros: true })).toBe('2.00K'))
  it('formats 999999 as "999.99K"', () => expect(formatBigNumber(999999)).toBe('999.99K'))
  it('handles negative K', () => expect(formatBigNumber(-1500)).toBe('-1.5K'))
})

describe('formatBigNumber — M tier', () => {
  it('formats 1e6 as "1M"', () => expect(formatBigNumber(1e6)).toBe('1M'))
  it('formats 1.5e6 as "1.5M"', () => expect(formatBigNumber(1.5e6)).toBe('1.5M'))
  it('formats 3.14e6 as "3.14M"', () => expect(formatBigNumber(3.14e6)).toBe('3.14M'))
  it('strips trailing zeros for round millions', () => expect(formatBigNumber(5e6)).toBe('5M'))
  it('handles negative M', () => expect(formatBigNumber(-2.5e6)).toBe('-2.5M'))
})

describe('formatBigNumber — B tier', () => {
  it('formats 1e9 as "1B"', () => expect(formatBigNumber(1e9)).toBe('1B'))
  it('formats 1.5e9 as "1.5B"', () => expect(formatBigNumber(1.5e9)).toBe('1.5B'))
  it('formats 999.99e9 as "999.99B"', () => expect(formatBigNumber(999.99e9)).toBe('999.99B'))
  it('handles negative B', () => expect(formatBigNumber(-3e9)).toBe('-3B'))
})

describe('formatBigNumber — T tier', () => {
  it('formats 1e12 as "1T"', () => expect(formatBigNumber(1e12)).toBe('1T'))
  it('formats 2.5e12 as "2.5T"', () => expect(formatBigNumber(2.5e12)).toBe('2.5T'))
  it('handles negative T', () => expect(formatBigNumber(-1e12)).toBe('-1T'))
})

describe('formatBigNumber — Qa tier (1e15)', () => {
  it('formats 1e15 as "1Qa"', () => expect(formatBigNumber(1e15)).toBe('1Qa'))
  // 9.87e15 / 1e15 is 9.8699... in floating-point; truncation gives 9.86
  it('formats 9.87e15 truncated as "9.86Qa"', () => expect(formatBigNumber(9.87e15)).toBe('9.86Qa'))
})

describe('formatBigNumber — Qi tier (1e18)', () => {
  it('formats 1e18 as "1Qi"', () => expect(formatBigNumber(1e18)).toBe('1Qi'))
  it('formats 1.23e18 as "1.23Qi"', () => expect(formatBigNumber(1.23e18)).toBe('1.23Qi'))
})

describe('formatBigNumber — Sx tier (1e21)', () => {
  it('formats 1e21 as "1Sx"', () => expect(formatBigNumber(1e21)).toBe('1Sx'))
  it('formats 5.67e21 as "5.67Sx"', () => expect(formatBigNumber(5.67e21)).toBe('5.67Sx'))
})

describe('formatBigNumber — Sp tier (1e24)', () => {
  it('formats 1e24 as "1Sp"', () => expect(formatBigNumber(1e24)).toBe('1Sp'))
  it('formats 3.21e24 as "3.21Sp"', () => expect(formatBigNumber(3.21e24)).toBe('3.21Sp'))
})

describe('formatBigNumber — scientific fallback (>= 1e27)', () => {
  it('formats 1e27 in scientific notation', () => {
    const result = formatBigNumber(1e27)
    // May display as "1.00e+27" depending on runtime; just check shape
    expect(result).toMatch(/^1\.?0*e\+27$/)
  })
  it('formats 1e30 in scientific notation', () => {
    expect(formatBigNumber(1e30)).toMatch(/e\+/)
  })
})

describe('formatBigNumber — non-finite inputs', () => {
  it('handles NaN as "0"', () => expect(formatBigNumber(NaN)).toBe('0'))
  it('handles Infinity as "0"', () => expect(formatBigNumber(Infinity)).toBe('0'))
  it('handles -Infinity as "0"', () => expect(formatBigNumber(-Infinity)).toBe('0'))
  it('handles undefined gracefully', () => expect(formatBigNumber(undefined)).toBe('0'))
})

describe('formatBigNumber — decimals option', () => {
  it('respects decimals: 0', () => expect(formatBigNumber(1500, { decimals: 0 })).toBe('1K'))
  it('respects decimals: 1', () => expect(formatBigNumber(1500, { decimals: 1 })).toBe('1.5K'))
  it('respects decimals: 3', () => expect(formatBigNumber(1234567, { decimals: 3 })).toBe('1.234M'))
  it('keepTrailingZeros with decimals:1 preserves zero', () => {
    expect(formatBigNumber(2000, { decimals: 1, keepTrailingZeros: true })).toBe('2.0K')
  })
})

describe('formatBigNumber — boundary values', () => {
  it('formats exactly 999 correctly', () => expect(formatBigNumber(999)).toBe('999'))
  it('formats exactly 1000 as "1K"', () => expect(formatBigNumber(1000)).toBe('1K'))
  it('formats exactly 1e6 as "1M"', () => expect(formatBigNumber(1e6)).toBe('1M'))
  it('formats exactly 1e9 as "1B"', () => expect(formatBigNumber(1e9)).toBe('1B'))
  it('formats exactly 1e12 as "1T"', () => expect(formatBigNumber(1e12)).toBe('1T'))
  it('formats exactly 1e15 as "1Qa"', () => expect(formatBigNumber(1e15)).toBe('1Qa'))
  it('formats exactly 1e18 as "1Qi"', () => expect(formatBigNumber(1e18)).toBe('1Qi'))
  it('formats exactly 1e21 as "1Sx"', () => expect(formatBigNumber(1e21)).toBe('1Sx'))
  it('formats exactly 1e24 as "1Sp"', () => expect(formatBigNumber(1e24)).toBe('1Sp'))
})

// ─── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('prefixes with $', () => expect(formatCurrency(0)).toBe('$0'))
  it('formats $1K correctly', () => expect(formatCurrency(1000)).toBe('$1K'))
  it('formats $1.5M correctly', () => expect(formatCurrency(1.5e6)).toBe('$1.5M'))
  it('formats $3B correctly', () => expect(formatCurrency(3e9)).toBe('$3B'))
  it('formats $2.5T correctly', () => expect(formatCurrency(2.5e12)).toBe('$2.5T'))
  it('handles negative values', () => expect(formatCurrency(-1000)).toBe('$-1K'))
  it('passes through options', () => {
    expect(formatCurrency(1000, { keepTrailingZeros: true, decimals: 1 })).toBe('$1.0K')
  })
})

// ─── formatRate ───────────────────────────────────────────────────────────────

describe('formatRate', () => {
  it('returns "0" for 0', () => expect(formatRate(0)).toBe('0'))
  it('returns "0" for values below 0.01', () => expect(formatRate(0.005)).toBe('0'))
  it('returns 2-decimal string for values < 10', () => expect(formatRate(3.14)).toBe('3.14'))
  it('returns "0.01" for exactly 0.01', () => expect(formatRate(0.01)).toBe('0.01'))
  it('returns "9.99" for 9.99', () => expect(formatRate(9.99)).toBe('9.99'))
  it('uses compact form for >= 10', () => expect(formatRate(10)).toBe('10'))
  it('uses compact form for 12500 as "12.5K"', () => expect(formatRate(12500)).toBe('12.5K'))
  it('returns "0" for NaN', () => expect(formatRate(NaN)).toBe('0'))
  it('returns "0" for negative values', () => expect(formatRate(-5)).toBe('0'))
})

// ─── formatDamage ─────────────────────────────────────────────────────────────

describe('formatDamage', () => {
  it('formats 0 as "0"', () => expect(formatDamage(0)).toBe('0'))
  it('formats 850 as "850"', () => expect(formatDamage(850)).toBe('850'))
  it('formats 999 as "999"', () => expect(formatDamage(999)).toBe('999'))
  it('formats 1000 as "1K"', () => expect(formatDamage(1000)).toBe('1K'))
  it('formats 1500 as "1.5K"', () => expect(formatDamage(1500)).toBe('1.5K'))
  it('formats 4.2e6 as "4.2M"', () => expect(formatDamage(4.2e6)).toBe('4.2M'))
  it('handles NaN as "0"', () => expect(formatDamage(NaN)).toBe('0'))
})
