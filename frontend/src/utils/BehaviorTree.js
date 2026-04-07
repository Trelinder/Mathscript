/**
 * BehaviorTree.js
 *
 * Core Behavior Tree data structures for NPC / worker AI.
 * Completely self-contained — no Phaser, no game-state imports.
 *
 * Node hierarchy:
 *
 *   BehaviorTree          – root wrapper; owns a single root node.
 *   ├── Sequence          – composite: runs children left-to-right;
 *   │                       returns FAILURE on first child failure,
 *   │                       returns RUNNING when a child is running,
 *   │                       returns SUCCESS only when all children succeed.
 *   ├── Selector          – composite: runs children left-to-right;
 *   │                       returns SUCCESS on first child success,
 *   │                       returns RUNNING when a child is running,
 *   │                       returns FAILURE only when all children fail.
 *   └── Action            – leaf node backed by a user-supplied tick function.
 *
 * Both Sequence and Selector use the "with memory" variant: after returning
 * RUNNING they resume from the same child on the next tick instead of
 * re-evaluating children from the start.
 *
 * Context object (`ctx`)
 * ──────────────────────
 * Each tick() call receives a plain mutable context object that nodes
 * read and write freely.  The tree itself never modifies it; all state
 * changes come from Action tick functions.
 *
 * Usage:
 *   import { Status, Action, Sequence, Selector, BehaviorTree } from './BehaviorTree.js'
 *
 *   const tree = new BehaviorTree(
 *     new Sequence('Root', [
 *       new Action('DoA', ctx => Status.SUCCESS),
 *       new Action('DoB', ctx => Status.RUNNING),
 *     ])
 *   )
 *   tree.tick(ctx) // → Status.RUNNING
 */

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * The three possible return values for any tree node's tick() call.
 * @readonly @enum {string}
 */
export const Status = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  RUNNING: 'RUNNING',
})

// ─── Action (leaf) ───────────────────────────────────────────────────────────

/**
 * A leaf node whose behaviour is provided by a caller-supplied function.
 *
 * @param {string}   name    Human-readable label (for debugging).
 * @param {Function} tickFn  (ctx) => Status — must return SUCCESS, FAILURE,
 *                            or RUNNING each tick.
 */
export class Action {
  constructor(name, tickFn) {
    this.name = name
    this._tickFn = tickFn
  }

  /**
   * Execute this action for one tick.
   * @param {object} ctx - Mutable context shared across the whole tree.
   * @returns {Status}
   */
  tick(ctx) {
    return this._tickFn(ctx)
  }

  /** Actions are stateless in the tree; reset is a no-op. */
  reset() {}
}

// ─── Sequence (AND-composite) ─────────────────────────────────────────────────

/**
 * Runs children left-to-right in order.
 *
 * Tick rules:
 *   - Returns FAILURE immediately when any child returns FAILURE.
 *   - Returns RUNNING when the current child returns RUNNING (remembers
 *     which child was running so the next tick resumes there).
 *   - Returns SUCCESS only after all children have returned SUCCESS.
 *
 * @param {string}  name     Human-readable label.
 * @param {Array}   children Array of child nodes (Action | Sequence | Selector).
 */
export class Sequence {
  constructor(name, children) {
    this.name = name
    this.children = children
    this._runningIdx = 0
  }

  /** @param {object} ctx @returns {Status} */
  tick(ctx) {
    for (let i = this._runningIdx; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx)

      if (status === Status.FAILURE) {
        this._runningIdx = 0
        return Status.FAILURE
      }

      if (status === Status.RUNNING) {
        this._runningIdx = i
        return Status.RUNNING
      }

      // Status.SUCCESS → advance to the next child
    }

    // All children succeeded
    this._runningIdx = 0
    return Status.SUCCESS
  }

  /** Reset this node and all children so the sequence can be replayed. */
  reset() {
    this._runningIdx = 0
    for (const child of this.children) child.reset?.()
  }
}

// ─── Selector (OR-composite) ──────────────────────────────────────────────────

/**
 * Runs children left-to-right in order.
 *
 * Tick rules:
 *   - Returns SUCCESS immediately when any child returns SUCCESS.
 *   - Returns RUNNING when the current child returns RUNNING (memory variant).
 *   - Returns FAILURE only after all children have returned FAILURE.
 *
 * @param {string}  name     Human-readable label.
 * @param {Array}   children Array of child nodes.
 */
export class Selector {
  constructor(name, children) {
    this.name = name
    this.children = children
    this._runningIdx = 0
  }

  /** @param {object} ctx @returns {Status} */
  tick(ctx) {
    for (let i = this._runningIdx; i < this.children.length; i++) {
      const status = this.children[i].tick(ctx)

      if (status === Status.SUCCESS) {
        this._runningIdx = 0
        return Status.SUCCESS
      }

      if (status === Status.RUNNING) {
        this._runningIdx = i
        return Status.RUNNING
      }

      // Status.FAILURE → try the next child
    }

    // All children failed
    this._runningIdx = 0
    return Status.FAILURE
  }

  /** Reset this node and all children. */
  reset() {
    this._runningIdx = 0
    for (const child of this.children) child.reset?.()
  }
}

// ─── PrioritySelector (preemptive OR-composite) ───────────────────────────────

/**
 * A Selector that ALWAYS re-evaluates from child 0 on every tick (no memory).
 *
 * Use this when a higher-priority branch must be able to preempt lower-priority
 * branches that are currently RUNNING.  Lower-priority children (e.g. Sequences)
 * keep their own internal `_runningIdx` so they resume correctly when the
 * high-priority branch finishes and control returns to them.
 *
 * Tick rules (same as Selector, minus the memory):
 *   - Evaluates children left-to-right every tick from child 0.
 *   - Returns SUCCESS/RUNNING immediately on first child that succeeds/runs.
 *   - Returns FAILURE only after all children have returned FAILURE.
 *
 * @param {string}  name     Human-readable label.
 * @param {Array}   children Array of child nodes (lower index = higher priority).
 */
export class PrioritySelector {
  constructor(name, children) {
    this.name = name
    this.children = children
  }

  /** @param {object} ctx @returns {Status} */
  tick(ctx) {
    for (const child of this.children) {
      const status = child.tick(ctx)
      if (status === Status.SUCCESS) return Status.SUCCESS
      if (status === Status.RUNNING) return Status.RUNNING
      // Status.FAILURE → try next child
    }
    return Status.FAILURE
  }

  /** Reset all children so every branch can restart cleanly. */
  reset() {
    for (const child of this.children) child.reset?.()
  }
}

// ─── BehaviorTree (root wrapper) ─────────────────────────────────────────────

/**
 * Thin wrapper around the root node that provides a stable public API.
 * One instance should be created per NPC worker.
 *
 * @param {Sequence|Selector|PrioritySelector|Action} root - The root node of the tree.
 */
export class BehaviorTree {
  constructor(root) {
    this._root = root
  }

  /**
   * Advance the tree by one tick.
   *
   * @param {object} ctx - Worker context; read and mutated by Action nodes.
   * @returns {Status}
   */
  tick(ctx) {
    return this._root.tick(ctx)
  }

  /**
   * Reset the tree so it can be ticked again from the beginning.
   * Call this after the root returns SUCCESS or FAILURE.
   */
  reset() {
    this._root.reset?.()
  }
}
