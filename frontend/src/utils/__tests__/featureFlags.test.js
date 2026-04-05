import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// featureFlags uses import.meta.env which is static at module load time.
// We reset module state between test groups using vi.resetModules().
// ─────────────────────────────────────────────────────────────────────────────

describe('FEATURES object (env-based resolution)', () => {
  beforeEach(() => {
    // Clear any window injection between tests
    delete window.__FEATURE_FLAGS__
  })

  it('defaults all flags to false when no env vars or window flags are set', async () => {
    vi.resetModules()
    // import.meta.env values are injected at build/test time.
    // In the test environment the VITE_ vars are undefined → false
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.CONCRETE_PACKERS).toBe(false)
    expect(FEATURES.POTION_ALCHEMISTS).toBe(false)
    expect(FEATURES.ORBITAL_ENGINEERS).toBe(false)
  })

  it('reads window.__FEATURE_FLAGS__ at runtime', async () => {
    vi.resetModules()
    window.__FEATURE_FLAGS__ = { FEATURE_CONCRETE_PACKERS: 'true' }
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.CONCRETE_PACKERS).toBe(true)
    delete window.__FEATURE_FLAGS__
  })

  it('interprets "1" as truthy in window flags', async () => {
    vi.resetModules()
    window.__FEATURE_FLAGS__ = { FEATURE_POTION_ALCHEMISTS: '1' }
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.POTION_ALCHEMISTS).toBe(true)
    delete window.__FEATURE_FLAGS__
  })

  it('interprets "yes" as truthy in window flags', async () => {
    vi.resetModules()
    window.__FEATURE_FLAGS__ = { FEATURE_ORBITAL_ENGINEERS: 'yes' }
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.ORBITAL_ENGINEERS).toBe(true)
    delete window.__FEATURE_FLAGS__
  })

  it('interprets "false" as falsy in window flags', async () => {
    vi.resetModules()
    window.__FEATURE_FLAGS__ = { FEATURE_CONCRETE_PACKERS: 'false' }
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.CONCRETE_PACKERS).toBe(false)
    delete window.__FEATURE_FLAGS__
  })

  it('ignores unknown keys in window.__FEATURE_FLAGS__', async () => {
    vi.resetModules()
    window.__FEATURE_FLAGS__ = { FEATURE_DOES_NOT_EXIST: 'true' }
    const { FEATURES } = await import('../featureFlags.js')
    expect(FEATURES.DOES_NOT_EXIST).toBeUndefined()
    delete window.__FEATURE_FLAGS__
  })
})

describe('initFeatureFlags', () => {
  beforeEach(() => {
    delete window.__FEATURE_FLAGS__
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('merges DB flags into FEATURES and calls onUpdate when changed', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ CONCRETE_PACKERS: true, POTION_ALCHEMISTS: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { FEATURES, initFeatureFlags } = await import('../featureFlags.js')
    const onUpdate = vi.fn()
    await initFeatureFlags(onUpdate)

    expect(FEATURES.CONCRETE_PACKERS).toBe(true)
    expect(FEATURES.POTION_ALCHEMISTS).toBe(false)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('does not call onUpdate when nothing changed', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ CONCRETE_PACKERS: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { initFeatureFlags } = await import('../featureFlags.js')
    const onUpdate = vi.fn()
    await initFeatureFlags(onUpdate)

    // CONCRETE_PACKERS was already false; no change → onUpdate not called
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('silently swallows network errors without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)

    const { initFeatureFlags } = await import('../featureFlags.js')
    await expect(initFeatureFlags()).resolves.toBeUndefined()
  })

  it('does nothing when response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', mockFetch)

    const { FEATURES, initFeatureFlags } = await import('../featureFlags.js')
    const onUpdate = vi.fn()
    await initFeatureFlags(onUpdate)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

describe('FeatureGate', () => {
  beforeEach(() => {
    delete window.__FEATURE_FLAGS__
    vi.resetModules()
  })

  it('returns children when flag is on', async () => {
    window.__FEATURE_FLAGS__ = { FEATURE_CONCRETE_PACKERS: 'true' }
    const { FEATURES, FeatureGate } = await import('../featureFlags.js')
    // Manually ensure flag is on for this test
    FEATURES.CONCRETE_PACKERS = true
    const children = 'child-content'
    expect(FeatureGate({ flag: 'CONCRETE_PACKERS', children })).toBe(children)
    delete window.__FEATURE_FLAGS__
  })

  it('returns null (default fallback) when flag is off', async () => {
    const { FEATURES, FeatureGate } = await import('../featureFlags.js')
    FEATURES.CONCRETE_PACKERS = false
    expect(FeatureGate({ flag: 'CONCRETE_PACKERS', children: 'stuff' })).toBeNull()
  })

  it('returns custom fallback when flag is off', async () => {
    const { FEATURES, FeatureGate } = await import('../featureFlags.js')
    FEATURES.CONCRETE_PACKERS = false
    const fallback = 'upgrade-prompt'
    expect(FeatureGate({ flag: 'CONCRETE_PACKERS', fallback, children: 'stuff' })).toBe(fallback)
  })

  it('returns children when flag is on regardless of fallback', async () => {
    const { FEATURES, FeatureGate } = await import('../featureFlags.js')
    FEATURES.POTION_ALCHEMISTS = true
    expect(FeatureGate({ flag: 'POTION_ALCHEMISTS', fallback: 'nope', children: 'yes' })).toBe('yes')
  })
})
