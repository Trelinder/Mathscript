import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// milestoneSync exports only `recordMastery` and `syncPendingMilestones`.
// The queue helpers (_readQueue, _writeQueue, _enqueue) are internal, so we
// test them indirectly via the public API and localStorage state.
// ─────────────────────────────────────────────────────────────────────────────

const PENDING_KEY = 'mathscript_pending_milestones'

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  } catch {
    return []
  }
}

describe('recordMastery', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns server response on success', async () => {
    const mockResponse = { ok: true, message: 'Milestone recorded', totalPoints: 10 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }))

    const { recordMastery } = await import('../milestoneSync.js')
    const result = await recordMastery('user_123', 'addition')
    expect(result).toEqual(mockResponse)
  })

  it('enqueues milestone to localStorage on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { recordMastery } = await import('../milestoneSync.js')
    await expect(recordMastery('user_456', 'fractions')).rejects.toThrow()

    const queue = readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].userId).toBe('user_456')
    expect(queue[0].conceptId).toBe('fractions')
    expect(queue[0].gameType).toBe('tycoon')
  })

  it('enqueues milestone when server returns non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const { recordMastery } = await import('../milestoneSync.js')
    await expect(recordMastery('user_789', 'multiplication')).rejects.toThrow()

    const queue = readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].conceptId).toBe('multiplication')
  })

  it('does not duplicate an already-queued milestone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { recordMastery } = await import('../milestoneSync.js')
    // Fail twice for the same user+concept
    await expect(recordMastery('user_abc', 'algebra')).rejects.toThrow()
    await expect(recordMastery('user_abc', 'algebra')).rejects.toThrow()

    const queue = readQueue()
    expect(queue).toHaveLength(1)
  })

  it('allows same user to queue different concepts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { recordMastery } = await import('../milestoneSync.js')
    await expect(recordMastery('user_abc', 'addition')).rejects.toThrow()
    await expect(recordMastery('user_abc', 'subtraction')).rejects.toThrow()

    const queue = readQueue()
    expect(queue).toHaveLength(2)
  })

  it('includes an ISO timestamp in the queued payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const { recordMastery } = await import('../milestoneSync.js')
    await expect(recordMastery('user_ts', 'decimals')).rejects.toThrow()

    const queue = readQueue()
    expect(queue[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('posts to /api/progress/milestone', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { recordMastery } = await import('../milestoneSync.js')
    await recordMastery('user_url', 'division')

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/progress/milestone')
    expect(options.method).toBe('POST')
  })
})

describe('syncPendingMilestones', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('does nothing when queue is empty', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const { syncPendingMilestones } = await import('../milestoneSync.js')
    await syncPendingMilestones()

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('clears queue after all items sync successfully', async () => {
    // Pre-populate the queue
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        { userId: 'u1', conceptId: 'addition', gameType: 'tycoon', timestamp: new Date().toISOString() },
        { userId: 'u1', conceptId: 'subtraction', gameType: 'tycoon', timestamp: new Date().toISOString() },
      ]),
    )

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }))

    const { syncPendingMilestones } = await import('../milestoneSync.js')
    await syncPendingMilestones()

    expect(readQueue()).toHaveLength(0)
  })

  it('keeps failed items in queue after sync attempt', async () => {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        { userId: 'u2', conceptId: 'fractions', gameType: 'tycoon', timestamp: new Date().toISOString() },
      ]),
    )

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))

    const { syncPendingMilestones } = await import('../milestoneSync.js')
    await syncPendingMilestones()

    expect(readQueue()).toHaveLength(1)
  })

  it('partially clears queue: removes synced, keeps failed', async () => {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify([
        { userId: 'u3', conceptId: 'addition', gameType: 'tycoon', timestamp: new Date().toISOString() },
        { userId: 'u3', conceptId: 'algebra', gameType: 'tycoon', timestamp: new Date().toISOString() },
      ]),
    )

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ ok: true }) })
        }
        return Promise.reject(new Error('Offline'))
      }),
    )

    const { syncPendingMilestones } = await import('../milestoneSync.js')
    await syncPendingMilestones()

    const remaining = readQueue()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].conceptId).toBe('algebra')
  })

  it('handles corrupted localStorage gracefully', async () => {
    localStorage.setItem(PENDING_KEY, 'not-valid-json')

    const { syncPendingMilestones } = await import('../milestoneSync.js')
    // Should not throw
    await expect(syncPendingMilestones()).resolves.toBeUndefined()
  })
})
