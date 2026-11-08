import type { ISODateString } from './common'

/** The role the REVIEWER played in the borrow that produced this review. */
export type ReviewerRole = 'lender' | 'borrower'

export interface Review {
  id: string
  requestId: string
  listingId: string
  reviewerId: string
  revieweeId: string
  reviewerRole: ReviewerRole
  /** 1–5 stars. */
  rating: number
  comment: string
  createdAt: ISODateString
}
