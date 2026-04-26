/**
 * streak.js — localStorage-backed answer streak counter.
 *
 * Keys stored:
 *   ms_streak_count   (integer)
 *   ms_streak_date    (YYYY-MM-DD — last correct-answer date for display)
 */

const KEY_COUNT = 'ms_streak_count'
const KEY_DATE = 'ms_streak_date'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function read() {
  try {
    return {
      count: parseInt(localStorage.getItem(KEY_COUNT) || '0', 10) || 0,
      date: localStorage.getItem(KEY_DATE) || '',
    }
  } catch {
    return { count: 0, date: '' }
  }
}

function write(count) {
  try {
    localStorage.setItem(KEY_COUNT, String(count))
    localStorage.setItem(KEY_DATE, today())
  } catch { /* ignore */ }
}

/** Increment streak and return new count. */
export function incStreak() {
  const { count } = read()
  const next = count + 1
  write(next)
  return next
}

/** Reset streak to 0. */
export function resetStreak() {
  try {
    localStorage.setItem(KEY_COUNT, '0')
    localStorage.setItem(KEY_DATE, today())
  } catch { /* ignore */ }
  return 0
}

/** Read current streak count. */
export function getStreak() {
  return read().count
}
