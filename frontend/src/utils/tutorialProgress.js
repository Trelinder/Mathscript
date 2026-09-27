export function hasProgressedPastTutorial(state) {
  return Boolean(
    state.hasCompletedTutorial ||
    state.lifetime > 0 ||
    state.managers?.elevator?.isHired ||
    state.managers?.sales?.isHired ||
    state.managers?.floors?.some(manager => manager?.isHired)
  )
}