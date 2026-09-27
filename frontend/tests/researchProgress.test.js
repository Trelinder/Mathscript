import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getResearchCost,
  getResearchMultipliers,
  normalizeResearch,
} from '../src/utils/researchProgress.js'

test('research starts with neutral multipliers and track-specific costs', () => {
  assert.deepEqual(normalizeResearch(), { compute: 0, network: 0, compiler: 0 })
  assert.deepEqual(getResearchMultipliers(), { compute: 1, network: 1, compiler: 1 })
  assert.equal(getResearchCost('compute', 0), 500)
  assert.equal(getResearchCost('network', 0), 800)
  assert.equal(getResearchCost('compiler', 0), 1000)
})

test('each research level adds five percent and costs grow exponentially', () => {
  assert.deepEqual(getResearchMultipliers({ compute: 2, network: 1, compiler: 3 }), {
    compute: 1.1,
    network: 1.05,
    compiler: 1.15,
  })
  assert.equal(getResearchCost('compute', 1), 900)
})

test('research levels are clamped and unknown tracks are discarded', () => {
  assert.deepEqual(normalizeResearch({ compute: 99, network: -4, compiler: '2', extra: 5 }), {
    compute: 5,
    network: 0,
    compiler: 2,
  })
})