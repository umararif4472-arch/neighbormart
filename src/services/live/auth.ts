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

const LAHORE_CENTER = { lat: 31.5204, lng: 74.3587 }

/** Read the profile doc, creating it on first login. */
export async function ensureUserProfile(
  fbUser: FirebaseUser,
  nameOverride?: string,
): Promise<User> {
  const db = getDb()
  const ref = doc(db, COLLECTIONS.users, fbUser.uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return { id: fbUser.uid, ...(snap.data() as Record<string, unknown>) } as unknown as User
  }

  const now = new Date().toISOString()
  const profile: User & { phone: string; email: string } = {
    id: fbUser.uid,
    name: nameOverride?.trim() || fbUser.displayName || fbUser.email?.split('@')[0] || 'Neighbor',
    avatarUrl: fbUser.photoURL ?? '',
    bio: '',
    city: '',
    neighborhood: '',
    homeLocation: LAHORE_CENTER,
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
    // Contact prefs (Phase 5): no number yet, and hidden by default —
    // the user opts in from their profile. `email` is stored alongside
    // the profile for contact purposes; auth owns the canonical copy.
    phone: '',
    showPhone: false,
    // Phase 6: a brand-new profile starts with onboarding incomplete —
    // the sign-in flow routes the user through the 3-step setup.
    onboardingCompleted: false,
    interests: [],
    email: fbUser.email ?? '',
  }
  const { id: _id, ...docData } = profile
  await setDoc(ref, stripUndefined(docData))
  return profile
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
