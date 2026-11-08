import type { User } from '@/types'
import { ApiError } from './errors'
import { clone, simulateLatency, getStore } from './store'
import { validateOnboarding, type OnboardingDraft } from '@/utils/onboarding'

export type CompleteOnboardingInput = OnboardingDraft

/** User service. Mock now; each function maps 1:1 to a future HTTP route. */

export async function getUsers(): Promise<User[]> {
  await simulateLatency()
  return clone(getStore().users)
}

export async function getUserById(userId: string): Promise<User | null> {
  await simulateLatency()
  const user = getStore().users.find((u) => u.id === userId)
  return user ? clone(user) : null
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
  return clone(user)
}
