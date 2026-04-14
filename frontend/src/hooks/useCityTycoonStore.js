/**
 * useCityTycoonStore.js
 *
 * Multi-city currency isolation (Command 3).
 *
 * Each city lot in the Macro City Map operates as a completely separate economy:
 * its own coins balance, production state, and currency label.  When the player
 * taps a lot on the isometric map GamePlayerPage mounts using ONLY that lot's
 * state slice (passed in as props/state from the parent component).  While the
 * active lot is running, all OTHER owned lots continue to accumulate offline
 * idle earnings via the 30-second background delta-time loop in GamePlayerPage
 * — this hook does NOT duplicate that logic.
 *
 * Usage inside GamePlayerPage:
 *
 *   const cityStore = useCityTycoonStore({
 *     activeBuildingIdx,
 *     buildings,
 *     coins,
 *   })
 *   // cityStore.activeLot      — CITY_LOTS entry for the current building
 *   // cityStore.currencyLabel  — e.g. "Alpha Cash"
 *   // cityStore.currencySymbol — e.g. "$"
 *   // cityStore.cityCoins      — coins for the active city (live)
 *   // cityStore.inactiveSummary — [{ label, currencySymbol, coins }] per idle lot
 */

import { useMemo } from 'react'
import { CITY_LOTS } from '../utils/EconomyEngine'

/**
 * Returns the CITY_LOTS entry for a given lot id, falling back to lot 0.
 * @param {number} lotId
 * @returns {import('../utils/EconomyEngine').CityLot}
 */
function resolveLot(lotId) {
  return CITY_LOTS.find(l => l.id === lotId) ?? CITY_LOTS[0]
}

/**
 * @typedef {Object} CityTycoonStore
 * @property {object}   activeLot        - CITY_LOTS definition for the active building
 * @property {string}   currencyLabel    - Human-readable currency name, e.g. "Alpha Cash"
 * @property {string}   currencySymbol   - Short symbol displayed next to coin amounts, e.g. "$"
 * @property {number}   cityCoins        - Live coin balance for the active city
 * @property {Array<{label:string, currencySymbol:string, coins:number}>} inactiveSummary
 *   - Snapshot coin balances for every owned-but-inactive lot (read from snapshots)
 */

/**
 * useCityTycoonStore — derives per-city metadata from GamePlayerPage's economy state.
 *
 * @param {{ activeBuildingIdx: number, buildings: Array, coins: number }} params
 * @returns {CityTycoonStore}
 */
export function useCityTycoonStore({ activeBuildingIdx, buildings, coins }) {
  return useMemo(() => {
    const activeBld    = Array.isArray(buildings) ? buildings[activeBuildingIdx] : null
    const activeLot    = resolveLot(activeBld?.lotId ?? 0)

    // Summarise idle buildings so the HUD can show e.g. "Beta Plaza: ฿1.2M"
    const inactiveSummary = Array.isArray(buildings)
      ? buildings
          .map((bld, i) => {
            if (i === activeBuildingIdx) return null
            const lot  = resolveLot(bld?.lotId ?? 0)
            const snap = bld?.snapshot
            return {
              label:          lot.label,
              currencySymbol: lot.currencySymbol,
              coins:          snap?.coins ?? 0,
            }
          })
          .filter(Boolean)
      : []

    return {
      activeLot,
      currencyLabel:   activeLot.currencyLabel  ?? 'Cash',
      currencySymbol:  activeLot.currencySymbol ?? '$',
      cityCoins:       coins,
      inactiveSummary,
    }
  }, [activeBuildingIdx, buildings, coins])
}
