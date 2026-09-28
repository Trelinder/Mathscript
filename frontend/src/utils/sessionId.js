export const SESSION_STORAGE_KEY = 'mathscript_session_id'
const SESSION_ID_PATTERN = /^sess_[a-z0-9]{6,20}$/

export function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId)
}

export function createSessionId(random = Math.random) {
  const suffix = Math.floor(random() * (36 ** 8)).toString(36).padStart(8, '0')
  return `sess_${suffix}`
}

function getBrowserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function getOrCreateSessionId(storage = getBrowserStorage()) {
  try {
    const saved = storage?.getItem(SESSION_STORAGE_KEY)
    if (isValidSessionId(saved)) return saved
    const fresh = createSessionId()
    storage?.setItem(SESSION_STORAGE_KEY, fresh)
    return fresh
  } catch {
    return createSessionId()
  }
}

export function resolveGameSessionId(search, storage = getBrowserStorage()) {
  const requestedSessionId = new URLSearchParams(search).get('s')
  return isValidSessionId(requestedSessionId)
    ? requestedSessionId
    : getOrCreateSessionId(storage)
}