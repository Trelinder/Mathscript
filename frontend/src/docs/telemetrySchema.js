/**
 * telemetrySchema.js — Centralized telemetry payload audit file.
 *
 * PURPOSE
 * ───────
 * Every asynchronous JSON payload sent to the Azure backend (for ingestion
 * by the Phi-4 logic engine) is documented here in one place.  Before
 * approving any Pull Request that adds or modifies a telemetry call, the
 * reviewer must verify that the actual payload matches the schema below.
 *
 * HOW TO USE
 * ──────────
 * This file is NOT imported at runtime.  It is a living design document.
 *
 * 1. When adding a new telemetry event, add its schema here first, get it
 *    reviewed, then implement it in the component.
 * 2. When changing an existing payload, update this file in the same PR.
 * 3. The backend Pydantic models in backend/main.py are the source of truth
 *    for server-side validation; this file is the source of truth for the
 *    client-side intent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ENDPOINT REGISTRY
 * ─────────────────
 *
 *   POST /api/concrete-packers/telemetry   → ConcretePackersSchema
 *   POST /api/potion-alchemists/telemetry  → PotionAlchemistsSchema
 *   POST /api/client-telemetry             → ClientTelemetrySchema (pre-existing)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONCRETE PACKERS  (POST /api/concrete-packers/telemetry)
//    Mini-game: drag-and-drop addition / place-value (age 5-7)
//    Feature flag: CONCRETE_PACKERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event types:
 *   "drag_start"      — child picks up a block from the cargo yard
 *   "drag_cancel"     — child drops block outside a valid slot
 *   "slot_occupied"   — child tries to drop onto an already-filled belt slot
 *   "block_placed"    — block successfully placed into a belt slot
 *   "fuse_to_crate"   — 10 belt slots filled; blocks fuse into a 10-Crate
 *   "puzzle_complete" — all blocks placed; puzzle solved
 *   "reset"           — child hits the Reset button
 */
export const ConcretePackersSchema = {
  // Required on every event
  event_type:     'string   // "drag_start"|"drag_cancel"|"slot_occupied"|"block_placed"|"fuse_to_crate"|"puzzle_complete"|"reset"',
  session_id:     'string   // "sess_abc123"',
  equation:       'string   // "8 + 4"',
  correct_answer: 'integer  // 12',
  placed_count:   'integer  // blocks placed so far (0 to total)',
  elapsed_ms:     'integer  // ms since puzzle load',
  timestamp:      'integer  // unix epoch ms (Date.now())',

  // Present on drag_start, drag_cancel, slot_occupied, block_placed
  block_id:       'string?  // e.g. "blk-3"',

  // Present on block_placed, slot_occupied
  slot_index:     'integer? // 0-9 (belt position)',

  // Present on block_placed
  belt_after:     'Array<string|null>? // 10-element snapshot after placement',

  // Present on fuse_to_crate
  crate_number:       'integer? // 1-indexed count of crates formed',
  placed_count_after: 'integer? // placed_count immediately after fuse',

  // Present on puzzle_complete
  crate_count:    'integer? // total 10-Crates formed',
}

/**
 * Phi-4 signals from Concrete Packers:
 *   - drag_start -> block_placed time per slot: one-to-one correspondence speed
 *   - drag_cancel count: motor hesitation / spatial reasoning difficulty
 *   - Time to first fuse_to_crate: place-value comprehension onset
 *   - Total elapsed_ms at puzzle_complete: overall addition fluency
 */

// ─────────────────────────────────────────────────────────────────────────────
// 2. POTION ALCHEMISTS  (POST /api/potion-alchemists/telemetry)
//    Mini-game: fraction equivalence / liquid volume (age 8-13)
//    Feature flag: POTION_ALCHEMISTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event types:
 *   "pour"            — child clicks a measuring cup; liquid added to beaker
 *   "overfill"        — total poured exceeds 1 (beaker overflows)
 *   "beaker_emptied"  — child empties the beaker and starts over
 *   "puzzle_complete" — beaker reaches target fraction exactly
 */
export const PotionAlchemistsSchema = {
  // Required on every event
  event_type:      'string   // "pour"|"overfill"|"beaker_emptied"|"puzzle_complete"',
  session_id:      'string   // "sess_abc123"',
  puzzle_index:    'integer  // 0-based index into PUZZLES array',
  target_fraction: 'string   // "3/4"',
  current_fill:    'string   // fraction string before this event, e.g. "1/2"',
  elapsed_ms:      'integer  // ms since this puzzle loaded',
  timestamp:       'integer  // unix epoch ms',

  // Present on pour
  cup_poured:   'string?  // "quarter"|"third"|"half"|"two_thirds"|"three_quarters"',
  cup_fraction: 'string?  // "1/4"',
  fill_after:   'string?  // fraction string after pour, e.g. "3/4"',

  // Present on overfill
  overfill_amount: 'string?  // fraction total that triggered overflow, e.g. "5/4"',

  // Present on puzzle_complete
  pours_taken:  'integer?  // total cup pours taken to solve',
  pour_history: 'Array<{cup: string, fraction: string}>? // ordered pour log',

  // Present on beaker_emptied
  pours_wasted: 'integer?  // pours discarded by the empty action',
}

/**
 * Phi-4 signals from Potion Alchemists:
 *   - overfill / puzzle_complete ratio: over-estimation tendency
 *   - beaker_emptied count per puzzle: strategy-reset frequency
 *   - pours_taken on puzzle_complete: denominator intuition efficiency
 *   - pour_history sequence: small-to-large vs large-to-small preference
 */

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLIENT TELEMETRY  (POST /api/client-telemetry)  [pre-existing]
//    General web-vitals, client errors, unhandled rejections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accepted event_type values (others are silently ignored by the server):
 *   "web_vital"            — Core Web Vital measurement
 *   "client_error"         — window.onerror caught exception
 *   "unhandled_rejection"  — unhandledrejection event
 */
export const ClientTelemetrySchema = {
  event_type:  'string   // "web_vital"|"client_error"|"unhandled_rejection"',
  session_id:  'string?',
  page:        'string?  // window.location.pathname',
  user_agent:  'string?',
  timestamp:   'integer?',
  payload:     'Record<string, any>?  // up to 10 keys, each value truncated to 200 chars',
}
