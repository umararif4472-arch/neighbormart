import type { ISODateString, LatLng } from './common'

/** Trust tier names, ordered from lowest to highest reputation. */
export type TrustTierName = 'New Neighbor' | 'Reliable' | 'Trusted' | 'Community Pillar'

/** Point contributions per trust factor; they sum to the 0–100 total. */
export interface TrustBreakdown {
  onTimeReturns: number
  reviews: number
  completedDeals: number
  verification: number
  accountAge: number
  responsiveness: number
}

/** Result of running the trust score calculation over a user's history. */
export interface TrustScoreResult {
  total: number // 0–100
  tierName: TrustTierName
  breakdown: TrustBreakdown
}

/**
 * The inputs the (pure) trust score calculation needs — deliberately
 * decoupled from the User model so `calculateTrustScore` can be unit
 * tested without building user objects.
 */
export interface TrustHistory {
  /** Returns the user completed on time (as a borrower). */
  onTimeReturns: number
  /** ALL completed returns, on-time + late — the denominator of the rate. */
  totalReturns: number
  /** Ratings (1–5) other people left about this user, in either role. */
  reviewsReceived: ReadonlyArray<{ rating: number }>
  phoneVerified: boolean
  emailVerified: boolean
  /** Government/CNIC-style ID check — the strongest verification signal. */
  idVerified: boolean
  /**
   * Deals the user completed in ANY role: borrows returned, lends
   * completed, items sold, rentals hosted. Sellers and renters build
   * trust through deals, not only through returns.
   */
  completedDeals: number
  /** Days since the user joined. */
  accountAgeDays: number
  /** Share of messages/requests the user responded to, 0–1. */
  responseRate: number
}

/** Milestone achievements shown on the profile. */
export interface UserBadge {
  id: string
  label: string
  description: string
  emoji: string
  earnedAt: ISODateString
}

/** Deal counters kept up to date by the service layer. */
export interface UserStats {
  successfulLends: number
  successfulBorrows: number
  /** Deals completed as the seller. */
  salesCompleted: number
  /** Deals completed as the owner of a rented listing (car, room, arena…). */
  rentalsHosted: number
  onTimeReturns: number
  lateReturns: number
}

export interface User {
  id: string
  name: string
  avatarUrl: string
  bio: string
  /** City the user is based in (listings inherit it on publish). */
  city: string
  neighborhood: string
  homeLocation: LatLng
  joinedAt: ISODateString
  phoneVerified: boolean
  emailVerified: boolean
  idVerified: boolean
  /** 0–1 */
  responseRate: number
  /** Average response time in minutes ("typically replies in ~45 min"). */
  avgResponseMinutes: number
  stats: UserStats
  badges: UserBadge[]
}
