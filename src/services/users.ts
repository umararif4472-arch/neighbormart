import type { User } from '@/types'
import { ApiError } from './errors'
import { clone, simulateLatency, getStore } from './store'
import { validateOnboarding, type OnboardingDraft } from '@/utils/onboarding'

export type CompleteOnboardingInput = OnboardingDraft

/** User service. Mock now; each function maps 1:1 to a future HTTP route. */

// ---------------------------------------------------------------------------
// Per-session user cache (Workstream A). Hot paths never download the
// whole users collection: they ask for the IDs actually on screen via
// getUsersByIds, and repeat renders are served from this Map. Mutations
// in this module refresh their own entry; invalidateUsersCache is the
// explicit escape hatch (profile updates, admin actions).
// ---------------------------------------------------------------------------
const userCache = new Map<string, User>()

export function primeUsersCache(users: readonly User[]): void {
  for (const user of users) userCache.set(user.id, clone(user))
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
  await simulateLatency()
  const users = clone(getStore().users)
  primeUsersCache(users)
  return users
}

export async function getUserById(userId: string): Promise<User | null> {
  const cached = userCache.get(userId)
  if (cached) return clone(cached)
  await simulateLatency()
  const user = getStore().users.find((u) => u.id === userId)
  if (!user) return null
  userCache.set(userId, clone(user))
  return clone(user)
}

/**
 * Fetch exactly the users for `ids` (deduped, order preserved, missing
 * ids omitted). Cached ids cost no fetch; the rest resolve in one pass
 * over the store — the live backend chunks this into documentId `in`
 * queries of ≤30.
 */
export async function getUsersByIds(ids: readonly string[]): Promise<User[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const missing = unique.filter((id) => !userCache.has(id))
  if (missing.length > 0) {
    await simulateLatency(60, 150)
    for (const id of missing) {
      const user = getStore().users.find((u) => u.id === id)
      if (user) userCache.set(id, clone(user))
    }
  }
  return unique
    .map((id) => userCache.get(id))
    .filter((u): u is User => u != null)
    .map((u) => clone(u))
}

/**
 * Contact preferences (Phase 5): the phone number other neighbors may
 * see, and whether it is shown at all. Only the account owner changes
 * their own prefs (the service checks the ids match).
 */
export async function updateContactPrefs(
  userId: string,
  actorId: string,
  prefs: { phone: string; showPhone: boolean },
): Promise<User> {
  await simulateLatency(150, 300)
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can change contact preferences.')
  }
  const user = getStore().users.find((u) => u.id === userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  const phone = prefs.phone.trim()
  if (prefs.showPhone && phone.replace(/\D/g, '').length < 7) {
    throw new ApiError('invalid', 'Add a valid phone number before showing it publicly.')
  }
  user.phone = phone
  user.showPhone = prefs.showPhone
  userCache.set(user.id, clone(user))
  return clone(user)
}

/**
 * Onboarding (Phase 6): save the 3-step setup onto the profile and mark
 * it complete. Owner-only; the same shared validators the page uses run
 * again here so a bad payload cannot slip past the UI.
 */
export async function completeOnboarding(
  userId: string,
  actorId: string,
  input: CompleteOnboardingInput,
): Promise<User> {
  await simulateLatency(150, 300)
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can complete their onboarding.')
  }
  const user = getStore().users.find((u) => u.id === userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  const errors = validateOnboarding(input)
  const firstError = Object.values(errors)[0]
  if (firstError) throw new ApiError('invalid', firstError)
  user.name = input.name.trim()
  user.avatarUrl = input.avatarUrl.trim()
  user.phone = input.phone.trim()
  user.city = input.city.trim()
  user.neighborhood = input.neighborhood.trim()
  user.interests = [...input.interests]
  user.onboardingCompleted = true
  userCache.set(user.id, clone(user))
  return clone(user)
}

/**
 * Blocking (Phase 8): hide a neighbor everywhere — their listings leave
 * browse/landing, and their profile shows as blocked. Owner-only.
 */
export async function setBlocked(
  userId: string,
  actorId: string,
  targetId: string,
  blocked: boolean,
): Promise<User> {
  await simulateLatency(120, 250)
  if (userId !== actorId) {
    throw new ApiError('forbidden', 'Only the account owner can manage their block list.')
  }
  if (targetId === userId) throw new ApiError('invalid', 'You cannot block yourself.')
  const user = getStore().users.find((u) => u.id === userId)
  if (!user) throw new ApiError('not-found', 'User not found.')
  const target = getStore().users.find((u) => u.id === targetId)
  if (!target) throw new ApiError('not-found', 'User to block not found.')
  const current = new Set(user.blockedUserIds ?? [])
  if (blocked) current.add(targetId)
  else current.delete(targetId)
  user.blockedUserIds = [...current]
  userCache.set(user.id, clone(user))
  return clone(user)
}
