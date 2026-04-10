import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// observability.js exports initObservability().
// It performs DOM-based side effects (addEventListener, web-vitals import).
// We test the guards and telemetry logic by inspecting sendBeacon / fetch calls
// and by dispatching synthetic browser events.
// ─────────────────────────────────────────────────────────────────────────────

function clearInitFlag() {
  delete window.__mathscriptObservabilityInit
}

beforeEach(() => {
  clearInitFlag()
  localStorage.clear()
  vi.resetModules()
  vi.stubGlobal('navigator', { sendBeacon: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
  clearInitFlag()
})

// ─────────────────────────────────────────────────────────────────────────────
// initObservability — idempotency guard
// ─────────────────────────────────────────────────────────────────────────────
describe('initObservability — idempotency guard', () => {
  it('sets window.__mathscriptObservabilityInit to true on first call', async () => {
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(true) })

    const { initObservability } = await import('../observability.js')
    initObservability()

    expect(window.__mathscriptObservabilityInit).toBe(true)
  })

  it('does not add duplicate event listeners when called twice', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    vi.stubGlobal('navigator', { sendBeacon: vi.fn().mockReturnValue(true) })

    const { initObservability } = await import('../observability.js')
    initObservability()
    const callsAfterFirst = addSpy.mock.calls.length

    initObservability() // second call — should be a no-op
    expect(addSpy.mock.calls.length).toBe(callsAfterFirst)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// initObservability — client_error event
// ─────────────────────────────────────────────────────────────────────────────
describe('initObservability — window error events', () => {
  it('sends a client_error telemetry event when window fires an error', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'TypeError: undefined is not a function',
        filename: '/static/app.js',
        lineno: 42,
        colno: 7,
      })
    )

    expect(beacon).toHaveBeenCalled()
    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.event_type).toBe('client_error')
    expect(parsed.payload.message).toContain('TypeError')
  })

  it('includes source and line/col in the client_error payload', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'SyntaxError',
        filename: '/app.js',
        lineno: 10,
        colno: 5,
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.payload.source).toBe('/app.js')
    expect(parsed.payload.line).toBe(10)
    expect(parsed.payload.col).toBe(5)
  })

  it('truncates very long error messages to 400 characters', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    const longMessage = 'X'.repeat(600)
    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: longMessage,
        filename: '/app.js',
        lineno: 1,
        colno: 1,
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.payload.message.length).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// initObservability — unhandledrejection event
// ─────────────────────────────────────────────────────────────────────────────
describe('initObservability — unhandledrejection events', () => {
  it('sends an unhandled_rejection event when a Promise is rejected without a handler', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: new Error('Unhandled promise failure'),
      })
    )

    expect(beacon).toHaveBeenCalled()
    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.event_type).toBe('unhandled_rejection')
    expect(parsed.payload.reason).toContain('Unhandled promise failure')
  })

  it('handles string reasons without throwing', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: 'bare string reason',
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.event_type).toBe('unhandled_rejection')
  })

  it('handles missing reason gracefully', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(new Event('unhandledrejection'))

    expect(beacon).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildPayload — verified indirectly via the dispatched events above.
// Test page & sessionId fields specifically.
// ─────────────────────────────────────────────────────────────────────────────
describe('buildPayload — page and sessionId fields', () => {
  it('includes the current page path in the payload', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'test',
        filename: '',
        lineno: 0,
        colno: 0,
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    // jsdom sets pathname to '/' by default
    expect(typeof parsed.page).toBe('string')
  })

  it('includes session_id from localStorage when set', async () => {
    localStorage.setItem('mathscript_session_id', 'obs-session-42')
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'test',
        filename: '',
        lineno: 0,
        colno: 0,
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.session_id).toBe('obs-session-42')
  })

  it('uses null session_id when localStorage is empty', async () => {
    const beacon = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })

    const { initObservability } = await import('../observability.js')
    initObservability()

    window.dispatchEvent(
      Object.assign(new Event('error'), {
        message: 'test',
        filename: '',
        lineno: 0,
        colno: 0,
      })
    )

    const body = await beacon.mock.calls[0][1].text()
    const parsed = JSON.parse(body)
    expect(parsed.session_id).toBeNull()
  })
})
