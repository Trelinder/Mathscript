import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry.js uses navigator.sendBeacon and fetch as transport.
// We mock both at the global level and reset between tests.
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  // Ensure a clean navigator state each test
  vi.stubGlobal('navigator', { sendBeacon: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// trackEvent — sendBeacon path
// ─────────────────────────────────────────────────────────────────────────────
describe('trackEvent — sendBeacon path', () => {
  it('calls navigator.sendBeacon when it is available', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('spell_cast', { correct: true })

    expect(beacon).toHaveBeenCalledOnce()
  })

  it('passes the correct endpoint URL to sendBeacon', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const url = beacon.mock.calls[0][0]
    expect(url).toContain('/api/client-telemetry')
  })

  it('passes a Blob to sendBeacon', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const blob = beacon.mock.calls[0][1]
    expect(blob).toBeInstanceOf(Blob)
  })

  it('Blob type is application/json', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const blob = beacon.mock.calls[0][1]
    expect(blob.type).toBe('application/json')
  })

  it('payload JSON contains the event_type field', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('tycoon_purchase', { upgrade_name: 'AutoScribe' })

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.event_type).toBe('tycoon_purchase')
  })

  it('payload JSON contains the metadata', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('spell_cast', { correct: true, level: 5 })

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.metadata).toEqual({ correct: true, level: 5 })
  })

  it('payload JSON contains a timestamp string', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(typeof parsed.timestamp).toBe('string')
    expect(() => new Date(parsed.timestamp)).not.toThrow()
  })

  it('includes session_id from localStorage when available', async () => {
    localStorage.setItem('mathscript_session_id', 'session-abc-123')
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.session_id).toBe('session-abc-123')
  })

  it('uses "anon" as session_id when localStorage is empty', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.session_id).toBe('anon')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// trackEvent — fetch fallback path
// ─────────────────────────────────────────────────────────────────────────────
describe('trackEvent — fetch fallback path', () => {
  it('calls fetch when sendBeacon is not available', async () => {
    vi.stubGlobal('navigator', {}) // no sendBeacon
    const mockFetch = vi.fn().mockResolvedValue({})
    vi.stubGlobal('fetch', mockFetch)

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('makes a POST request with fetch', async () => {
    vi.stubGlobal('navigator', {})
    const mockFetch = vi.fn().mockResolvedValue({})
    vi.stubGlobal('fetch', mockFetch)

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const [, options] = mockFetch.mock.calls[0]
    expect(options.method).toBe('POST')
  })

  it('sets Content-Type to application/json in fetch call', async () => {
    vi.stubGlobal('navigator', {})
    const mockFetch = vi.fn().mockResolvedValue({})
    vi.stubGlobal('fetch', mockFetch)

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('test_event', {})

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw when fetch rejects (fire-and-forget)', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')))

    const { trackEvent } = await import('../Telemetry.js')
    await expect(async () => trackEvent('test_event', {})).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// trackEvent — empty / default metadata
// ─────────────────────────────────────────────────────────────────────────────
describe('trackEvent — metadata default', () => {
  it('defaults metadata to {} when not provided', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { trackEvent } = await import('../Telemetry.js')
    trackEvent('bare_event')

    const blob = beacon.mock.calls[0][1]
    const text = await blob.text()
    const parsed = JSON.parse(text)
    expect(parsed.metadata).toEqual({})
  })
})
