import type { User } from '@/types'
import { ApiError } from './errors'
import { clone, findUser, simulateLatency, getStore } from './store'

/**
 * Mock auth. When a real backend arrives, swap these for session/JWT calls —
 * the component-facing surface stays identical.
 */

/** Who the prototype is "logged in" as. */
export const CURRENT_USER_ID = 'u-maya'

export async function getSessionUser(): Promise<User> {
  await simulateLatency(200, 400)
  const user = getStore().users.find((u) => u.id === CURRENT_USER_ID)
  if (!user) {
    throw new ApiError('unknown', 'No active session — could not load your profile.')
  }
  return clone(user)
}

// --- Auth surface parity with the live (Firebase) implementation --------
// In mock mode there is exactly one demo session (Maya), so every sign-in
// resolves to her and sign-out is a no-op. The live implementations in
// services/live/auth.ts perform real Firebase Auth.

export async function signInWithGoogle(): Promise<User> {
  return getSessionUser()
}

export async function signInWithEmail(_email: string, _password: string): Promise<User> {
  void _email
  void _password
  return getSessionUser()
}

export async function signUpWithEmail(
  _name: string,
  _email: string,
  _password: string,
): Promise<User> {
  void _name
  void _email
  void _password
  return getSessionUser()
}

export async function signOut(): Promise<void> {
  // Demo session is permanent in mock mode.
}

export function onSessionChange(_callback: (user: User | null) => void): () => void {
  void _callback
  return () => {}
}

// Re-exported for convenience so callers can do `authApi.CURRENT_USER_ID`.
export { findUser }
