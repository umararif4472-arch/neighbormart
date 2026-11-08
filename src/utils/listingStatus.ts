import type { ListingStatus } from '@/types'

/**
 * The listing status machine. A pure transition table so the mock service
 * (today), Firestore rules / Cloud Functions (Phase 3), and the owner
 * dashboard (Phase 5) all enforce exactly the same moves:
 *
 *   active   → reserved | rented | sold | paused | removed
 *   reserved → active | rented | sold | removed
 *   rented   → active | removed          (returned, or taken down)
 *   sold     → removed                   (sold is terminal except cleanup)
 *   paused   → active | removed
 *   removed  → —                         (terminal)
 */
export const LISTING_STATUS_TRANSITIONS: Readonly<Record<ListingStatus, readonly ListingStatus[]>> =
  {
    active: ['reserved', 'rented', 'sold', 'paused', 'removed'],
    reserved: ['active', 'rented', 'sold', 'removed'],
    rented: ['active', 'removed'],
    sold: ['removed'],
    paused: ['active', 'removed'],
    removed: [],
  }

export function canTransitionListingStatus(from: ListingStatus, to: ListingStatus): boolean {
  if (from === to) return false
  return LISTING_STATUS_TRANSITIONS[from].includes(to)
}

/** Statuses a buyer/renter can see in browse results. */
export function isListingVisible(status: ListingStatus): boolean {
  return status !== 'removed' && status !== 'paused'
}
