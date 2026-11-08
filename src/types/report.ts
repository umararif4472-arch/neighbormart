import type { ISODateString } from './common'

/** Why a listing or user was reported (Phase 8 moderation queue). */
export type ReportReason = 'scam' | 'fake' | 'inappropriate' | 'spam' | 'safety' | 'other'

export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string }> = [
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'fake', label: 'Fake listing / not as described' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Something else' },
]

export type ReportTargetType = 'listing' | 'user'
export type ReportStatus = 'open' | 'dismissed' | 'actioned'

/**
 * One moderation report. Stored in the `reports` collection alongside
 * the older borrow-issue records (kind: 'borrow-issue'); general
 * reports carry kind 'listing' | 'user' in the same field shape the
 * Firestore rules already expect (reportedBy + status + createdAt).
 */
export interface Report {
  id: string
  kind: ReportTargetType | 'borrow-issue'
  targetId: string
  /** For listings: the listing owner's id. For users: the user id. */
  targetOwnerId: string
  reportedBy: string
  reason: ReportReason | string
  details: string
  status: ReportStatus
  createdAt: ISODateString
}
