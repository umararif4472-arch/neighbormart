import { describe, expect, it } from 'vitest'
import type { User } from '@/types'
import { LAHORE_CENTER, mergePrivateProfile, normalizePublicUser } from './privateProfile'

/**
 * Privacy split (Workstream C) — the pure merge/normalize half.
 * Firestore I/O is exercised by the live E2E, not unit tests.
 */

const basePublic = {
  id: 'u-1',
  name: 'Test Neighbor',
  avatarUrl: '',
  bio: '',
  city: 'Lahore',
  neighborhood: 'Gulberg',
  joinedAt: '2026-01-01T00:00:00.000Z',
  showPhone: true,
  phoneVerified: true,
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
} as unknown as Record<string, unknown> & { id: string }

function publicWithLegacy(): User {
  return normalizePublicUser({
    ...basePublic,
    phone: '+92 300 0000000',
    email: 'legacy@example.com',
    blockedUserIds: ['u-old'],
    homeLocation: { lat: 31.1, lng: 74.1 },
  })
}

describe('normalizePublicUser', () => {
  it('fills safe defaults when the migrated public doc has no private fields', () => {
    const user = normalizePublicUser({ ...basePublic })
    expect(user.phone).toBe('')
    expect(user.blockedUserIds).toEqual([])
    expect(user.homeLocation).toEqual(LAHORE_CENTER)
    // Public fields pass through untouched.
    expect(user.showPhone).toBe(true)
    expect(user.neighborhood).toBe('Gulberg')
  })

  it('keeps legacy public fields as the fallback values', () => {
    const user = publicWithLegacy()
    expect(user.phone).toBe('+92 300 0000000')
    expect(user.email).toBe('legacy@example.com')
    expect(user.blockedUserIds).toEqual(['u-old'])
    expect(user.homeLocation).toEqual({ lat: 31.1, lng: 74.1 })
  })
})

describe('mergePrivateProfile', () => {
  it('private doc wins per-field', () => {
    const merged = mergePrivateProfile(publicWithLegacy(), {
      phone: '+92 321 9999999',
      email: 'private@example.com',
      blockedUserIds: ['u-a', 'u-b'],
      homeLocation: { lat: 31.9, lng: 74.9 },
    })
    expect(merged.phone).toBe('+92 321 9999999')
    expect(merged.email).toBe('private@example.com')
    expect(merged.blockedUserIds).toEqual(['u-a', 'u-b'])
    expect(merged.homeLocation).toEqual({ lat: 31.9, lng: 74.9 })
  })

  it('falls back per-field to the legacy public copy when the private doc is partial', () => {
    const merged = mergePrivateProfile(publicWithLegacy(), { phone: '+92 321 1111111' })
    expect(merged.phone).toBe('+92 321 1111111')
    expect(merged.email).toBe('legacy@example.com')
    expect(merged.blockedUserIds).toEqual(['u-old'])
    expect(merged.homeLocation).toEqual({ lat: 31.1, lng: 74.1 })
  })

  it('a missing private doc returns the public profile unchanged', () => {
    const pub = publicWithLegacy()
    expect(mergePrivateProfile(pub, null)).toBe(pub)
  })

  it('an empty-string phone in the private doc still wins (field present)', () => {
    const merged = mergePrivateProfile(publicWithLegacy(), { phone: '' })
    expect(merged.phone).toBe('')
  })
})
