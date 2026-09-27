export const RESEARCH_MAX_LEVEL = 5

export const RESEARCH_TRACKS = {
  compute: { name: 'Server Scheduling', baseCost: 500, effect: 'Compute output' },
  network: { name: 'Fiber Routing', baseCost: 800, effect: 'Data Bus capacity' },
  compiler: { name: 'Compiler Kernels', baseCost: 1000, effect: 'Compile reward' },
}

function normalizeLevel(level) {
  const numericLevel = Number(level)
  if (!Number.isFinite(numericLevel)) return 0
  return Math.min(RESEARCH_MAX_LEVEL, Math.max(0, Math.floor(numericLevel)))
}

export function normalizeResearch(research = {}) {
  return Object.fromEntries(
    Object.keys(RESEARCH_TRACKS).map((track) => [track, normalizeLevel(research?.[track])]),
  )
}

export function getResearchMultipliers(research = {}) {
  return Object.fromEntries(
    Object.entries(normalizeResearch(research)).map(([track, level]) => [track, 1 + level * 0.05]),
  )
}

export function getResearchCost(track, level) {
  const definition = RESEARCH_TRACKS[track]
  if (!definition) throw new RangeError(`Unknown research track: ${track}`)
  return Math.ceil(definition.baseCost * (1.8 ** normalizeLevel(level)))
}