import assert from 'node:assert/strict'
import test from 'node:test'
import { getOrCreateSessionId, resolveGameSessionId } from '../src/utils/sessionId.js'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('standalone game accepts valid query sessions and falls back for invalid IDs', () => {
  const storage = createStorage({ mathscript_session_id: 'sess_saved123' })
  assert.equal(resolveGameSessionId('?s=sess_linked12', storage), 'sess_linked12')
  assert.equal(resolveGameSessionId('?s=anonymous', storage), 'sess_saved123')
})

test('guest session is generated once and persisted under the shared key', () => {
  const storage = createStorage()
  const sessionId = getOrCreateSessionId(storage)
  assert.match(sessionId, /^sess_[a-z0-9]{8}$/)
  assert.equal(getOrCreateSessionId(storage), sessionId)
})