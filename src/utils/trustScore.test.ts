import { describe, expect, it } from 'vitest'
import type { Review, User } from '@/types'
import {
  buildTrustHistory,
  calculateTrustScore,
  onTimeRatePoints,
  tierForScore,
  TRUST_TIERS,
  TRUST_WEIGHTS,
} from './trustScore'

const NOW = '2026-09-05T12:00:00.000Z'

function history(overrides: Partial<Parameters<typeof calculateTrustScore>[0]> = {}) {
  return {
    onTimeReturns: 0,
    totalReturns: 0,
    reviewsReceived: [],
    phoneVerified: false,
    emailVerified: false,
    accountAgeDays: 0,
    responseRate: 0,
    ...overrides,
  }
}

describe('onTimeRatePoints (rate x volume)', () => {
  it('is neutral for a user with zero returns — not punished', () => {
    expect(onTimeRatePoints(0, 0)).toBe(0)
  })

  it('gives full 40 pts at 8/8 on-time returns', () => {
    expect(onTimeRatePoints(8, 8)).toBe(TRUST_WEIGHTS.ON_TIME_MAX)
  })

  it('scales with volume below the full-weight threshold', () => {
    expect(onTimeRatePoints(2, 2)).toBe(10) // 40 x 1 x (2/8)
  })

  it('a LATE RETURN VISIBLY REDUCES the points — the on-time vs late demo', () => {
    const allOnTime = onTimeRatePoints(8, 8) // 40
    const twoLate = onTimeRatePoints(6, 8) // 40 x (6/8) x 1 = 30
    expect(allOnTime - twoLate).toBe(10)
    expect(onTimeRatePoints(3, 3)).toBeGreaterThan(onTimeRatePoints(2, 3))
  })

  it('caps at 40 even for many returns', () => {
    expect(onTimeRatePoints(50, 50)).toBe(TRUST_WEIGHTS.ON_TIME_MAX)
  })
})

describe('calculateTrustScore', () => {
  it('returns 0 / New Neighbor for a brand-new user', () => {
    const result = calculateTrustScore(history())
    expect(result.total).toBe(0)
    expect(result.tierName).toBe('New Neighbor')
  })

  it('reaches 100 / Community Pillar for a maxed-out history', () => {
    const result = calculateTrustScore(
      history({
        onTimeReturns: 8,
        totalReturns: 8,
        reviewsReceived: Array.from({ length: 10 }, () => ({ rating: 5 })),
        phoneVerified: true,
        emailVerified: true,
        accountAgeDays: 730,
        responseRate: 1,
      }),
    )
    expect(result.total).toBe(100)
    expect(result.tierName).toBe('Community Pillar')
  })

  it('same borrow count, one late vs all on-time → visibly different totals', () => {
    const onTime = calculateTrustScore(history({ onTimeReturns: 5, totalReturns: 5 }))
    const oneLate = calculateTrustScore(history({ onTimeReturns: 4, totalReturns: 5 }))
    expect(onTime.total - oneLate.total).toBeGreaterThanOrEqual(5)
  })

  it('reviews scale by average rating', () => {
    const perfect = calculateTrustScore(
      history({ reviewsReceived: Array.from({ length: 10 }, () => ({ rating: 5 })) }),
    )
    const mediocre = calculateTrustScore(
      history({ reviewsReceived: Array.from({ length: 10 }, () => ({ rating: 3 })) }),
    )
    expect(perfect.breakdown.reviews).toBe(25)
    expect(mediocre.breakdown.reviews).toBe(15)
  })

  it('weights verification, age, and responsiveness to their caps', () => {
    const result = calculateTrustScore(
      history({ phoneVerified: true, emailVerified: true, accountAgeDays: 800, responseRate: 1 }),
    )
    expect(result.breakdown.verification).toBe(10)
    expect(result.breakdown.accountAge).toBe(10)
    expect(result.breakdown.responsiveness).toBe(15)
  })
})

describe('tierForScore', () => {
  it('lands on boundaries inclusively', () => {
    expect(tierForScore(0).name).toBe('New Neighbor')
    expect(tierForScore(24).name).toBe('New Neighbor')
    expect(tierForScore(25).name).toBe('Reliable')
    expect(tierForScore(49).name).toBe('Reliable')
    expect(tierForScore(50).name).toBe('Trusted')
    expect(tierForScore(74).name).toBe('Trusted')
    expect(tierForScore(75).name).toBe('Community Pillar')
    expect(tierForScore(100).name).toBe('Community Pillar')
  })

  it('exposes all four tiers in order', () => {
    expect(TRUST_TIERS.map((t) => t.name)).toEqual([
      'New Neighbor',
      'Reliable',
      'Trusted',
      'Community Pillar',
    ])
  })
})

describe('buildTrustHistory', () => {
  const user: User = {
    id: 'u-test',
    name: 'Test Neighbor',
    avatarUrl: '',
    bio: '',
    neighborhood: '',
    homeLocation: { lat: 0, lng: 0 },
    joinedAt: '2025-09-05',
    phoneVerified: true,
    emailVerified: false,
    responseRate: 0.8,
    avgResponseMinutes: 30,
    stats: { successfulLends: 1, successfulBorrows: 4, onTimeReturns: 3, lateReturns: 1 },
    badges: [],
  }

  const reviews: Review[] = [
    {
      id: 'r1',
      requestId: 'q',
      itemId: 'i',
      reviewerId: 'a',
      revieweeId: 'u-test',
      reviewerRole: 'lender',
      rating: 5,
      comment: '',
      createdAt: NOW,
    },
  ]

  it('derives totalReturns as on-time + late (the rate denominator)', () => {
    const derived = buildTrustHistory(user, reviews, NOW)
    expect(derived.onTimeReturns).toBe(3)
    expect(derived.totalReturns).toBe(4)
    expect(derived.accountAgeDays).toBe(365)
  })

  it('never returns a negative account age', () => {
    const future = { ...user, joinedAt: '2027-01-01' }
    expect(buildTrustHistory(future, [], NOW).accountAgeDays).toBe(0)
  })
})
