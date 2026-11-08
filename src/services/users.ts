import type { User } from '@/types'
import { ApiError } from './errors'
import { clone, simulateLatency, getStore } from './store'

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
