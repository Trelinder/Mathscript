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
 */
export function useAuth() {
  async function signup(email, password) {
    const { user } = await createUserWithEmailAndPassword(auth, email, password)
    return user
  }

  async function login(email, password) {
    const { user } = await signInWithEmailAndPassword(auth, email, password)
    return user
  }

  return { signup, login }
}
