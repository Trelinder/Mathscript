export function canPurchaseFloor(floors, floorIndex) {
  if (!Array.isArray(floors) || !Number.isInteger(floorIndex) || floorIndex < 0 || floorIndex >= floors.length) {
    return false
  }

  if ((floors[floorIndex]?.level ?? 0) > 0) return true

  return floors.findIndex(floor => (floor?.level ?? 0) === 0) === floorIndex
}