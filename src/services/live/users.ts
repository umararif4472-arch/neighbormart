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
import { getDb, getFirebaseAuth } from '../firebase'
import { COLLECTIONS, fromDocs } from './firestoreData'
import {
  fetchPrivateProfile,
  mergePrivateProfile,
  normalizePublicUser,
  writePrivateProfile,
} from './privateProfile'
import { validateOnboarding, type OnboardingDraft } from '@/utils/onboarding'

export type CompleteOnboardingInput = OnboardingDraft

/**
 * Live user service — public profile documents at users/{uid}, with
 * the privacy split (Workstream C): phone, email, blockedUserIds and
 * the precise homeLocation live in users/{uid}/private/data (see
 * privateProfile.ts). Other users are read from the public doc ONLY;
 * the signed-in user's own profile is the public doc merged with
 * their private doc (private wins per-field, legacy public fields are
 * the per-field fallback for pre-migration users).
 */

// ---------------------------------------------------------------------------
// Per-session user cache (Workstream A) — same contract as the mock
// backend. Hot paths fetch ONLY the ids on screen via getUsersByIds
// (documentId `in` queries chunked at Firestore's 30-value limit);
// repeat renders never re-read a profile document.
// ---------------------------------------------------------------------------
const userCache = new Map<string, User>()

/** Ids whose cache entry is the MERGED own profile. A public-only
 *  entry for the signed-in user (e.g. primed by an admin user list
 *  before sign-in) must not satisfy an own-profile read — the private
 *  fields would be missing — so own reads refetch until merged. */
const mergedOwnIds = new Set<string>()

export function primeUsersCache(users: readonly User[]): void {
  for (const user of users) userCache.set(user.id, user)
}

export function invalidateUsersCache(ids?: readonly string[]): void {
  if (!ids) {
    userCache.clear()
    mergedOwnIds.clear()
    return
  }
  for (const id of ids) {
    userCache.delete(id)
    mergedOwnIds.delete(id)
  }
}

/** The signed-in user's uid, or null when there is no session (or
 *  Auth is unavailable). Own-vs-other decides the private merge. */
function currentUid(): string | null {
  try {
    return getFirebaseAuth().currentUser?.uid ?? null
  } catch {
    return null
  }
}

function isOwn(userId: string): boolean {
  return currentUid() === userId
}

/** Fresh-read one profile doc: public only for other users; merged
 *  with the private doc for the signed-in user. Null when missing. */
async function loadUser(userId: string): Promise<User | null> {
  const db = getDb()
  const snap = await getDoc(doc(db, COLLECTIONS.users, userId))
  if (!snap.exists()) return null
  const publicUser = normalizePublicUser({
    id: userId,
    ...(snap.data() as Record<string, unknown>),
  })
  if (!isOwn(userId)) return publicUser
  const merged = mergePrivateProfile(publicUser, await fetchPrivateProfile(db, userId))
  mergedOwnIds.add(userId)
  return merged
}

function cacheUser(user: User): void {
  userCache.set(user.id, user)
}

/**
 * @deprecated Whole-collection read kept ONLY for the admin panel.
 * Everything else uses getUsersByIds / getUserById (cached, scoped).
 * Entries are public-doc profiles; the signed-in user's own entry is
 * merged with their private doc like every other own read.
 */
export async function getUsers(): Promise<User[]> {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.users))
  const users = fromDocs<User>(snap.docs).map((u) =>
    normalizePublicUser(u as unknown as Record<string, unknown> & { id: string }),
  )
  const ownId = currentUid()
  if (ownId) {
    const idx = users.findIndex((u) => u.id === ownId)
    if (idx >= 0) {
      users[idx] = mergePrivateProfile(
        users[idx],
        await fetchPrivateProfile(getDb(), ownId),
      )
      mergedOwnIds.add(ownId)
    }
  }
  primeUsersCache(users)
  return users
}

export async function getUserById(userId: string): Promise<User | null> {
  const cached = userCache.get(userId)
  // A cached public-only entry is fine for other users, but the
  // signed-in user's own entry must be the merged profile.
  if (cached && (!isOwn(userId) || mergedOwnIds.has(userId))) return cached
  const user = await loadUser(userId)
  if (user) cacheUser(user)
  return user
}

/** Fetch exactly the users for `ids` (deduped, order preserved). */
export async function getUsersByIds(ids: readonly string[]): Promise<User[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const missing = unique.filter(
    (id) => !userCache.has(id) || (isOwn(id) && !mergedOwnIds.has(id)),
  )
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30)
    const snap = await getDocs(
      query(collection(getDb(), COLLECTIONS.users), where(documentId(), 'in', chunk)),
    )
    for (const raw of fromDocs<User>(snap.docs)) {
      cacheUser(
        normalizePublicUser(raw as unknown as Record<string, unknown> & { id: string }),
      )
    }
  }
  // The signed-in user's own entry merges its private doc (a single
  // extra read, only when their id was actually requested).
  const ownId = currentUid()
  if (ownId && unique.includes(ownId) && !mergedOwnIds.has(ownId)) {
    const merged = await loadUser(ownId)
    if (merged) cacheUser(merged)
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
  const db = getDb()
  // Privacy split: `showPhone` is a public visibility flag and stays
  // on the public doc; the number itself goes ONLY to the private doc.
  await updateDoc(doc(db, COLLECTIONS.users, userId), { showPhone: prefs.showPhone })
  await writePrivateProfile(db, userId, { phone })
  const user = await loadUser(userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  cacheUser(user)
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
  const db = getDb()
  // Public fields to the public doc; the phone (private) only to the
  // private doc.
  await updateDoc(doc(db, COLLECTIONS.users, userId), {
    name: input.name.trim(),
    avatarUrl: input.avatarUrl.trim(),
    city: input.city.trim(),
    neighborhood: input.neighborhood.trim(),
    interests: [...input.interests],
    onboardingCompleted: true,
  })
  await writePrivateProfile(db, userId, { phone: input.phone.trim() })
  const user = await loadUser(userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  cacheUser(user)
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
  // The block list is private: read it from the merged own profile
  // (private doc first, legacy public field as fallback) and write it
  // back ONLY to the private doc.
  const user = await loadUser(userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  const current = new Set(user.blockedUserIds ?? [])
  if (blocked) current.add(targetId)
  else current.delete(targetId)
  await writePrivateProfile(db, userId, { blockedUserIds: [...current] })
  const updated = { ...user, blockedUserIds: [...current] }
  cacheUser(updated)
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
