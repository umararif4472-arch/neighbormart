import { describe, expect, it } from 'vitest'
import type { User } from '@/types'
import {
  draftFromUser,
  needsOnboarding,
  validateAboutStep,
  validateInterestsStep,
  validateLocationStep,
  validateOnboarding,
  type OnboardingDraft,
} from './onboarding'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-test',
    name: 'Test Neighbor',
    avatarUrl: '',
    bio: '',
    city: 'Lahore',
    neighborhood: 'Gulberg',
    homeLocation: { lat: 31.5, lng: 74.35 },
    joinedAt: '2026-01-01T00:00:00.000Z',
    phone: '+92 300 1234567',
    showPhone: false,
    phoneVerified: false,
    emailVerified: true,
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
    ...overrides,
  }
}

const GOOD_DRAFT: OnboardingDraft = {
  name: 'Ayesha Khan',
  avatarUrl: '',
  phone: '+92 300 1234567',
  city: 'Lahore',
  neighborhood: 'Gulberg',
  interests: ['Vehicles'],
}

describe('needsOnboarding', () => {
  it('is false for no user', () => {
    expect(needsOnboarding(null)).toBe(false)
    expect(needsOnboarding(undefined)).toBe(false)
  })

  it('is true for a brand-new live profile (flag false, empty city)', () => {
    expect(
      needsOnboarding(makeUser({ onboardingCompleted: false, city: '', neighborhood: '' })),
    ).toBe(true)
  })

  it('is true when the flag is explicitly false even with a city set', () => {
    expect(needsOnboarding(makeUser({ onboardingCompleted: false }))).toBe(true)
  })

  it('is false once onboarding completed, even if fields were later cleared', () => {
    expect(
      needsOnboarding(makeUser({ onboardingCompleted: true, city: '', neighborhood: '' })),
    ).toBe(false)
  })

  it('treats seed profiles (no flag, city + area present) as done', () => {
    expect(needsOnboarding(makeUser())).toBe(false)
  })

  it('treats a flagless profile without a city as not done', () => {
    expect(needsOnboarding(makeUser({ city: '' }))).toBe(true)
    expect(needsOnboarding(makeUser({ neighborhood: '' }))).toBe(true)
  })
})

describe('onboarding validators', () => {
  it('accepts a complete draft', () => {
    expect(validateOnboarding(GOOD_DRAFT)).toEqual({})
  })

  it('requires a 2+ character name on step 1', () => {
    expect(validateAboutStep({ ...GOOD_DRAFT, name: 'A' }).name).toBeTruthy()
    expect(validateAboutStep({ ...GOOD_DRAFT, name: 'Al' }).name).toBeUndefined()
  })

  it('allows an empty phone but rejects a too-short one', () => {
    expect(validateAboutStep({ ...GOOD_DRAFT, phone: '' }).phone).toBeUndefined()
    expect(validateAboutStep({ ...GOOD_DRAFT, phone: '123' }).phone).toBeTruthy()
  })

  it('requires city and area on step 2', () => {
    const errors = validateLocationStep({ ...GOOD_DRAFT, city: '', neighborhood: '' })
    expect(errors.city).toBeTruthy()
    expect(errors.neighborhood).toBeTruthy()
  })

  it('requires at least one interest on step 3', () => {
    expect(validateInterestsStep({ ...GOOD_DRAFT, interests: [] }).interests).toBeTruthy()
    expect(validateInterestsStep(GOOD_DRAFT).interests).toBeUndefined()
  })
})

describe('draftFromUser', () => {
  it('prefills from the profile, tolerating missing optional fields', () => {
    const draft = draftFromUser(
      makeUser({ interests: ['Tools'], onboardingCompleted: undefined, phone: '' }),
    )
    expect(draft).toMatchObject({
      name: 'Test Neighbor',
      city: 'Lahore',
      neighborhood: 'Gulberg',
      interests: ['Tools'],
      phone: '',
    })
  })
})
