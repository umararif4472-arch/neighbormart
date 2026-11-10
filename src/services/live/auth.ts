import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore/lite'
import type { User } from '@/types'
import { ApiError } from '../errors'
import { getDb, getFirebaseAuth } from '../firebase'
import { COLLECTIONS, stripUndefined } from './firestoreData'
import {
  LAHORE_CENTER,
  mergeOwnProfile,
  normalizePublicUser,
  writePrivateProfile,
} from './privateProfile'

/**
 * Live auth (Firebase Auth) — Google Sign-In + email/password fallback.
 *
 * A session is a Firebase Auth user; the app-facing `User` is the profile
 * document at users/{uid}, created on first login with the fields the
 * Phase 3 spec requires (name, photo, phone, location, verification
 * status). Session persistence is Firebase's own (IndexedDB) — the app
 * just observes it.
 */

/** No fixed demo user exists in live mode; kept for barrel shape parity. */
export const CURRENT_USER_ID = ''

/**
 * Read the profile doc, creating it on first login.
 *
 * Privacy split (Workstream C): the profile is stored in two docs —
 * display fields on the public users/{uid} doc, and phone / email /
 * blockedUserIds / homeLocation ONLY in users/{uid}/private/data.
 * The returned User is the merged own profile (private doc wins
 * per-field, legacy public fields are the fallback — see
 * privateProfile.ts).
 */
export async function ensureUserProfile(
  fbUser: FirebaseUser,
  nameOverride?: string,
): Promise<User> {
  const db = getDb()
  const ref = doc(db, COLLECTIONS.users, fbUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return mergeOwnProfile(db, fbUser.uid, {
      id: fbUser.uid,
      ...(snap.data() as Record<string, unknown>),
    })
  }

  const now = new Date().toISOString()
  // Public doc: display fields only. `showPhone` (Phase 5) is a
  // public visibility flag and stays here; the number itself is
  // private (below).
  const publicProfile = {
    name: nameOverride?.trim() || fbUser.displayName || fbUser.email?.split('@')[0] || 'Neighbor',
    avatarUrl: fbUser.photoURL ?? '',
    bio: '',
    city: '',
    neighborhood: '',
    joinedAt: now,
    phoneVerified: false,
    emailVerified: fbUser.emailVerified,
    idVerified: false,
    responseRate: 1,
    avgResponseMinutes: 60,
    stats: {
      successfulLends: 0,
      successfulBorrows: 0,
      salesCompleted: 0,
      rentalsHosted: 0,
      onTimeReturns: 0,
      lateReturns: 0,
    },
    badges: [],
    showPhone: false,
    // Phase 6: a brand-new profile starts with onboarding incomplete —
    // the sign-in flow routes the user through the 3-step setup.
    onboardingCompleted: false,
    interests: [],
  }
  // Private doc: no number yet (the user adds one from their profile);
  // the auth email — auth owns the canonical copy, this is the
  // contact copy; Lahore centre until onboarding sets the real area.
  const privateProfile = {
    phone: '',
    email: fbUser.email ?? '',
    blockedUserIds: [] as string[],
    homeLocation: LAHORE_CENTER,
  }
  await setDoc(ref, stripUndefined(publicProfile))
  await writePrivateProfile(db, fbUser.uid, privateProfile)
  // Both docs were just written by us — the merged profile is exactly
  // the two halves combined, no re-read needed.
  return {
    ...normalizePublicUser({ id: fbUser.uid, ...publicProfile }),
    ...privateProfile,
  }
}

/** Resolve the first auth-state emission (session restore on reload). */
function firstAuthUser(): Promise<FirebaseUser | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

export async function getSessionUser(): Promise<User> {
  const fbUser = await firstAuthUser()
  if (!fbUser) {
    throw new ApiError('forbidden', 'You are not signed in.')
  }
  return ensureUserProfile(fbUser)
}

function friendlyAuthError(error: unknown): ApiError {
  const code = (error as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new ApiError('invalid', 'That email or password doesn’t match an account.')
    case 'auth/email-already-in-use':
      return new ApiError('conflict', 'That email already has an account — try signing in.')
    case 'auth/weak-password':
      return new ApiError('invalid', 'Password needs at least 6 characters.')
    case 'auth/invalid-email':
      return new ApiError('invalid', 'That email address doesn’t look right.')
    case 'auth/popup-closed-by-user':
      return new ApiError('invalid', 'Sign-in was cancelled before it finished.')
    case 'auth/too-many-requests':
      return new ApiError('conflict', 'Too many attempts — wait a moment and try again.')
    default:
      return new ApiError('unknown', 'Sign-in failed. Check your connection and try again.')
  }
}

export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider())
    return await ensureUserProfile(result.user)
  } catch (error) {
    throw friendlyAuthError(error)
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    return await ensureUserProfile(result.user)
  } catch (error) {
    throw friendlyAuthError(error)
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  try {
    const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
    await updateProfile(result.user, { displayName: name.trim() })
    return await ensureUserProfile(result.user, name)
  } catch (error) {
    throw friendlyAuthError(error)
  }
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getFirebaseAuth())
}

/**
 * Observe session changes (sign-in / sign-out). The callback receives the
 * profile User, or null when signed out. Returns an unsubscribe function.
 */
export function onSessionChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (fbUser) => {
    if (!fbUser) {
      callback(null)
      return
    }
    void ensureUserProfile(fbUser)
      .then(callback)
      .catch(() => callback(null))
  })
}

/** Parity export with the mock auth module (unused by live callers). */
export function findUser(): never {
  throw new ApiError('unknown', 'findUser is a mock-store helper and is not available live.')
}
