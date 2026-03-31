import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

/**
 * Firebase Auth helpers.
 *
 * signup(email, password) — creates a new Firebase user and returns the
 *   Firebase User object.
 *
 * login(email, password) — signs in an existing Firebase user and returns
 *   the Firebase User object.
 *
 * Both throw a Firebase AuthError on failure (e.g. auth/email-already-in-use,
 * auth/wrong-password) which callers can catch and display to the user.
 *
 * When Firebase is not configured (auth === null) both functions throw an
 * Error so callers receive a normal rejection instead of a cryptic crash.
 */
export function useAuth() {
  async function signup(email, password) {
    if (!auth) throw new Error('Firebase is not available. Please contact support.')
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    return user
  }

  async function login(email, password) {
    if (!auth) throw new Error('Firebase is not available. Please contact support.')
    const { user } = await signInWithEmailAndPassword(auth, email, password)
    return user
  }

  return { signup, login }
}
