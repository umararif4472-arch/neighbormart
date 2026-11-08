import type {
  ISODateString,
  Review,
  TrustHistory,
  TrustScoreResult,
  TrustTierName,
  User,
} from '@/types'
import { daysBetween } from './dates'

/**
 * Trust tiers and their thresholds. Trust is the currency of this app —
 * these definitions drive badges, colors, and copy across the UI.
 */
export interface TrustTier {
  name: TrustTierName
  minScore: number
  emoji: string
  description: string
}

export const TRUST_TIERS: readonly TrustTier[] = [
  {
    name: 'New Neighbor',
    minScore: 0,
    emoji: '🌱',
    description: 'Just joined — everyone starts here. First on-time return levels you up.',
  },
  {
    name: 'Reliable',
    minScore: 25,
    emoji: '🤝',
    description: 'Has completed borrows and shows up as promised.',
  },
  {
    name: 'Trusted',
    minScore: 50,
    emoji: '⭐',
    description: 'Consistent, on-time, and well reviewed by the block.',
  },
  {
    name: 'Community Pillar',
    minScore: 75,
    emoji: '🌳',
    description: 'The neighbor every street wishes it had. Lends early, returns on time.',
  },
]

/**
 * How the score is built — max total 100. THE ACTUAL FORMULA (the /trust
 * explainer renders these same numbers):
 *
 *   1. On-time return rate  ×  40 pts, scaled by volume
 *        rate = onTimeReturns / totalReturns (a no-return history is neutral,
 *        not zero — see onTimeRatePoints)
 *        volume = min(totalReturns, 8) / 8   (full weight at 8 returns)
 *        points = 40 × rate × volume
 *        A LATE RETURN is the only thing that can subtract: it lowers the
 *        rate AND the volume still grows — on-time vs late visibly differs.
 *   2. Reviews: 25 pts — count (cap 10) × average rating / 5.
 *   3. Verified profile: 10 pts (5 phone + 5 email).
 *   4. Account age: 10 pts (~1 pt per 73 days, full at ~2 years).
 *   5. Responsiveness: 15 pts × response rate.
 */
export const TRUST_WEIGHTS = {
  ON_TIME_MAX: 40,
  ON_TIME_VOLUME_FULL_AT: 8, // returns needed for full volume weight
  REVIEWS_MAX: 25,
  REVIEWS_COUNTED_MAX: 10, // only the 10 most recent count
  VERIFICATION_MAX: 10, // 5 per verified field (phone/email)
  PER_VERIFIED_FIELD: 5,
  ACCOUNT_AGE_MAX: 10,
  ACCOUNT_AGE_DAYS_PER_POINT: 73, // full marks at ~2 years
  RESPONSIVENESS_MAX: 15,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Points from on-time returns. Rate-based (not just a count): every late
 * return drags the rate down while the volume keeps climbing, so an
 * on-time return and a late return produce clearly different scores.
 * Users with zero returns yet are neutral (0) — not punished.
 */
export function onTimeRatePoints(onTimeReturns: number, totalReturns: number): number {
  if (totalReturns <= 0) return 0
  const rate = clamp(onTimeReturns / totalReturns, 0, 1)
  const volume = clamp(totalReturns / TRUST_WEIGHTS.ON_TIME_VOLUME_FULL_AT, 0, 1)
  return Math.round(TRUST_WEIGHTS.ON_TIME_MAX * rate * volume)
}

/**
 * The core business logic of the app: turn a user's history into a
 * 0–100 trust score plus tier.
 *
 * PURE — no I/O, no clocks created internally, deterministic for a given
 * input. Trivially testable and safe to call from render.
 */
export function calculateTrustScore(history: TrustHistory): TrustScoreResult {
  // 1. On-time return rate — the backbone of trust.
  const onTimeReturns = onTimeRatePoints(history.onTimeReturns, history.totalReturns)

  // 2. Reviews — count (capped) scaled by average rating.
  const reviewsReceived = history.reviewsReceived
  const reviewCount = Math.min(reviewsReceived.length, TRUST_WEIGHTS.REVIEWS_COUNTED_MAX)
  const rawAvg = reviewsReceived.length
    ? reviewsReceived.reduce((sum, r) => sum + clamp(r.rating, 1, 5), 0) / reviewsReceived.length
    : 0
  const avgRating = clamp(rawAvg, 0, 5)
  const reviews = Math.round(
    (reviewCount / TRUST_WEIGHTS.REVIEWS_COUNTED_MAX) * (avgRating / 5) * TRUST_WEIGHTS.REVIEWS_MAX,
  )

  // 3. Verified profile info.
  const verification =
    (history.phoneVerified ? TRUST_WEIGHTS.PER_VERIFIED_FIELD : 0) +
    (history.emailVerified ? TRUST_WEIGHTS.PER_VERIFIED_FIELD : 0)

  // 4. Account age — slowly earned, slowly maxed.
  const accountAge = Math.min(
    Math.round(history.accountAgeDays / TRUST_WEIGHTS.ACCOUNT_AGE_DAYS_PER_POINT),
    TRUST_WEIGHTS.ACCOUNT_AGE_MAX,
  )

  // 5. Responsiveness — do you answer your neighbors?
  const responsiveness = Math.round(
    clamp(history.responseRate, 0, 1) * TRUST_WEIGHTS.RESPONSIVENESS_MAX,
  )

  const total = clamp(onTimeReturns + reviews + verification + accountAge + responsiveness, 0, 100)

  return {
    total,
    tierName: tierForScore(total).name,
    breakdown: { onTimeReturns, reviews, verification, accountAge, responsiveness },
  }
}

/** Resolve the tier a score lands in (scores are clamped to 0–100). */
export function tierForScore(score: number): TrustTier {
  const clamped = clamp(score, 0, 100)
  let tier = TRUST_TIERS[0]
  for (const candidate of TRUST_TIERS) {
    if (clamped >= candidate.minScore) tier = candidate
  }
  return tier
}

/** Look up a full tier definition by name. */
export function tierByName(name: TrustTierName): TrustTier {
  return TRUST_TIERS.find((t) => t.name === name) ?? TRUST_TIERS[0]
}

/**
 * Assemble a TrustHistory from app data. `now` is a parameter (with a
 * default) so callers and tests stay deterministic.
 */
export function buildTrustHistory(
  user: User,
  reviewsReceived: readonly Review[],
  now: ISODateString = new Date().toISOString(),
): TrustHistory {
  return {
    onTimeReturns: user.stats.onTimeReturns,
    totalReturns: user.stats.onTimeReturns + user.stats.lateReturns,
    reviewsReceived: reviewsReceived.map((r) => ({ rating: r.rating })),
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    accountAgeDays: Math.max(0, daysBetween(user.joinedAt, now)),
    responseRate: user.responseRate,
  }
}
