import assert from 'node:assert/strict'
import test from 'node:test'
import { canPurchaseFloor } from '../src/utils/floorUnlocks.js'

test('unlocked floors remain upgradeable', () => {
  assert.equal(canPurchaseFloor([{ level: 1 }, { level: 0 }], 0), true)
})

test('only the next locked floor is available to unlock', () => {
  const floors = [{ level: 1 }, { level: 0 }, { level: 0 }, { level: 0 }]
  assert.equal(canPurchaseFloor(floors, 1), true)
  assert.equal(canPurchaseFloor(floors, 2), false)
  assert.equal(canPurchaseFloor(floors, 3), false)
})

test('invalid tower indices cannot be purchased', () => {
  const floors = [{ level: 1 }, { level: 0 }]
  assert.equal(canPurchaseFloor(floors, -1), false)
  assert.equal(canPurchaseFloor(floors, 2), false)
})