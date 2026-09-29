import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyBusUpgrade,
  applyCompilerUpgrade,
  getBusTravelSecondsPerFloor,
  getBusThroughput,
  getCompilerCycleSeconds,
  getCompilePayout,
  getCompilerThroughput,
  getQueueDrainSeconds,
} from '../src/utils/tycoonEconomy.js'

const bus = {
  capacity: 30,
  capacityLevel: 0,
  capacityCost: 25,
  speed: 0.5,
  speedLevel: 0,
  speedCost: 50,
  loadingDelay: 1500,
  loadingLevel: 0,
  loadingCost: 60,
}

const compiler = {
  batchSize: 3,
  batchLevel: 0,
  batchCost: 30,
  procTime: 2,
  procLevel: 0,
  procCost: 50,
  convRate: 2,
  convLevel: 0,
  convCost: 100,
}

test('compiler throughput includes the fetch phase and scales with batch upgrades', () => {
  assert.equal(getCompilerCycleSeconds(2), 2.7)
  assert.equal(getCompilerThroughput(3, 2), 3 / 2.7)
  assert.equal(getCompilerThroughput(6, 2), 6 / 2.7)
  assert.equal(getCompilerThroughput(3, 2, 600, 5), 15 / 2.7)
})

test('bus travel display matches the simulation speed and floor', () => {
  assert.equal(getBusTravelSecondsPerFloor(0.5), 1)
  assert.equal(getBusTravelSecondsPerFloor(0.55), 0.909)
  assert.equal(getBusTravelSecondsPerFloor(3), 0.2)
})

test('elevator throughput includes travel, loading, unload, and active overdrive', () => {
  assert.equal(getBusThroughput(30, 0.5, 1500, [0]), 30 / 4)
  assert.equal(getBusThroughput(30, 0.5, 1500, [0, 1]), 30 / 7.5)
  assert.ok(Math.abs(getBusThroughput(30, 0.5, 1500, [0], 1, false, 3) - 30 / 1.666) < 1e-12)
  assert.equal(getBusThroughput(30, 0.5, 1500, [], 1, true), 60)
})

test('bus and compiler upgrades preserve additive steps and stop charging at caps', () => {
  assert.equal(applyBusUpgrade(bus, 'capacity').capacity, 40)
  assert.equal(applyBusUpgrade(bus, 'speed').speed, 0.55)
  assert.equal(applyBusUpgrade(bus, 'loadingSpeed').loadingDelay, 1400)
  assert.equal(applyCompilerUpgrade(compiler, 'batch').batchSize, 6)
  assert.equal(applyCompilerUpgrade(compiler, 'proc').procTime, 1.85)
  assert.equal(applyCompilerUpgrade(compiler, 'conv').convRate, 2.5)
  assert.equal(applyBusUpgrade({ ...bus, speed: 2.5 }, 'speed'), null)
  assert.equal(applyBusUpgrade({ ...bus, loadingDelay: 300 }, 'loadingSpeed'), null)
  assert.equal(applyCompilerUpgrade({ ...compiler, procTime: 0.5 }, 'proc'), null)
})

test('queue drain estimates distinguish clearing from sustained backup', () => {
  assert.equal(getQueueDrainSeconds(60, 2, 3), 60)
  assert.equal(getQueueDrainSeconds(60, 3, 3), Infinity)
  assert.equal(getQueueDrainSeconds(0, 3, 2), 0)
})

test('batch upgrades only clear a backlog after sales throughput exceeds elevator inflow', () => {
  const elevatorRate = getBusThroughput(30, 0.5, 1500, [0])
  assert.ok(Math.abs(elevatorRate - 30 / 4) < 1e-12)
  assert.equal(getQueueDrainSeconds(1200, elevatorRate, getCompilerThroughput(12, 2)), Infinity)

  let upgradedCompiler = { ...compiler, batchSize: 12, batchLevel: 3 }
  for (let level = 0; level < 3; level++) {
    upgradedCompiler = applyCompilerUpgrade(upgradedCompiler, 'batch')
  }

  const upgradedSalesRate = getCompilerThroughput(upgradedCompiler.batchSize, upgradedCompiler.procTime)
  assert.equal(upgradedCompiler.batchSize, 21)
  assert.ok(upgradedSalesRate > elevatorRate)
  assert.ok(Number.isFinite(getQueueDrainSeconds(1200, elevatorRate, upgradedSalesRate)))
})

test('conversion upgrades change dollars per RC with the same payout formula', () => {
  assert.equal(getCompilePayout(3, 2), 6)
  assert.equal(getCompilePayout(3, 2.5, 1.1, 1.2), 9.9)
})