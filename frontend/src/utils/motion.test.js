import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeMotionSettings } from './motion'

const originalMatchMedia = window.matchMedia
const originalConnection = navigator.connection
const originalHardwareConcurrency = navigator.hardwareConcurrency
const originalDeviceMemory = navigator.deviceMemory

function mockMatchMedia(matchesByQuery) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: Boolean(matchesByQuery[query]),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('computeMotionSettings', () => {
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    Object.defineProperty(navigator, 'connection', { configurable: true, value: originalConnection })
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: originalHardwareConcurrency })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: originalDeviceMemory })
  })

  it('reduces effects on low-end mobile devices', () => {
    mockMatchMedia({
      '(max-width: 768px)': true,
      '(prefers-reduced-motion: reduce)': false,
      '(hover: hover)': false,
    })
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 2 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false } })

    const settings = computeMotionSettings()
    expect(settings.isMobile).toBe(true)
    expect(settings.lowEndDevice).toBe(true)
    expect(settings.reduceEffects).toBe(true)
    expect(settings.particleScale).toBe(0.45)
  })

  it('keeps full effects on desktop devices', () => {
    mockMatchMedia({
      '(max-width: 768px)': false,
      '(prefers-reduced-motion: reduce)': false,
      '(hover: hover)': true,
    })
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false } })

    const settings = computeMotionSettings()
    expect(settings.isMobile).toBe(false)
    expect(settings.lowEndDevice).toBe(false)
    expect(settings.reduceEffects).toBe(false)
    expect(settings.canHover).toBe(true)
    expect(settings.particleScale).toBe(1)
  })
})
