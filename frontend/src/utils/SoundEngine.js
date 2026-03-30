/**
 * SoundEngine.js  –  Lightweight audio utility for The Math Script.
 *
 * All audio objects are created lazily on first call so they don't block
 * page load.  Each function is safe to call even when the browser blocks
 * autoplay or when a URL is not yet configured.
 *
 * To swap in real sounds, replace the empty string '' next to each key with
 * a path like '/sounds/click.mp3' or a full URL.
 */

const SOUND_URLS = {
  click:    '',   // e.g. '/sounds/click.mp3'
  cast:     '',   // e.g. '/sounds/cast.mp3'
  hit:      '',   // e.g. '/sounds/hit.mp3'
  chaChing: '',   // e.g. '/sounds/cha-ching.mp3'
}

// Cache one Audio instance per key so repeated fast calls don't pile up
const _cache = {}

function _play(key) {
  try {
    const url = SOUND_URLS[key]
    if (!url) return           // placeholder — no-op until a URL is configured
    if (!_cache[key]) {
      _cache[key] = new Audio(url)
      _cache[key].volume = 0.55
    }
    const audio = _cache[key]
    // Rewind so rapid sequential calls each play from the start
    audio.currentTime = 0
    audio.play().catch(() => {}) // swallow autoplay-policy errors silently
  } catch {
    // Never let audio errors propagate to the UI
  }
}

/** Short click / tap feedback — wire to every standard button. */
export function playClick() {
  _play('click')
}

/** Spell-cast whoosh — fire when the player submits a correct answer. */
export function playCast() {
  _play('cast')
}

/** Impact hit — fire when the monster takes damage. */
export function playHit() {
  _play('hit')
}

/** Coin cha-ching — fire when a Tycoon upgrade is purchased. */
export function playChaChing() {
  _play('chaChing')
}
