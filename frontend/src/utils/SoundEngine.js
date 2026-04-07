/**
 * SoundEngine.js  –  Lightweight audio utility for The Math Script.
 *
 * Uses the Web Audio API so multiple sounds can play concurrently (e.g. several
 * floors completing their work cycle at the same time).  Each play call also
 * applies a small random pitch and volume jitter so repeated clips never feel
 * monotonous.
 *
 * To swap in real sounds, replace the empty string '' next to each key with a
 * path such as '/sounds/click.mp3' or a full URL.  An empty URL is a no-op —
 * the game continues without any error.  Any fetch/decode failure is also
 * swallowed silently so a missing file can never crash the game logic.
 */

// ─── Sound catalogue ──────────────────────────────────────────────────────────
// Per-key config: url (empty = disabled), base volume, and the ± pitch/volume
// jitter fraction applied on every play call.

const SOUNDS = {
  click:    { url: '', vol: 0.55, pitchJitter: 0.05, volJitter: 0.10 },
  cast:     { url: '', vol: 0.55, pitchJitter: 0.04, volJitter: 0.08 },
  hit:      { url: '', vol: 0.55, pitchJitter: 0.06, volJitter: 0.12 },
  chaChing: { url: '', vol: 0.60, pitchJitter: 0.03, volJitter: 0.08 },
  // NPC work-cycle complete / floating coin particle burst
  coin:     { url: '', vol: 0.45, pitchJitter: 0.08, volJitter: 0.15 },
  // Floor / infra-room upgrade finalised
  upgrade:  { url: '', vol: 0.65, pitchJitter: 0.02, volJitter: 0.06 },
}

// ─── Web Audio context (shared, lazily created) ───────────────────────────────

let _ctx = null

function _getCtx() {
  if (_ctx) return _ctx
  try {
    _ctx = new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    _ctx = null
  }
  return _ctx
}

// ─── AudioBuffer cache ────────────────────────────────────────────────────────
// A Promise<AudioBuffer|null> per key is stored immediately to prevent parallel
// fetches when the same sound is triggered multiple times before it has loaded.

const _bufferPromises = {}

function _fetchBuffer(key, url) {
  if (_bufferPromises[key]) return _bufferPromises[key]
  _bufferPromises[key] = (async () => {
    const ctx = _getCtx()
    if (!ctx) return null
    const res = await fetch(url)
    const arr = await res.arrayBuffer()
    return ctx.decodeAudioData(arr)
  })().catch(() => null)  // any fetch/decode failure → null → silent no-op
  return _bufferPromises[key]
}

// ─── Core play routine ────────────────────────────────────────────────────────

function _play(key) {
  try {
    const cfg = SOUNDS[key]
    if (!cfg?.url) return   // no URL configured — silent no-op

    const ctx = _getCtx()
    if (!ctx) return

    _fetchBuffer(key, cfg.url).then(buf => {
      if (!buf) return

      // GainNode for volume jitter
      const gain = ctx.createGain()
      const volMult = 1 + (Math.random() - 0.5) * cfg.volJitter
      gain.gain.value = cfg.vol * volMult
      gain.connect(ctx.destination)

      // BufferSourceNode — a new node is required per play call, which is what
      // enables true concurrent playback (multiple simultaneous instances).
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = 1 + (Math.random() - 0.5) * cfg.pitchJitter
      src.connect(gain)
      src.start(0)
    }).catch(() => {})
  } catch {
    // Never let audio errors propagate to the UI or game loop.
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Short click / tap feedback — wire to every standard button. */
export function playClick()    { _play('click')    }

/** Spell-cast whoosh — fire when the player submits a correct answer. */
export function playCast()     { _play('cast')     }

/** Impact hit — fire when the monster takes damage. */
export function playHit()      { _play('hit')      }

/** Coin cha-ching — fire when a Tycoon upgrade is purchased. */
export function playChaChing() { _play('chaChing') }

/** Soft coin pop — fire on NPC task completion / floating money particle. */
export function playCoin()     { _play('coin')     }

/** Ascending chime — fire when a floor or infra-room upgrade is finalised. */
export function playUpgrade()  { _play('upgrade')  }
