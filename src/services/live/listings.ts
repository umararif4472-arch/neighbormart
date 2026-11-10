import {
  setDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite'
import type { ItemListing, LatLng, Listing, ListingFilters, ListingStatus, User } from '@/types'
import { EMPTY_LISTING_FILTERS } from '@/types'
import { DEFAULT_CURRENCY } from '@/config'
import { filterListings } from '@/utils/filters'
import { canTransitionListingStatus } from '@/utils/listingStatus'
import { ApiError } from '../errors'
import { bumpListingQuota } from './rateLimit'
import { sanitizeMultiline, sanitizeText } from '@/utils/sanitize'
import { getDb } from '../firebase'
import { assertNotSuspendedLive } from './users'
import {
  validateCreateItemListingInput,
  validateCreateListingInput,
  type CreateItemListingInput,
  type CreateListingInput,
  type UpdateListingBasicsInput,
} from '../listingValidation'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'

export type {
  CreateItemListingInput,
  CreateListingInput,
  UpdateListingBasicsInput,
} from '../listingValidation'
export { validateCreateItemListingInput, validateCreateListingInput } from '../listingValidation'

export type { BrowseListingsQuery, ListingsCursor, ListingsPage } from '../pagination'
export { LISTINGS_PAGE_SIZE } from '../pagination'
import {
  cursorForListing,
  listingsPageCacheKey,
  type BrowseListingsQuery,
  type ListingsPage,
} from '../pagination'

/**
 * Live listing service (Firestore) — Workstream A paged reads.
 *
 * Browse reads run the CANONICAL QUERY (see services/pagination.ts,
 * identical on Flutter): status == 'active' [+ section] [+ listingType]
 * [+ location.city], orderBy(createdAt, desc), limit(24), startAfter
 * cursor. firestore.indexes.json carries the four composite indexes
 * that serve its filter combinations.
 *
 * Price range, free-text search and distance are NOT in the query —
 * Firestore cannot combine a price range with createdAt ordering — the
 * browse UI applies them client-side over the fetched pages.
 */

// Per-session page cache + cursor snapshots. A page is read from
// Firestore at most once per session; every mutation below invalidates
// the cache explicitly, so a created/edited/paused listing can never
// hide behind a stale page.
const pageCache = new Map<string, ListingsPage>()
const snapshotCache = new Map<string, QueryDocumentSnapshot>()

export function invalidateListingsCache(): void {
  pageCache.clear()
  snapshotCache.clear()
}

function snapshotKey(cursor: { createdAt: string; id: string }): string {
  return `${cursor.createdAt}|${cursor.id}`
}

export async function getListingsPage(
  pageQuery: BrowseListingsQuery = {},
): Promise<ListingsPage> {
  const key = listingsPageCacheKey(pageQuery)
  const cached = pageCache.get(key)
  if (cached) return cached

  const pageSize = pageQuery.pageSize ?? 24
  const constraints: QueryConstraint[] = [where('status', '==', 'active')]
  if (pageQuery.section && pageQuery.section !== 'all') {
    constraints.push(where('section', '==', pageQuery.section))
  }
  if (pageQuery.listingType && pageQuery.listingType !== 'all') {
    constraints.push(where('listingType', '==', pageQuery.listingType))
  }
  if (pageQuery.city) {
    constraints.push(where('location.city', '==', pageQuery.city))
  }
  constraints.push(orderBy('createdAt', 'desc'))
  if (pageQuery.cursor) {
    // Prefer the exact document snapshot (correct under createdAt
    // ties); fall back to the raw createdAt value if the snapshot was
    // lost (e.g. a fresh session deep-linking to a later page).
    const snap = snapshotCache.get(snapshotKey(pageQuery.cursor))
    constraints.push(snap ? startAfter(snap) : startAfter(pageQuery.cursor.createdAt))
  }
  constraints.push(limit(pageSize))

  const snap = await getDocs(query(collection(getDb(), COLLECTIONS.listings), ...constraints))
  const items = fromDocs<Listing>(snap.docs)
  const lastDoc = snap.docs[snap.docs.length - 1]
  if (lastDoc) {
    const last = items[items.length - 1]
    snapshotCache.set(snapshotKey({ createdAt: last.createdAt, id: last.id }), lastDoc)
  }
  const hasMore = snap.docs.length === pageSize
  const page: ListingsPage = {
    items,
    nextCursor: hasMore && items.length > 0 ? cursorForListing(items[items.length - 1]) : null,
    hasMore,
  }
  pageCache.set(key, page)
  return page
}

/** All of one owner's listings, any status, newest first (dashboard/profile). */
export async function getListingsByOwner(ownerId: string): Promise<Listing[]> {
  const q = query(
    collection(getDb(), COLLECTIONS.listings),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return fromDocs<Listing>(snap.docs)
}

/**
 * @deprecated Whole-collection read kept ONLY for the admin panel
 * (moderation needs the full catalog incl. non-active listings).
 * Browse, landing and hydration must use getListingsPage /
 * getListingsByOwner — never this.
 */
export async function getListings(
  filters?: Partial<ListingFilters>,
  origin?: LatLng | null,
): Promise<Listing[]> {
  const q = query(collection(getDb(), COLLECTIONS.listings), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  const listings = fromDocs<Listing>(snap.docs)
  if (!filters) return listings
  const applied: ListingFilters = { ...EMPTY_LISTING_FILTERS, ...filters }
  return filterListings(listings, applied, origin ?? null)
}

export async function getListingById(listingId: string): Promise<Listing | null> {
  const ref = doc(getDb(), COLLECTIONS.listings, listingId)
  const snap = await getDoc(ref)
  const listing = fromDoc<Listing>(snap)
  if (listing) {
    // View counter for the owner dashboard (fire-and-forget, like the
    // mock). Known live-mode limit: the current rules only let the
    // OWNER write the doc, so increments from other viewers are denied
    // and swallowed here — counts under-report until a Phase 8 Cloud
    // Function takes over view counting.
    void updateDoc(ref, { views: increment(1) }).catch(() => undefined)
  }
  return listing
}

/**
 * Publish a new items-section listing (other sections' wizards arrive in
 * Phase 5). Validation is the shared listingValidation module — identical
 * to the mock backend. Security rules enforce ownerId == caller uid.
 */
export async function createItemListing(input: CreateItemListingInput): Promise<ItemListing> {
  const errors = validateCreateItemListingInput(input)
  if (Object.keys(errors).length > 0) {
    throw new ApiError('invalid', Object.values(errors)[0])
  }

  await assertNotSuspendedLive(input.ownerId)
  const ownerSnap = await getDoc(doc(getDb(), COLLECTIONS.users, input.ownerId))
  const owner = fromDoc<User>(ownerSnap)
  if (!owner) {
    throw new ApiError('not-found', 'Your profile could not be found — try signing in again.')
  }

  const now = new Date().toISOString()
  const isRent = input.dailyFee != null && input.dailyFee > 0

  const listing: Omit<ItemListing, 'id'> = {
    ownerId: input.ownerId,
    section: 'items',
    listingType: isRent ? 'rent' : 'borrow',
    title: sanitizeText(input.title, 120),
    description: sanitizeMultiline(input.description, 2000),
    price: isRent ? (input.dailyFee as number) : 0,
    currency: DEFAULT_CURRENCY,
    priceUnit: isRent ? 'day' : 'fixed',
    negotiable: false,
    photos: input.photos.filter((url) => url.trim().length > 0),
    location: { ...owner.homeLocation, city: owner.city, area: owner.neighborhood },
    status: 'active',
    createdAt: now,
    updatedAt: now,
    views: 0,
    details: {
      category: input.category,
      condition: input.condition.trim(),
      depositAmount: input.depositAmount,
      maxDurationDays: input.maxDurationDays,
      pickupPreference: input.pickupPreference,
      pickupInstructions: input.pickupInstructions.trim(),
    },
  }

  // Phase 8: mint the id client-side so the rate-limit counter can
  // name it (rules only allow the create when the counter does).
  const ref = doc(collection(getDb(), COLLECTIONS.listings))
  await bumpListingQuota(input.ownerId, ref.id)
  await setDoc(ref, stripUndefined(listing))
  invalidateListingsCache()
  return { id: ref.id, ...listing }
}

/** Publish a listing in ANY section (Phase 5 — the 5-step wizard). */
export async function createListing(input: CreateListingInput): Promise<Listing> {
  const errors = validateCreateListingInput(input)
  if (Object.keys(errors).length > 0) {
    throw new ApiError('invalid', Object.values(errors)[0])
  }

  const ownerSnap = await getDoc(doc(getDb(), COLLECTIONS.users, input.ownerId))
  const owner = fromDoc<User>(ownerSnap)
  if (!owner) {
    throw new ApiError('not-found', 'Your profile could not be found — try signing in again.')
  }

  const now = new Date().toISOString()
  const base = {
    ownerId: input.ownerId,
    listingType: input.listingType,
    title: sanitizeText(input.title, 120),
    description: sanitizeMultiline(input.description, 2000),
    price: input.listingType === 'borrow' ? 0 : input.price,
    currency: DEFAULT_CURRENCY,
    priceUnit: input.listingType === 'borrow' ? ('fixed' as const) : input.priceUnit,
    negotiable: input.listingType === 'sell' ? input.negotiable : false,
    photos: input.photos.filter((url) => url.trim().length > 0),
    location: { ...owner.homeLocation, city: owner.city, area: owner.neighborhood },
    status: 'active' as const,
    createdAt: now,
    updatedAt: now,
    views: 0,
  }
  const listing = { ...base, section: input.section, details: input.details } as Omit<Listing, 'id'>

  // Phase 8: mint the id client-side so the rate-limit counter can
  // name it (rules only allow the create when the counter does).
  const ref = doc(collection(getDb(), COLLECTIONS.listings))
  await bumpListingQuota(input.ownerId, ref.id)
  await setDoc(ref, stripUndefined(listing))
  invalidateListingsCache()
  return { id: ref.id, ...listing } as Listing
}

export async function updateListingBasics(
  listingId: string,
  ownerId: string,
  patch: UpdateListingBasicsInput,
): Promise<Listing> {
  const ref = doc(getDb(), COLLECTIONS.listings, listingId)
  const snap = await getDoc(ref)
  const listing = fromDoc<Listing>(snap)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  if (listing.ownerId !== ownerId) {
    throw new ApiError('forbidden', 'Only the owner can edit this listing.')
  }
  const updates: Record<string, string | number | boolean> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 3 || patch.title.trim().length > 80) {
      throw new ApiError('invalid', 'Title must be 3–80 characters.')
    }
    updates.title = patch.title.trim()
  }
  if (patch.description !== undefined) {
    if (patch.description.trim().length < 10 || patch.description.trim().length > 1000) {
      throw new ApiError('invalid', 'Description must be 10–1000 characters.')
    }
    updates.description = patch.description.trim()
  }
  if (patch.price !== undefined) {
    if (!Number.isFinite(patch.price) || patch.price < 0) {
      throw new ApiError('invalid', 'Price can’t be negative.')
    }
    if (listing.listingType === 'borrow' && patch.price !== 0) {
      throw new ApiError('invalid', 'Borrow listings are free.')
    }
    updates.price = patch.price
  }
  if (patch.negotiable !== undefined && listing.listingType === 'sell') {
    updates.negotiable = patch.negotiable
  }
  await updateDoc(ref, updates)
  invalidateListingsCache()
  return { ...listing, ...updates } as Listing
}

export async function updateListingStatus(
  listingId: string,
  ownerId: string,
  status: ListingStatus,
): Promise<Listing> {
  const ref = doc(getDb(), COLLECTIONS.listings, listingId)
  const snap = await getDoc(ref)
  const listing = fromDoc<Listing>(snap)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  if (listing.ownerId !== ownerId) {
    throw new ApiError('forbidden', 'Only the owner can change this listing’s status.')
  }
  if (!canTransitionListingStatus(listing.status, status)) {
    throw new ApiError('conflict', `A ${listing.status} listing can’t become ${status}.`)
  }
  const updatedAt = new Date().toISOString()
  await updateDoc(ref, { status, updatedAt })
  invalidateListingsCache()
  return { ...listing, status, updatedAt }
}
