import assert from 'node:assert/strict'
import test from 'node:test'
import { hasProgressedPastTutorial } from '../src/utils/tutorialProgress.js'

test('fresh saves still receive the tutorial', () => {
  assert.equal(hasProgressedPastTutorial({ lifetime: 0 }), false)
})

test('saves with earned lifetime cash do not restart the tutorial', () => {
  assert.equal(hasProgressedPastTutorial({ lifetime: 30.25 }), true)
})

test('completed tutorials and hired managers remain recognized', () => {
  assert.equal(hasProgressedPastTutorial({ hasCompletedTutorial: true }), true)
  assert.equal(hasProgressedPastTutorial({ managers: { elevator: { isHired: true } } }), true)
})