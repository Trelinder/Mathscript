/**
 * GameEventBus.js — Synchronous event bus for the MathScript Tycoon pipeline.
 *
 * Decouples the core economy state machine (React, GamePlayerPage.jsx) from
 * the rendering engine (Phaser, IsoTycoonScene.js).  The React layer emits
 * events; the Phaser layer subscribes to them without either side holding a
 * direct reference to the other.
 *
 * ─── Events emitted by GamePlayerPage.jsx (simulation → renderer) ─────────────
 *
 *  'floor:progress'  { floorId: string, progress: number }   0.0 – 1.0 float
 *    Fired on every animation frame tick while a floor is producing.
 *    Drives the character animation state machine in IsoTycoonScene.
 *
 *  'floor:cycle'     { floorId: string, earned: number }
 *    Fired once per completed production cycle (progress reached 1.0).
 *    Triggers the floating currency particle effect anchored to the desk.
 *
 *  'floor:upgraded'  { floorId: string, newLevel: number }
 *    Fired after a successful upgrade purchase (after the construction delay).
 *    Triggers the workstation texture tier swap in IsoTycoonScene.
 *
 *  'floor:construction:start'  { floorId: string, newLevel: number, duration: number }
 *    Fired immediately after the upgrade cost is deducted (before the level
 *    is applied to the economy).  Instructs IsoTycoonScene to spawn the
 *    Construction prefab at the workstation grid position and start the
 *    visual countdown timer.  The React layer owns the authoritative timer
 *    via setTimeout; the renderer's countdown is purely cosmetic.
 *
 * ─── Simulation-state sync events (React → renderer, replaces Phaser registry) ─
 *
 *  'sim:floor-bins'  { bins: Array<{id, outputBin, level}> }
 *    Emitted whenever floor state changes.  Replaces registry key 'floorBins'.
 *
 *  'sim:bus-capacity'  { capacity: number }
 *    Emitted whenever the Data Bus capacity is upgraded.
 *    Replaces registry key 'busCapacity'.
 *
 *  'sim:managers'  { floorIds: string[] }
 *    Emitted whenever the hired-floor-managers list changes.
 *    Replaces registry key 'hiredFloorManagers'.
 *
 *  'sim:skill-state'  { elevatorIsHired, elevatorSkillActiveUntil,
 *                       elevatorSkillCooldownUntil, salesIsHired,
 *                       salesSkillActiveUntil, salesSkillCooldownUntil }
 *    Emitted when any manager skill timestamp changes.
 *    Replaces registry key 'skillState'.
 *
 *  'sim:infra-levels'  { power: number, server: number, hr: number }
 *    Emitted whenever infrastructure room levels change.
 *    Replaces registry key 'infraRoomLevels'.
 *
 *  'sim:pets'  { petIds: string[] }
 *    Emitted whenever the active-pets list changes.
 *    Replaces registry key 'activePets'.
 *
 *  'sim:manager-frenzy'  { active: boolean }
 *    Emitted when a floor-manager Frenzy skill activates or expires.
 *    Replaces registry keys 'managerFrenzyActive'.
 *
 *  'sim:refactor-fx'  {}
 *    Emitted once per Prime Refactor trigger to fire the camera shockwave FX.
 *    Replaces registry key 'triggerRefactorFX'.
 *
 *  'sim:sell-company'  {}
 *    Emitted when the player confirms a prestige (sell-company) reset.
 *    Replaces registry key 'triggerSellCompany'.
 *
 *  'sim:secondary-resources'  { power: number, maint: number, uplinkLevel: number }
 *    Emitted by GamePlayerPage whenever the Power ⚡ or Maintenance ⚙
 *    secondary-resource pool values change, or when an Uplink tech-tree node
 *    is unlocked.
 *      power       – Current Power pool value (0..POWER_POOL_MAX = 100).
 *      maint       – Current Maintenance pool value (0..MAINT_POOL_MAX = 100).
 *      uplinkLevel – Integer count of unlocked Uplink nodes (0..5).
 *    IsoTycoonScene subscribes to update fill bars on the Power Generator and
 *    Server/IT infra-room sprites, and to show the Uplink level on the HR room.
 *
 * ─── UI / input events (renderer → React) ────────────────────────────────────
 *
 *  'ui:notify'  { icon?: string, title: string, body?: string,
 *                 color?: string, duration?: number }
 *    Fired by any layer (React callbacks, Phaser scene, setTimeout closures)
 *    to show a transient toast notification.  ToastNotification.jsx subscribes
 *    to this event and manages the visible queue automatically.
 *      icon     – Leading emoji or short symbol (optional).
 *      title    – Bold headline (Orbitron, uppercase).
 *      body     – Supporting copy (Rajdhani, optional).
 *      color    – CSS accent colour for the left border + glow (default #60a5fa).
 *      duration – Lifetime in ms before auto-dismiss (default 4000, max 8000).
 *
 *  'ui:hire-manager'  { type: 'floor' | 'elevator' | 'sales', floorId?: string }
 *    Fired by IsoTycoonScene when the player taps a diegetic hire-manager badge
 *    on a floor workstation (type = 'floor', floorId = the floor's id string)
 *    or a sector-manager prop when no manager is yet hired (type = 'elevator'
 *    or 'sales').  GamePlayerPage responds by opening the manager hire modal.
 *
 *  'ui:activate-skill'  { type: string }
 *    Fired by IsoTycoonScene when the player taps a diegetic boost prop.
 *    Replaces the 'onActivateSkill' registry callback.
 *
 *  'ui:infra-room-click'  { roomId: string }
 *    Fired by IsoTycoonScene when the player taps an infrastructure room sprite.
 *    Replaces the 'onInfraRoomClick' registry callback.
 *
 *  'ui:analogy-milestone'  { conceptId: string, event: string }
 *    Fired by PlayScene when a Math Analogy milestone is reached and the
 *    scene is about to pause.  Replaces the 'onAnalogyMilestone' registry
 *    callback.
 *
 * ─── Render-state events (renderer → React) ──────────────────────────────────
 *
 *  'render:scene-ready'  {}
 *    Fired by each Phaser scene (IsoTycoonScene, PlayScene) at the end of
 *    create().  React responds by emitting all current sim: state events so
 *    the scene can initialise its visuals without reading from the registry.
 *
 *  'render:workstation-pos'  { id: string, normX: number, normY: number }
 *    Fired by IsoTycoonScene for each workstation after it is spawned.
 *    Provides the workstation's canvas position in normalised [0,1] space so
 *    the React overlay can anchor upgrade popups without raw canvas-pixel math.
 *    Replaces the 'wsScreenPos_<id>' registry values.
 */

const _listeners = new Map()

/**
 * Subscribe to an event.
 * @param {string}   event   - Event name (e.g. 'floor:progress')
 * @param {Function} handler - Callback invoked with the event payload
 * @returns {Function} Unsubscribe function — call it to remove the listener
 */
export function on(event, handler) {
  if (!_listeners.has(event)) _listeners.set(event, new Set())
  _listeners.get(event).add(handler)
  return () => off(event, handler)
}

/**
 * Unsubscribe a previously registered handler.
 * @param {string}   event
 * @param {Function} handler
 */
export function off(event, handler) {
  _listeners.get(event)?.delete(handler)
}

/**
 * Emit an event synchronously to all registered handlers.
 * @param {string} event
 * @param {*}      payload
 */
export function emit(event, payload) {
  _listeners.get(event)?.forEach(fn => fn(payload))
}

/**
 * Remove ALL handlers for every event.
 * Useful in test teardown or when the game is fully reset.
 */
export function clear() {
  _listeners.clear()
}