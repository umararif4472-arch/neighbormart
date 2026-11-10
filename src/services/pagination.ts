import type { Listing, ListingSection, ListingType } from '@/types'

/**
 * Shared browse-pagination contract (Workstream A) — implemented
 * identically by the mock service (in-memory store) and the live
 * service (Firestore) behind the same interface.
 *
 * CANONICAL BROWSE QUERY (must match the Flutter client exactly):
 *   listings where status == 'active'
 *     [and section == X] [and listingType == Y] [and location.city == Z]
 *   orderBy(createdAt, desc), limit(24), startAfter(cursor)
 *
 * Only those three filters run server-side. Price range, free-text
 * search and distance stay CLIENT-side over the fetched pages:
 * Firestore cannot combine a price range with createdAt ordering in
 * one query, and text/distance have no Firestore equivalent at all.
 * (An earlier design assumed every filter in ListingFilters could run
 * server-side — that assumption is what this split replaces.)
 */

export const LISTINGS_PAGE_SIZE = 24

/**
 * Opaque page cursor: the (createdAt, id) pair of the last item of a
 * page. Callers only ever pass it back into the next page fetch. The
 * live backend additionally keeps the Firestore DocumentSnapshot for
 * the pair in a session map, so startAfter() is exact even when two
 * listings share a createdAt timestamp.
 */
export interface ListingsCursor {
  createdAt: string
  id: string
}

export interface BrowseListingsQuery {
  section?: ListingSection | 'all'
  listingType?: ListingType | 'all'
  /** '' / undefined = any city. Maps to `location.city` server-side. */
  city?: string
  cursor?: ListingsCursor | null
  pageSize?: number
}

export interface ListingsPage {
  items: Listing[]
  /** Pass back as `cursor` for the next page; null when exhausted. */
  nextCursor: ListingsCursor | null
  hasMore: boolean
}

/** Newest-first ordering with a stable id tie-break (matches the cursor). */
export function compareListingsNewestFirst(a: Listing, b: Listing): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : -1
}

export function cursorForListing(listing: Listing): ListingsCursor {
  return { createdAt: listing.createdAt, id: listing.id }
}

/** True when `listing` sorts strictly after `cursor` (newest-first). */
export function isListingAfterCursor(listing: Listing, cursor: ListingsCursor): boolean {
  if (listing.createdAt !== cursor.createdAt) return listing.createdAt < cursor.createdAt
  return listing.id < cursor.id
}

/**
 * Slice one page out of an already newest-first-sorted list. Used by
 * the mock backend (identical semantics to the live startAfter page)
 * and shared by tests.
 */
export function paginateSortedListings(
  sortedNewestFirst: readonly Listing[],
  query: BrowseListingsQuery = {},
): ListingsPage {
  const pageSize = query.pageSize ?? LISTINGS_PAGE_SIZE
  const afterCursor = query.cursor
    ? sortedNewestFirst.filter((l) => isListingAfterCursor(l, query.cursor as ListingsCursor))
    : [...sortedNewestFirst]
  const items = afterCursor.slice(0, pageSize)
  const hasMore = afterCursor.length > pageSize
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? cursorForListing(items[items.length - 1]) : null,
    hasMore,
  }
}

/** Stable cache key for one page request (per-session page caches). */
export function listingsPageCacheKey(query: BrowseListingsQuery): string {
  return [
    query.section ?? 'all',
    query.listingType ?? 'all',
    query.city ?? '',
    query.pageSize ?? LISTINGS_PAGE_SIZE,
    query.cursor ? `${query.cursor.createdAt}|${query.cursor.id}` : 'first',
  ].join('::')
}
