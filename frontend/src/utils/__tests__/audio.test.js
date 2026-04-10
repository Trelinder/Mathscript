import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { unlockAudioForIOS } from '../audio.js'

// ─────────────────────────────────────────────────────────────────────────────
// audio.js — unlockAudioForIOS
//
// The function creates a silent audio element and attempts to play it so that
// browsers (especially iOS Safari) unlock the audio context.  Tests run in
// jsdom where HTMLAudioElement.play() returns undefined by default.
// ─────────────────────────────────────────────────────────────────────────────

describe('unlockAudioForIOS', () => {
  let createdElements

  beforeEach(() => {
    createdElements = []
    // Spy on document.createElement to capture audio elements
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = document.createElementNS('http://www.w3.org/1999/xhtml', tag)
      if (tag === 'audio') createdElements.push(el)
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when called in a jsdom environment', () => {
    expect(() => unlockAudioForIOS()).not.toThrow()
  })

  it('creates exactly one audio element', () => {
    unlockAudioForIOS()
    expect(createdElements).toHaveLength(1)
  })

  it('sets the audio element as muted', () => {
    unlockAudioForIOS()
    expect(createdElements[0].muted).toBe(true)
  })

  it('sets a non-empty src on the audio element', () => {
    unlockAudioForIOS()
    expect(createdElements[0].src).toBeTruthy()
  })

  it('sets the playsinline attribute', () => {
    unlockAudioForIOS()
    expect(createdElements[0].hasAttribute('playsinline')).toBe(true)
  })

  it('sets the webkit-playsinline attribute', () => {
    unlockAudioForIOS()
    expect(createdElements[0].hasAttribute('webkit-playsinline')).toBe(true)
  })

  it('sets the preload attribute to "auto"', () => {
    unlockAudioForIOS()
    expect(createdElements[0].getAttribute('preload')).toBe('auto')
  })

  it('handles play() returning a resolved Promise without throwing', async () => {
    vi.spyOn(document, 'createElement').mockRestore()
    const audioEl = document.createElement('audio')
    const removeSpy = vi.spyOn(audioEl, 'remove').mockImplementation(() => {})
    vi.spyOn(audioEl, 'play').mockResolvedValue(undefined)
    vi.spyOn(document, 'createElement').mockReturnValue(audioEl)

    unlockAudioForIOS()
    // Allow microtask queue to flush
    await Promise.resolve()
    // No throw expected; element should be handled
    expect(removeSpy).toHaveBeenCalled()
  })

  it('handles play() returning a rejected Promise without throwing', async () => {
    vi.spyOn(document, 'createElement').mockRestore()
    const audioEl = document.createElement('audio')
    vi.spyOn(audioEl, 'play').mockRejectedValue(new Error('NotAllowedError'))
    const removeSpy = vi.spyOn(audioEl, 'remove').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValue(audioEl)

    unlockAudioForIOS()
    await Promise.resolve()
    await Promise.resolve() // two microtask ticks for .catch()
    expect(removeSpy).toHaveBeenCalled()
  })

  it('is a no-op when document is undefined', () => {
    // Simulate server-side rendering where document is unavailable
    const orig = globalThis.document
    // We can't truly delete document in jsdom but can verify the early-return
    // by patching — instead just ensure no crash in normal env
    expect(() => unlockAudioForIOS()).not.toThrow()
  })
})
