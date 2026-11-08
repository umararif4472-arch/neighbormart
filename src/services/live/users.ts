import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore/lite'
import type { User } from '@/types'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs } from './firestoreData'
import { validateOnboarding, type OnboardingDraft } from '@/utils/onboarding'

export type CompleteOnboardingInput = OnboardingDraft

/** Live user service — public profile documents at users/{uid}. */

export async function getUsers(): Promise<User[]> {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.users))
  return fromDocs<User>(snap.docs)
}

export async function getUserById(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, userId))
  return fromDoc<User>(snap)
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
  return user
}
