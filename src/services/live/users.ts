import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore/lite'
import type { User } from '@/types'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs } from './firestoreData'
import { validateOnboarding, type OnboardingDraft } from '@/utils/onboarding'

export type CompleteOnboardingInput = OnboardingDraft

/** Live user service — public profile documents at users/{uid}. */

// ---------------------------------------------------------------------------
// Per-session user cache (Workstream A) — same contract as the mock
// backend. Hot paths fetch ONLY the ids on screen via getUsersByIds
// (documentId `in` queries chunked at Firestore's 30-value limit);
// repeat renders never re-read a profile document.
// ---------------------------------------------------------------------------
const userCache = new Map<string, User>()

export function primeUsersCache(users: readonly User[]): void {
  for (const user of users) userCache.set(user.id, user)
}

export function invalidateUsersCache(ids?: readonly string[]): void {
  if (!ids) {
    userCache.clear()
    return
  }
  for (const id of ids) userCache.delete(id)
}

/**
 * @deprecated Whole-collection read kept ONLY for the admin panel.
 * Everything else uses getUsersByIds / getUserById (cached, scoped).
 */
export async function getUsers(): Promise<User[]> {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.users))
  const users = fromDocs<User>(snap.docs)
  primeUsersCache(users)
  return users
}

export async function getUserById(userId: string): Promise<User | null> {
  const cached = userCache.get(userId)
  if (cached) return cached
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, userId))
  const user = fromDoc<User>(snap)
  if (user) userCache.set(userId, user)
  return user
}

/** Fetch exactly the users for `ids` (deduped, order preserved). */
export async function getUsersByIds(ids: readonly string[]): Promise<User[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const missing = unique.filter((id) => !userCache.has(id))
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30)
    const snap = await getDocs(
      query(collection(getDb(), COLLECTIONS.users), where(documentId(), 'in', chunk)),
    )
    for (const user of fromDocs<User>(snap.docs)) userCache.set(user.id, user)
  }
  return unique
    .map((id) => userCache.get(id))
    .filter((u): u is User => u != null)
}

/** Contact preferences (Phase 5) — owner-only, enforced here and by rules. */
export async function updateContactPrefs(
  userId: string,
  actorId: string,
  prefs: { phone: string; showPhone: boolean },
): Promise<User> {
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can change contact preferences.')
  }
  const phone = prefs.phone.trim()
  if (prefs.showPhone && phone.replace(/\D/g, '').length < 7) {
    throw new ApiError('invalid', 'Add a valid phone number before showing it publicly.')
  }
  const ref = doc(getDb(), COLLECTIONS.users, userId)
  await updateDoc(ref, { phone, showPhone: prefs.showPhone })
  const snap = await getDoc(ref)
  const user = fromDoc<User>(snap)
  if (!user) throw new ApiError('not-found', 'User not found.')
  userCache.set(user.id, user)
  return user
}

/** Onboarding (Phase 6) — owner-only save, shared validators re-run here. */
export async function completeOnboarding(
  userId: string,
  actorId: string,
  input: CompleteOnboardingInput,
): Promise<User> {
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can complete their onboarding.')
  }
  const errors = validateOnboarding(input)
  const firstError = Object.values(errors)[0]
  if (firstError) throw new ApiError('invalid', firstError)
  const ref = doc(getDb(), COLLECTIONS.users, userId)
  await updateDoc(ref, {
    name: input.name.trim(),
    avatarUrl: input.avatarUrl.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    neighborhood: input.neighborhood.trim(),
    interests: [...input.interests],
    onboardingCompleted: true,
  })
  const snap = await getDoc(ref)
  const user = fromDoc<User>(snap)
  if (!user) throw new ApiError('not-found', 'User not found.')
  userCache.set(user.id, user)
  return user
}

/** Blocking (Phase 8) — owner-only, mirrored by Firestore rules. */
export async function setBlocked(
  userId: string,
  actorId: string,
  targetId: string,
  blocked: boolean,
): Promise<User> {
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can manage their block list.')
  }
  if (targetId === userId) throw new ApiError('invalid', 'You cannot block yourself.')
  const db = getDb()
  const ref = doc(db, COLLECTIONS.users, userId)
  const snap = await getDoc(ref)
  const user = fromDoc<User>(snap)
  if (!user) throw new ApiError('not-found', 'User not found.')
  const current = new Set(user.blockedUserIds ?? [])
  if (blocked) current.add(targetId)
  else current.delete(targetId)
  await updateDoc(ref, { blockedUserIds: [...current] })
  const updated = { ...user, blockedUserIds: [...current] }
  userCache.set(user.id, updated)
  return updated
}

/** Phase 9: suspended accounts cannot post, message or book (live). */
export async function assertNotSuspendedLive(userId: string): Promise<void> {
  const user = await getUserById(userId)
  if (user?.suspended) {
    throw new ApiError(
      'forbidden',
      'Your account is suspended, so this action is paused. Contact the NeighborMart team if you think this is a mistake.',
    )
  }
}
