import type { User } from '@/types'

/**
 * Phase 6 onboarding — pure logic shared by the sign-in page (which
 * routes new users here), the onboarding page (step validators), and
 * both user services (which re-validate on save). No React, no I/O:
 * unit-tested directly.
 */

/** The three steps, in order. */
export const ONBOARDING_STEPS = ['About you', 'Where you are', 'Your interests'] as const

/** Interest chips offered on step 3 — the 4 sections + popular item categories. */
export const ONBOARDING_INTERESTS = [
  'Items & Tools',
  'Vehicles',
  'Properties',
  'Sports Arenas',
  'Tools',
  'Electronics',
  'Party & Events',
  'Outdoor & Camping',
  'Kitchen',
  'Kids & Baby',
] as const

/** Cities offered on step 2 (Lahore first — the launch city). */
export const ONBOARDING_CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
] as const

/** Lahore areas suggested on step 2 (matches the seed neighborhoods). */
export const LAHORE_AREAS = [
  'DHA Phase 5',
  'DHA Phase 1',
  'Gulberg',
  'Johar Town',
  'Model Town',
  'Bahria Town',
  'Wapda Town',
  'Cantt',
  'Gulshan-e-Ravi',
  'Valencia Town',
  'Township',
  'Allama Iqbal Town',
] as const

export interface OnboardingDraft {
  name: string
  avatarUrl: string
  phone: string
  city: string
  neighborhood: string
  interests: string[]
}

export type OnboardingErrors = Partial<
  Record<'name' | 'phone' | 'city' | 'neighborhood' | 'interests', string>
>

/** Prefill the draft from the signed-in profile. */
export function draftFromUser(user: User): OnboardingDraft {
  return {
    name: user.name ?? '',
    avatarUrl: user.avatarUrl ?? '',
    phone: user.phone ?? '',
    city: user.city ?? '',
    neighborhood: user.neighborhood ?? '',
    interests: user.interests ?? [],
  }
}

/**
 * Does this user still need onboarding? A profile counts as done when
 * it explicitly completed onboarding, OR when it predates the flag and
 * already has a city + area (every seed/demo profile). A brand-new
 * live profile is created with onboardingCompleted: false and an empty
 * city, so it is routed to setup on first sign-in.
 */
export function needsOnboarding(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.onboardingCompleted === true) return false
  if (user.onboardingCompleted === false) return true
  return !user.city?.trim() || !user.neighborhood?.trim()
}

/** Step 1: name required; photo URL optional; phone optional but must look dialable. */
export function validateAboutStep(draft: OnboardingDraft): OnboardingErrors {
  const errors: OnboardingErrors = {}
  if (draft.name.trim().length < 2) {
    errors.name = 'Add your name (at least 2 characters) — neighbors see this.'
  }
  const phoneDigits = draft.phone.replace(/\D/g, '')
  if (draft.phone.trim() && phoneDigits.length < 7) {
    errors.phone = 'That phone number looks too short — include the full number.'
  }
  return errors
}

/** Step 2: city + area are what make "near you" work, so both are required. */
export function validateLocationStep(draft: OnboardingDraft): OnboardingErrors {
  const errors: OnboardingErrors = {}
  if (!draft.city.trim()) errors.city = 'Pick your city.'
  if (draft.neighborhood.trim().length < 2) {
    errors.neighborhood = 'Add your area or neighborhood (e.g. Gulberg).'
  }
  return errors
}

/** Step 3: at least one interest, so recommendations have something to work with. */
export function validateInterestsStep(draft: OnboardingDraft): OnboardingErrors {
  const errors: OnboardingErrors = {}
  if (draft.interests.length === 0) {
    errors.interests = 'Pick at least one — you can change these later.'
  }
  return errors
}

export function validateOnboardingStep(
  stepIndex: number,
  draft: OnboardingDraft,
): OnboardingErrors {
  switch (stepIndex) {
    case 0:
      return validateAboutStep(draft)
    case 1:
      return validateLocationStep(draft)
    default:
      return validateInterestsStep(draft)
  }
}

/** All steps at once — the services run this again on save. */
export function validateOnboarding(draft: OnboardingDraft): OnboardingErrors {
  return {
    ...validateAboutStep(draft),
    ...validateLocationStep(draft),
    ...validateInterestsStep(draft),
  }
}

/** Session flag: "Skip for now" on onboarding lasts for this browser session. */
export const ONBOARDING_SKIP_KEY = 'neighbormart:onboarding-skipped'

export function onboardingSkippedThisSession(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

export function markOnboardingSkipped(): void {
  try {
    sessionStorage.setItem(ONBOARDING_SKIP_KEY, '1')
  } catch {
    // Private mode: skipping just won't be remembered.
  }
}
