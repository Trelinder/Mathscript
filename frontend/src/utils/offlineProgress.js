import { getResearchMultipliers } from './researchProgress.js'

const MAX_OFFLINE_SECONDS = 8 * 60 * 60

const isHired = (manager) => manager === true || manager?.isHired === true

export function calculateOfflineProgress(savedData, floorRates, now = Date.now()) {
  if (!savedData?.lastSavedTimestamp) return { earned: 0, seconds: 0 }

  const elapsedSeconds = Math.min((now - savedData.lastSavedTimestamp) / 1000, MAX_OFFLINE_SECONDS)
  if (elapsedSeconds < 60) return { earned: 0, seconds: 0 }

  const managers = savedData.managers ?? {}
  if (!isHired(managers.elevator) || !isHired(managers.sales)) {
    return { earned: 0, seconds: 0 }
  }

  const globalMultiplier = 1 + (savedData.claimedTokens ?? savedData.primeTokens ?? 0) * 0.10
  const researchMultipliers = getResearchMultipliers(savedData.research)
  const totalProductionRate = floorRates.reduce((total, rate, index) => (
    isHired(managers.floors?.[index]) ? total + rate : total
  ), 0) * globalMultiplier * researchMultipliers.compute
  const bus = savedData.bus ?? {}
  const compiler = savedData.compiler ?? {}
  const busRate = (bus.capacity ?? 30) * globalMultiplier * (bus.speed ?? 0.5) * researchMultipliers.network
  const compilerRate = (compiler.batchSize ?? 3) / Math.max(0.5, compiler.procTime ?? 2)
  const effectiveRate = Math.min(totalProductionRate, busRate, compilerRate)
  const earned = effectiveRate * (compiler.convRate ?? 2) * globalMultiplier * researchMultipliers.compiler * elapsedSeconds

  return { earned: Math.round((earned + Number.EPSILON) * 100) / 100, seconds: Math.round(elapsedSeconds) }
}