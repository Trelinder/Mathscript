import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOfflineProgress } from '../src/utils/offlineProgress.js'

const now = 100_000
const savedData = {
  lastSavedTimestamp: now - 60_000,
  floors: [{ level: 1 }, { level: 100 }],
  managers: {
    floors: [{ isHired: true }, { isHired: false }],
    elevator: { isHired: true },
    sales: { isHired: true },
  },
  bus: { capacity: 30, speed: 0.5 },
  compiler: { batchSize: 3, procTime: 2, convRate: 2 },
}

test('offline earnings only include floors with hired managers', () => {
  const result = calculateOfflineProgress(savedData, [0.5, 100], now)

  assert.deepEqual(result, { earned: 60, seconds: 60 })
})

test('offline earnings are zero when no production floor is automated', () => {
  const unmanagedSave = {
    ...savedData,
    managers: { ...savedData.managers, floors: [{ isHired: false }, { isHired: false }] },
  }

  const result = calculateOfflineProgress(unmanagedSave, [0.5, 100], now)

  assert.deepEqual(result, { earned: 0, seconds: 60 })
})