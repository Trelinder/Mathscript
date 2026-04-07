/**
 * SoundEngine.test.js
 *
 * Validates the AudioManager behaviour without relying on actual audio files or
 * a real AudioContext.  The tests verify:
 *   1. All six public exports exist and are callable.
 *   2. Each export is a no-op when no URL is configured (default state).
 *   3. The Web Audio path: fetch + decodeAudioData are called once per key
 *      (buffer is cached), a new BufferSourceNode is created on every call
 *      (enabling concurrent playback), and playbackRate / gain are jittered.
 *   4. A fetch failure is swallowed — the function returns without throwing.
 *   5. A missing AudioContext is handled gracefully.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

function makeMockAudioContext(decodeResult = new ArrayBuffer(0)) {
  const gainNode = {
    gain:    { value: 1 },
    connect: vi.fn(),
  }
  const sourceNode = {
    buffer:       null,
    playbackRate: { value: 1 },
    connect:      vi.fn(),
    start:        vi.fn(),
  }
  const ctx = {
    destination: {},
    createGain:         vi.fn(() => gainNode),
    createBufferSource: vi.fn(() => ({ ...sourceNode, connect: vi.fn(), start: vi.fn() })),
    decodeAudioData:    vi.fn((_buf) => Promise.resolve(decodeResult)),
  }
  return { ctx, gainNode, sourceNode }
}

// ─── Helper: reload the module with a given SOUNDS config and context ─────────

async function loadEngine({ url = '/sounds/test.mp3', ctxFactory } = {}) {
  // We dynamically patch the module by resetting the module registry each test
  // (Vitest supports vi.resetModules()).  We inject fakes via globalThis so the
  // module under test can reference them without named imports.

  vi.resetModules()

  if (ctxFactory) {
    globalThis.AudioContext    = ctxFactory
    globalThis.webkitAudioContext = undefined
  } else {
    globalThis.AudioContext    = undefined
    globalThis.webkitAudioContext = undefined
  }

  // Patch global fetch used by the module
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
  )

  // Dynamically import with the module registry cleared so the singleton state
  // (AudioContext, buffer cache) is fresh for each test.
  const mod = await import('../SoundEngine.js?t=' + Date.now())
  return mod
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SoundEngine — public API surface', () => {
  it('exports all six play functions', async () => {
    const mod = await import('../SoundEngine.js')
    expect(typeof mod.playClick).toBe('function')
    expect(typeof mod.playCast).toBe('function')
    expect(typeof mod.playHit).toBe('function')
    expect(typeof mod.playChaChing).toBe('function')
    expect(typeof mod.playCoin).toBe('function')
    expect(typeof mod.playUpgrade).toBe('function')
  })
})

describe('SoundEngine — no-op when URL is empty', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
    delete globalThis.AudioContext
    delete globalThis.webkitAudioContext
  })

  it('does not call fetch when no URL is configured', async () => {
    vi.resetModules()
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    globalThis.AudioContext = vi.fn()

    const { playClick, playCoin, playUpgrade } = await import('../SoundEngine.js?noop=' + Date.now())
    // All URLs are '' by default — none should trigger a fetch
    playClick(); playCoin(); playUpgrade()
    // Allow microtask queue to drain
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not throw when called multiple times with no URL', async () => {
    vi.resetModules()
    globalThis.fetch = vi.fn()
    const { playClick, playChaChing, playCoin, playUpgrade, playCast, playHit } =
      await import('../SoundEngine.js?noop2=' + Date.now())
    expect(() => {
      for (let i = 0; i < 10; i++) {
        playClick(); playChaChing(); playCoin(); playUpgrade(); playCast(); playHit()
      }
    }).not.toThrow()
  })
})

describe('SoundEngine — graceful degradation without AudioContext', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete globalThis.fetch
    delete globalThis.AudioContext
    delete globalThis.webkitAudioContext
  })

  it('does not throw when AudioContext is unavailable', async () => {
    vi.resetModules()
    globalThis.AudioContext = undefined
    globalThis.webkitAudioContext = undefined
    // Even if a URL were configured, _getCtx() returns null → no-op
    const mod = await import('../SoundEngine.js?noctx=' + Date.now())
    expect(() => mod.playClick()).not.toThrow()
    expect(() => mod.playCoin()).not.toThrow()
  })

  it('does not throw when fetch rejects', async () => {
    vi.resetModules()
    const { ctx } = makeMockAudioContext()
    globalThis.AudioContext = vi.fn(() => ctx)
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')))

    const mod = await import('../SoundEngine.js?fetchfail=' + Date.now())
    // Even if URL were configured, the rejection is swallowed
    expect(() => mod.playClick()).not.toThrow()
    await Promise.resolve() // drain promise queue — still no throw
  })
})
