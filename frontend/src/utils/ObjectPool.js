/**
 * ObjectPool.js
 *
 * Generic, framework-agnostic object pool for recycling short-lived visual
 * prefabs (floating text labels, coin particle descriptors, etc.) without
 * incurring garbage-collection pressure from repeated heap allocation and
 * destruction.
 *
 * ─── Design ──────────────────────────────────────────────────────────────────
 *
 * The pool maintains two lists:
 *   _free    – deactivated objects waiting to be reused
 *   _active  – objects currently in use by the caller
 *
 * On construction the pool calls `factory()` `initialSize` times so a full set
 * of objects is warm before the first frame is rendered.
 *
 * If `acquire()` is called when the free list is empty and `growable` is true
 * (the default), the pool creates one new object and logs a warning — bursts
 * beyond `initialSize` are handled gracefully without dropping emissions.
 * When `growable` is false, `acquire()` returns `null` and the caller should
 * skip the emission.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { ObjectPool } from './ObjectPool.js'
 *
 *   // Plain-object pool (e.g. for FloatingTextManager items):
 *   const pool = new ObjectPool(
 *     () => ({ text: '', x: 0, y: 0, opacity: 0 }),
 *     50,
 *   )
 *
 *   // Acquire an item, configure it, then return it when done:
 *   const item = pool.acquire()
 *   item.text = '+$5K'; item.x = 100; item.y = 200; item.opacity = 1
 *   // … later when the animation ends:
 *   pool.release(item)
 *
 *   // Phaser Text pool (call inside scene.create(), after `this` is a scene):
 *   const txtPool = new ObjectPool(
 *     () => scene.add.text(0, 0, '', style).setVisible(false),
 *     20,
 *   )
 *
 * ─── Contract ─────────────────────────────────────────────────────────────────
 *
 * • The pool does NOT reset object fields between uses.  The caller is
 *   responsible for setting all fields on the acquired object before use.
 * • `release()` is idempotent relative to duplicates: releasing an object that
 *   is not in the active list is silently ignored to avoid double-free crashes.
 * • The pool never destroys objects; the caller must destroy them on teardown
 *   by iterating `pool.all` and calling the appropriate destructor.
 */

export class ObjectPool {
  /**
   * @param {function(): object}  factory      – Creates one new pooled object.
   *                                             Called `initialSize` times at
   *                                             construction and again whenever
   *                                             the pool needs to grow.
   * @param {number}              [initialSize=50] – Number of objects to
   *                                             pre-allocate.
   * @param {object}              [opts]
   * @param {boolean}             [opts.growable=true]  – When true, the pool
   *                                             creates extra objects if all
   *                                             pre-allocated slots are active.
   *                                             When false, `acquire()` returns
   *                                             null on exhaustion.
   */
  constructor(factory, initialSize = 50, { growable = true } = {}) {
    if (typeof factory !== 'function') {
      throw new TypeError('ObjectPool: factory must be a function')
    }
    if (!Number.isInteger(initialSize) || initialSize < 1) {
      throw new RangeError('ObjectPool: initialSize must be a positive integer')
    }

    this._factory  = factory
    this._growable = growable

    /** @type {object[]} Objects currently in use by the caller. */
    this._active = []
    /** @type {object[]} Objects currently available for reuse. */
    this._free   = []

    // Pre-warm the pool
    for (let i = 0; i < initialSize; i++) {
      this._free.push(this._factory())
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Acquire an object from the pool.
   *
   * If a free object is available it is moved to the active list and returned.
   * If the pool is exhausted and `growable` is true, a new object is created
   * and returned (with a console warning).
   * If the pool is exhausted and `growable` is false, returns `null`.
   *
   * @returns {object|null}
   */
  acquire() {
    let obj
    if (this._free.length > 0) {
      obj = this._free.pop()
    } else if (this._growable) {
      // eslint-disable-next-line no-console
      console.warn(
        `ObjectPool: pool exhausted (${this._active.length} active); creating extra object. ` +
        'Consider increasing initialSize.',
      )
      obj = this._factory()
    } else {
      return null
    }

    this._active.push(obj)
    return obj
  }

  /**
   * Return an object to the pool so it can be reused.
   *
   * The object is removed from the active list and pushed onto the free list.
   * Silently ignored when the object is not currently tracked as active
   * (prevents double-free panics when `release()` is called from a tween
   * onComplete that fires after the scene shuts down).
   *
   * @param {object} obj – The object to release back to the pool.
   */
  release(obj) {
    const idx = this._active.indexOf(obj)
    if (idx === -1) return   // not tracked — ignore silently

    this._active.splice(idx, 1)
    this._free.push(obj)
  }

  /**
   * Number of objects currently checked out by the caller.
   * @returns {number}
   */
  get activeCount() {
    return this._active.length
  }

  /**
   * Number of objects currently waiting in the free list.
   * @returns {number}
   */
  get freeCount() {
    return this._free.length
  }

  /**
   * Total number of objects managed by this pool (active + free).
   * @returns {number}
   */
  get totalSize() {
    return this._active.length + this._free.length
  }

  /**
   * Iterable over every object managed by this pool (both active and free).
   * Use this at scene shutdown to call `destroy()` on all pooled Phaser objects.
   *
   * @returns {Iterable<object>}
   */
  get all() {
    return [...this._active, ...this._free]
  }
}
