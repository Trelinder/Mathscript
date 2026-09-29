import { upgradeCost } from './upgradeMath.js'

export const COMPILER_FETCH_MS = 600
export const COMPILER_MIN_PROC_SECONDS = 0.3
export const BUS_UNLOAD_MS = 400
export const AUTO_DISPATCH_MS = 100

const round2 = value => Number(value.toFixed(2))

export function applyBusUpgrade(bus, type) {
  const nextLevel = (bus[`${type === 'loadingSpeed' ? 'loading' : type}Level`] ?? 0) + 1

  if (type === 'capacity') {
    return {
      ...bus,
      capacity: 30 + nextLevel * 10,
      capacityLevel: nextLevel,
      capacityCost: upgradeCost(25, nextLevel, 1.15),
    }
  }

  if (type === 'speed') {
    const speed = Math.min(2.5, 0.5 + nextLevel * 0.05)
    if (speed <= bus.speed) return null
    return {
      ...bus,
      speed: round2(speed),
      speedLevel: nextLevel,
      speedCost: upgradeCost(50, nextLevel, 1.15),
    }
  }

  if (type === 'loadingSpeed') {
    const loadingDelay = Math.max(300, 1500 - nextLevel * 100)
    if (loadingDelay >= (bus.loadingDelay ?? 1500)) return null
    return {
      ...bus,
      loadingDelay,
      loadingLevel: nextLevel,
      loadingCost: upgradeCost(60, nextLevel, 1.3),
    }
  }

  return null
}

export function applyCompilerUpgrade(compiler, type) {
  const nextLevel = (compiler[`${type}Level`] ?? 0) + 1

  if (type === 'batch') {
    return {
      ...compiler,
      batchSize: 3 + nextLevel * 3,
      batchLevel: nextLevel,
      batchCost: upgradeCost(30, nextLevel, 1.15),
    }
  }

  if (type === 'proc') {
    const procTime = Math.max(0.5, round2(2 - nextLevel * 0.15))
    if (procTime >= compiler.procTime) return null
    return {
      ...compiler,
      procTime,
      procLevel: nextLevel,
      procCost: upgradeCost(50, nextLevel, 1.15),
    }
  }

  if (type === 'conv') {
    return {
      ...compiler,
      convRate: round2(2 + nextLevel * 0.5),
      convLevel: nextLevel,
      convCost: upgradeCost(100, nextLevel, 1.15),
    }
  }

  return null
}

export function getCompilerCycleSeconds(procTime, fetchMs = COMPILER_FETCH_MS, dispatchMs = AUTO_DISPATCH_MS) {
  return Math.max(COMPILER_MIN_PROC_SECONDS, Number(procTime) || 0) + (fetchMs + dispatchMs) / 1000
}

export function getCompilerThroughput(batchSize, procTime, fetchMs = COMPILER_FETCH_MS, batchMultiplier = 1, dispatchMs = AUTO_DISPATCH_MS) {
  const cycleSeconds = getCompilerCycleSeconds(procTime, fetchMs, dispatchMs)
  return Math.max(0, Number(batchSize) || 0) * Math.max(0, Number(batchMultiplier) || 0) / cycleSeconds
}

export function getBusTravelSecondsPerFloor(speed, speedMultiplier = 1) {
  const safeSpeed = Math.max(0.01, (Number(speed) || 0) * Math.max(0.01, Number(speedMultiplier) || 0))
  return Math.max(0.2, Math.round(500 / safeSpeed) / 1000)
}

export function getBusThroughput(capacity, speed, loadingDelay, visibleFloorSlots = [], capacityMultiplier = 1, hasOffscreenProduction = false, speedMultiplier = 1) {
  const slots = visibleFloorSlots.filter(Number.isFinite).map(slot => Math.max(0, Math.floor(slot)))
  if (slots.length === 0) {
    return hasOffscreenProduction
      ? Math.max(0, Number(capacity) || 0) * Math.max(0, Number(capacityMultiplier) || 0) / ((BUS_UNLOAD_MS + AUTO_DISPATCH_MS) / 1000)
      : 0
  }

  const highestSlot = Math.max(...slots)
  const safeSpeedMultiplier = Math.max(0.01, Number(speedMultiplier) || 0)
  const moveSeconds = getBusTravelSecondsPerFloor(speed, safeSpeedMultiplier)
  const loadSeconds = Math.max(300, Math.round((Number(loadingDelay) || 1500) / safeSpeedMultiplier)) / 1000
  const travelSteps = 2 * (highestSlot + 1)
  const cycleSeconds = travelSteps * moveSeconds + slots.length * loadSeconds + (BUS_UNLOAD_MS + AUTO_DISPATCH_MS) / 1000
  return Math.max(0, Number(capacity) || 0) * Math.max(0, Number(capacityMultiplier) || 0) / cycleSeconds
}

export function getQueueDrainSeconds(queued, incomingRate, serviceRate) {
  const queue = Math.max(0, Number(queued) || 0)
  if (queue === 0) return 0

  const netDrainRate = (Number(serviceRate) || 0) - (Number(incomingRate) || 0)
  if (netDrainRate <= 0) return Infinity
  return queue / netDrainRate
}

export function getCompilePayout(amount, conversionRate, globalMultiplier = 1, researchMultiplier = 1, flowMultiplier = 1) {
  const payout = (Number(amount) || 0)
    * (Number(conversionRate) || 0)
    * (Number(globalMultiplier) || 0)
    * (Number(researchMultiplier) || 0)
    * (Number(flowMultiplier) || 0)
  return round2(payout)
}