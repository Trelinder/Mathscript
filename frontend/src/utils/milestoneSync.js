/**
 * milestoneSync.js
 *
 * Utility functions for recording analogy milestones to the backend and
 * handling offline resilience via a localStorage queue.
 *
 * Usage
 * ─────
 *  // Record a solved analogy (called from AnalogyOverlay):
 *  import { recordMastery } from '../utils/milestoneSync'
 *  await recordMastery(userId, conceptId)   // throws on network failure
 *
 *  // Drain any milestones queued while offline (called on page mount):
 *  import { syncPendingMilestones } from '../utils/milestoneSync'
 *  useEffect(() => { syncPendingMilestones() }, [])
 *
 * Offline strategy
 * ────────────────
 *  If the fetch fails (network error, timeout, or non-2xx), the milestone is
 *  appended to a localStorage queue keyed by PENDING_KEY.  On the next call
 *  to syncPendingMilestones(), the queue is replayed in order and successfully
 *  synced items are removed.  Items that still fail are left for the next run.
 */

/** localStorage key for the pending-milestone queue. */
const PENDING_KEY = 'mathscript_pending_milestones'

/** Game type sent in every milestone payload from this game. */
const GAME_TYPE = 'tycoon'

/**
 * Maximum time (ms) to wait for the /api/progress/milestone response before
 * treating the request as failed and queuing locally.  8 seconds is long
 * enough for a slow mobile connection to complete a small JSON POST, but short
 * enough to unblock the child's game without a noticeable hang.
 */
const FETCH_TIMEOUT_MS = 8000

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the current pending queue from localStorage.
 * Returns an empty array if storage is unavailable or the value is malformed.
 * @returns {Array<{userId:string, conceptId:string, gameType:string, timestamp:string}>}
 */
function _readQueue() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]')
  } catch {
    // localStorage value is corrupted — treat as empty and let the game
    // proceed.  The next successful write will overwrite the bad data.
    console.warn('[milestoneSync] Pending queue could not be parsed; resetting.')
    return []
  }
}

/**
 * Persist *queue* back to localStorage.  Silently swallows errors so storage
 * failures (private mode / quota exceeded) never break the game.
 * @param {Array} queue
 */
function _writeQueue(queue) {
  try {
    if (queue.length === 0) {
      localStorage.removeItem(PENDING_KEY)
    } else {
      localStorage.setItem(PENDING_KEY, JSON.stringify(queue))
    }
  } catch {
    // Silently ignore — progress will simply be retried next session
  }
}

/**
 * Append *payload* to the pending queue, deduplicating by (userId, conceptId)
 * so the same milestone is never queued twice.
 * @param {{ userId:string, conceptId:string, gameType:string, timestamp:string }} payload
 */
function _enqueue(payload) {
  const queue = _readQueue()
  const isDuplicate = queue.some(
    (item) => item.userId === payload.userId && item.conceptId === payload.conceptId,
  )
  if (!isDuplicate) {
    _writeQueue([...queue, payload])
  }
}

/**
 * POST a single milestone payload to the backend.
 * Returns the parsed JSON body on success.
 * Throws on network error, AbortError, or non-2xx response.
 * @param {{ userId:string, conceptId:string, gameType:string, timestamp:string }} payload
 * @returns {Promise<{ ok:boolean, message:string, totalPoints:number }>}
 */
async function _post(payload) {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('/api/progress/milestone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timerId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * recordMastery
 *
 * POSTs a completed analogy milestone to /api/progress/milestone.
 *
 * On success the Promise resolves with the server response
 * `{ ok, message, totalPoints }`.
 *
 * On failure (network down, timeout, server error) the milestone is saved to
 * the localStorage pending queue for later retry, and the Promise rejects so
 * the caller can decide how to handle the offline case in the UI.
 *
 * TODO: thread the real `userId` from your auth context once authentication is
 * added.  For now the session ID (`sess_xxx`) stored in localStorage serves as
 * the anonymous learner identifier.
 *
 * @param {string} userId    Learner's identifier (session ID)
 * @param {string} conceptId Analogy concept that was mastered
 * @returns {Promise<{ ok:boolean, message:string, totalPoints:number }>}
 */
export async function recordMastery(userId, conceptId) {
  const payload = {
    userId,
    conceptId,
    gameType: GAME_TYPE,
    timestamp: new Date().toISOString(),
  }
  try {
    return await _post(payload)
  } catch (err) {
    // Save locally so the milestone isn't lost while the device is offline
    _enqueue(payload)
    throw err
  }
}

/**
 * syncPendingMilestones
 *
 * Attempts to re-send any milestones that were saved to localStorage while the
 * device was offline.  Successfully synced items are removed from the queue;
 * items that still fail are left for the next call.
 *
 * Call this once on page/component mount so offline progress is never lost.
 *
 * @returns {Promise<void>}
 */
export async function syncPendingMilestones() {
  const queue = _readQueue()
  if (queue.length === 0) return

  const remaining = []
  for (const item of queue) {
    try {
      await _post(item)
      // Successfully synced — drop from queue (do not push to remaining)
    } catch {
      // Still failing — keep for next attempt
      remaining.push(item)
    }
  }
  _writeQueue(remaining)
}
