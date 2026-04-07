/**
 * UplinkTechTree.js — Uplink tech-tree nodes for the secondary-resource system.
 *
 * Power (⚡) and Maintenance (⚙) are sub-currencies that accumulate passively
 * from the Power Generator and Server/IT infrastructure room levels respectively.
 * Each UPLINK_NODE costs a fixed amount of Power + Maintenance to unlock and
 * permanently boosts one pipeline parameter.
 *
 * ─── Integration notes ────────────────────────────────────────────────────────
 *  GamePlayerPage.jsx owns the live `powerRes`, `maintRes`, and
 *  `unlockedUplinkNodes` state.  computeUplinkEffects() is called inside the
 *  master tick and compiler cycle to apply the aggregate multipliers.
 *
 *  IsoTycoonScene subscribes to 'sim:secondary-resources' to draw fill bars on
 *  the Power Generator and Server/IT infra-room sprites, and shows the current
 *  Uplink level on the HR / Scheduling room label.
 */

/**
 * All tech-tree nodes in unlock order (displayed left → right in the Uplink
 * panel).  Each node has a unique `id`, a human-readable `label`, an emoji
 * `icon`, a `cost` in { power, maint } sub-currency units, and a single
 * pipeline `effect`.
 *
 * effect.type legend:
 *   'rcps_mult'  — multiplied into every floor's RC/s output          (≥ 1.0)
 *   'bus_mult'   — multiplied into elevator transfer capacity per trip (≥ 1.0)
 *   'conv_mult'  — multiplied into the compiler coin-conversion rate   (≥ 1.0)
 *   'proc_speedup' — fraction shaved off compiler processing time      (≥ 0.0)
 */
export const UPLINK_NODES = [
  {
    id:     'u:power-amp',
    label:  'Power Amplifier',
    desc:   '+10% raw-code output on every production floor',
    icon:   '⚡',
    cost:   { power: 10, maint: 0  },
    effect: { type: 'rcps_mult',  value: 0.10 },
  },
  {
    id:     'u:maint-opt',
    label:  'Maint Optimizer',
    desc:   '+10% elevator transfer capacity per trip',
    icon:   '⚙️',
    cost:   { power: 0,  maint: 10 },
    effect: { type: 'bus_mult',   value: 0.10 },
  },
  {
    id:     'u:grid-bridge',
    label:  'Grid Bridge',
    desc:   '+10% coin conversion rate in the compiler',
    icon:   '🔗',
    cost:   { power: 15, maint: 15 },
    effect: { type: 'conv_mult',  value: 0.10 },
  },
  {
    id:     'u:power-surge',
    label:  'Power Surge',
    desc:   '+20% raw-code output on every production floor',
    icon:   '🔋',
    cost:   { power: 30, maint: 10 },
    effect: { type: 'rcps_mult',  value: 0.20 },
  },
  {
    id:     'u:deep-sync',
    label:  'Deep Sync',
    desc:   '−20% compiler processing time',
    icon:   '📡',
    cost:   { power: 20, maint: 30 },
    effect: { type: 'proc_speedup', value: 0.20 },
  },
]

/**
 * O(1) lookup map: nodeId → UPLINK_NODE entry.
 * @type {Map<string, {id:string, label:string, desc:string, icon:string, cost:{power:number,maint:number}, effect:{type:string,value:number}}>}
 */
export const UPLINK_NODES_MAP = new Map(UPLINK_NODES.map(n => [n.id, n]))

/**
 * Integer count of unlocked nodes — shown in the UI as "UPLINK 0", "UPLINK 3",
 * etc.  Mirrors "UPLINK 0.0" from the legacy flat UI.
 *
 * @param {string[]} unlockedNodeIds  Array of unlocked node IDs.
 * @returns {number}
 */
export function computeUplinkLevel(unlockedNodeIds) {
  return Array.isArray(unlockedNodeIds) ? unlockedNodeIds.length : 0
}

/**
 * Aggregate pipeline multipliers granted by the currently unlocked nodes.
 *
 * rcpsMult    — multiply into floor RCPS (1.0 = no boost)
 * busMult     — multiply into bus transfer capacity per trip (1.0 = no boost)
 * convMult    — multiply into compiler conv rate (1.0 = no boost)
 * procSpeedup — fraction removed from compiler procTime, capped at 0.80
 *               (e.g. 0.20 = 20% faster cycles; 0.0 = no speedup)
 *
 * @param {string[]} unlockedNodeIds
 * @returns {{ rcpsMult: number, busMult: number, convMult: number, procSpeedup: number }}
 */
export function computeUplinkEffects(unlockedNodeIds) {
  const ids = Array.isArray(unlockedNodeIds) ? unlockedNodeIds : []
  let rcpsMult = 1, busMult = 1, convMult = 1, procSpeedup = 0
  for (const id of ids) {
    const node = UPLINK_NODES_MAP.get(id)
    if (!node) continue
    switch (node.effect.type) {
      case 'rcps_mult': rcpsMult  *= (1 + node.effect.value); break
      case 'bus_mult':  busMult   *= (1 + node.effect.value); break
      case 'conv_mult': convMult  *= (1 + node.effect.value); break
      case 'proc_speedup': procSpeedup = Math.min(0.80, procSpeedup + node.effect.value); break
      default: break
    }
  }
  return { rcpsMult, busMult, convMult, procSpeedup }
}
