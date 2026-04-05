import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeMotionSettings } from '../motion.js'

// Helper: create a simple matchMedia mock that returns `matches` based on a
// predicate applied to the query string.
function mockMatchMedia(queryMatchFn) {
  return vi.fn((query) => ({
    matches: queryMatchFn(query),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('computeMotionSettings', () => {
  const originalMatchMedia = window.matchMedia
  const originalNavigator = window.navigator

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    // Restore navigator hardware concurrency / deviceMemory
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  it('returns an object with all required fields', () => {
    const settings = computeMotionSettings()
    expect(settings).toHaveProperty('isMobile')
    expect(settings).toHaveProperty('reduceEffects')
    expect(settings).toHaveProperty('lowEndDevice')
    expect(settings).toHaveProperty('canHover')
    expect(settings).toHaveProperty('particleScale')
  })

  it('detects desktop (wide viewport, hover capable)', () => {
    window.matchMedia = mockMatchMedia((q) => {
      if (q === '(max-width: 768px)') return false
      if (q === '(prefers-reduced-motion: reduce)') return false
      if (q === '(hover: hover)') return true
      return false
    })
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 8, deviceMemory: 16 },
      configurable: true,
    })

    const s = computeMotionSettings()
    expect(s.isMobile).toBe(false)
    expect(s.canHover).toBe(true)
    expect(s.reduceEffects).toBe(false)
    expect(s.particleScale).toBe(1)
  })

  it('detects mobile (narrow viewport)', () => {
    window.matchMedia = mockMatchMedia((q) => {
      if (q === '(max-width: 768px)') return true
      if (q === '(prefers-reduced-motion: reduce)') return false
      if (q === '(hover: hover)') return false
      return false
    })
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 8, deviceMemory: 16 },
      configurable: true,
    })

    const s = computeMotionSettings()
    expect(s.isMobile).toBe(true)
  })

  it('sets reduceEffects when prefers-reduced-motion is active', () => {
    window.matchMedia = mockMatchMedia((q) => {
      if (q === '(prefers-reduced-motion: reduce)') return true
      return false
    })
    const s = computeMotionSettings()
    expect(s.reduceEffects).toBe(true)
    expect(s.particleScale).toBe(0.45)
  })

  it('detects low-end device from hardware concurrency ≤ 4', () => {
    window.matchMedia = mockMatchMedia(() => false)
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 2, deviceMemory: 8 },
      configurable: true,
    })
    const s = computeMotionSettings()
    expect(s.lowEndDevice).toBe(true)
  })

  it('detects low-end device from deviceMemory ≤ 4', () => {
    window.matchMedia = mockMatchMedia(() => false)
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 8, deviceMemory: 2 },
      configurable: true,
    })
    const s = computeMotionSettings()
    expect(s.lowEndDevice).toBe(true)
  })

  it('detects low-end device from saveData connection flag', () => {
    window.matchMedia = mockMatchMedia(() => false)
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 8, deviceMemory: 16, connection: { saveData: true } },
      configurable: true,
    })
    const s = computeMotionSettings()
    expect(s.lowEndDevice).toBe(true)
  })

  it('sets particleScale to 0.7 for mobile without reduceEffects', () => {
    window.matchMedia = mockMatchMedia((q) => {
      if (q === '(max-width: 768px)') return true
      if (q === '(prefers-reduced-motion: reduce)') return false
      return false
    })
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 8, deviceMemory: 16 },
      configurable: true,
    })
    const s = computeMotionSettings()
    expect(s.isMobile).toBe(true)
    expect(s.reduceEffects).toBe(false)
    expect(s.particleScale).toBe(0.7)
  })

  it('sets particleScale to 0.45 when reduceEffects is true (mobile + low-end)', () => {
    window.matchMedia = mockMatchMedia((q) => {
      if (q === '(max-width: 768px)') return true
      if (q === '(prefers-reduced-motion: reduce)') return false
      return false
    })
    Object.defineProperty(window, 'navigator', {
      value: { hardwareConcurrency: 2, deviceMemory: 2 },
      configurable: true,
    })
    const s = computeMotionSettings()
    expect(s.reduceEffects).toBe(true)
    expect(s.particleScale).toBe(0.45)
  })
})
