import type { ISODateString } from './common'

/**
 * Request lifecycle statuses (see utils/requestLifecycle.ts for the machine):
 *
 *   pending → approved → active → returned → reviewed
 *   pending → declined (terminal)
 *   active  → *overdue* (derived at display time, never stored)
 *
 * "returned" is a real stored status (item back; one or both reviews
 * outstanding). "overdue" is derived from active + past dueAt so it flips
 * live without writes. "reviewed" is terminal once BOTH parties reviewed.
 */
export type RequestStatus =
  | 'pending' // sent by borrower, awaiting the lender's decision
  | 'approved' // lender said yes; pickup not yet confirmed
  | 'active' // picked up; return pending
  | 'returned' // returned; one or both reviews still outstanding
  | 'reviewed' // returned AND both parties reviewed (terminal)
  | 'declined' // lender said no (terminal)
  | 'cancelled' // borrower withdrew before approval (terminal)

/** What the UI should display: stored status plus the derived "overdue". */
export type EffectiveRequestStatus = RequestStatus | 'overdue'

/** Calendar stamps (local midnight, no "Z") — see types/common.ts. */
export interface BorrowPeriod {
  start: ISODateString
  end: ISODateString
}

export interface BorrowRequest {
  id: string
  listingId: string
  borrowerId: string
  /**
   * The lender is listing.ownerId. Deliberately NOT stored on the request
   * so ownership can never drift out of sync with the listing.
   */
  period: BorrowPeriod
  /** Free-text note from the borrower to the lender. */
  note: string
  status: RequestStatus
  createdAt: ISODateString
  /** When the lender approved or declined. */
  respondedAt: ISODateString | null
  /** Return deadline once approved/active (equals period.end). */
  dueAt: ISODateString | null
  /** When the item was actually returned. */
  returnedAt: ISODateString | null
  /** Set when a participant reports a problem (never returned, damaged…). */
  issue?: IssueReport | null
}

/**
 * Escalation record for problem borrows (e.g. an overdue item that never
 * came back). Reporting doesn't change the lifecycle status — it flags the
 * request and notifies the other party.
 */
export interface IssueReport {
  reportedBy: string
  /** Short reason, from a fixed list the UI offers. */
  reason: string
  note: string
  reportedAt: ISODateString
}
