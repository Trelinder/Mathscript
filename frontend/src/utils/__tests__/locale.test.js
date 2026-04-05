import { describe, it, expect } from 'vitest'
import { localeFromLanguage, formatLocalizedNumber } from '../locale.js'

describe('localeFromLanguage', () => {
  it('maps "en" to en-US', () => {
    expect(localeFromLanguage('en')).toBe('en-US')
  })

  it('maps "es" to es-ES', () => {
    expect(localeFromLanguage('es')).toBe('es-ES')
  })

  it('maps "fr" to fr-FR', () => {
    expect(localeFromLanguage('fr')).toBe('fr-FR')
  })

  it('maps "pt" to pt-BR', () => {
    expect(localeFromLanguage('pt')).toBe('pt-BR')
  })

  it('is case-insensitive', () => {
    expect(localeFromLanguage('EN')).toBe('en-US')
    expect(localeFromLanguage('Fr')).toBe('fr-FR')
  })

  it('falls back to en-US for unknown language', () => {
    expect(localeFromLanguage('zh')).toBe('en-US')
    expect(localeFromLanguage('de')).toBe('en-US')
  })

  it('falls back to en-US for empty string', () => {
    expect(localeFromLanguage('')).toBe('en-US')
  })

  it('falls back to en-US for null', () => {
    expect(localeFromLanguage(null)).toBe('en-US')
  })

  it('falls back to en-US for undefined', () => {
    expect(localeFromLanguage(undefined)).toBe('en-US')
  })
})

describe('formatLocalizedNumber', () => {
  it('formats a simple integer', () => {
    const result = formatLocalizedNumber(1000, 'en')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a string for zero', () => {
    expect(formatLocalizedNumber(0, 'en')).toBe('0')
  })

  it('returns a string for null value (treated as 0)', () => {
    expect(formatLocalizedNumber(null, 'en')).toBe('0')
  })

  it('returns a string for undefined value (treated as 0)', () => {
    expect(formatLocalizedNumber(undefined, 'en')).toBe('0')
  })

  it('handles negative numbers', () => {
    const result = formatLocalizedNumber(-500, 'en')
    expect(result).toContain('500')
  })

  it('does not throw for unsupported language', () => {
    expect(() => formatLocalizedNumber(42, 'xx')).not.toThrow()
  })

  it('does not throw for null language', () => {
    expect(() => formatLocalizedNumber(42, null)).not.toThrow()
  })

  it('formats large numbers', () => {
    const result = formatLocalizedNumber(1_000_000, 'en')
    expect(typeof result).toBe('string')
    expect(result).toContain('000')
  })

  it('handles numeric string values', () => {
    const result = formatLocalizedNumber('250', 'en')
    expect(result).toBe('250')
  })

  it('falls back gracefully when Intl throws', () => {
    // Passing an invalid locale-like value should not crash
    expect(() => formatLocalizedNumber(10, 'invalid-locale-xyz')).not.toThrow()
  })
})
