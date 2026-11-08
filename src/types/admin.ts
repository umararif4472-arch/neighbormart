import type { ISODateString } from './common'
import type { ListingSection } from './listing'

/**
 * Phase 9 admin panel types. Admin power comes from `role: 'admin'` on
 * the user profile (set only via scripts/grant-admin.mjs or by another
 * admin through the rules-guarded branch) — never from the client.
 */

export interface AdminStats {
  totalUsers: number
  totalListings: number
  activeListings: number
  listingsBySection: Record<ListingSection, number>
  /** Requests currently approved or out with a neighbor. */
  activeDeals: number
  signupsThisWeek: number
  /** Signups per day, oldest first, for the last 7 days. */
  signupsByDay: number[]
  openReports: number
  totalAdmins: number
}

export type AuditAction =
  | 'report-dismissed'
  | 'listing-removed'
  | 'user-warned'
  | 'user-suspended'
  | 'user-unsuspended'
  | 'user-deleted'
  | 'listing-status'
  | 'listing-featured'
  | 'listing-unfeatured'
  | 'admin-added'
  | 'admin-removed'

export interface AuditEntry {
  id: string
  adminId: string
  action: AuditAction
  targetType: 'listing' | 'user' | 'report'
  targetId: string
  detail: string
  createdAt: ISODateString
}
