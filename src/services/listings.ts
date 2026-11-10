import type { ItemListing, LatLng, Listing, ListingFilters, User } from '@/types'
import { EMPTY_LISTING_FILTERS } from '@/types'
import { DEFAULT_CURRENCY } from '@/config'
import { filterListings } from '@/utils/filters'
import { ApiError } from './errors'
import { assertNotSuspendedMock } from './suspension'
import { sanitizeMultiline, sanitizeText } from '@/utils/sanitize'
import { checkWindow, LISTING_RATE_LIMIT, type WindowState } from '@/utils/rateLimit'
import { clone, findUser, getStore, nextId, simulateLatency } from './store'

/**
 * Listing service — the single data-access point for listings in every
 * section. All writes validate here (the mock "server" is the source of
 * truth), so client-side validation can drift without data corruption.
 * In Phase 3 this file is reimplemented against Firestore behind these
 * same signatures.
 */

export type { CreateItemListingInput, CreateListingInput } from './listingValidation'
export { validateCreateItemListingInput, validateCreateListingInput } from './listingValidation'
import type { CreateItemListingInput, CreateListingInput } from './listingValidation'
import { validateCreateItemListingInput, validateCreateListingInput } from './listingValidation'
import { canTransitionListingStatus } from '@/utils/listingStatus'
import type { ListingStatus } from '@/types'

export type { BrowseListingsQuery, ListingsCursor, ListingsPage } from './pagination'
export { LISTINGS_PAGE_SIZE } from './pagination'
import {
  compareListingsNewestFirst,
  listingsPageCacheKey,
  paginateSortedListings,
  type BrowseListingsQuery,
  type ListingsPage,
} from './pagination'

// ---------------------------------------------------------------------------
// Per-session page cache (Workstream A). Browse/landing read through
// getListingsPage ONLY; the cache makes remounts and the landing→browse
// hop free, and every mutation in this module invalidates it explicitly.
// ---------------------------------------------------------------------------
const pageCache = new Map<string, ListingsPage>()

export function invalidateListingsCache(): void {
  pageCache.clear()
}

/**
 * Paged browse fetch — the canonical query (see services/pagination.ts):
 * status == 'active' [+ section] [+ listingType] [+ location.city],
 * newest first, one page of LISTINGS_PAGE_SIZE. Price range, free-text
 * search and distance are applied CLIENT-side over fetched pages (the
 * browse hook does this) — Firestore cannot combine a price range with
 * createdAt ordering, so no backend may promise them server-side.
 */
export async function getListingsPage(
  pageQuery: BrowseListingsQuery = {},
): Promise<ListingsPage> {
  const key = listingsPageCacheKey(pageQuery)
  const cached = pageCache.get(key)
  if (cached) return clone(cached)
  await simulateLatency()
  const { section, listingType, city } = pageQuery
  const matching = getStore().listings.filter(
    (l) =>
      l.status === 'active' &&
      (section == null || section === 'all' || l.section === section) &&
      (listingType == null || listingType === 'all' || l.listingType === listingType) &&
      (!city || l.location.city === city),
  )
  const page = paginateSortedListings([...matching].sort(compareListingsNewestFirst), pageQuery)
  pageCache.set(key, clone(page))
  return clone(page)
}

/** All of one owner's listings, any status, newest first (dashboard/profile). */
export async function getListingsByOwner(ownerId: string): Promise<Listing[]> {
  await simulateLatency()
  const mine = getStore().listings.filter((l) => l.ownerId === ownerId)
  return clone([...mine].sort(compareListingsNewestFirst))
}

/**
 * @deprecated Whole-collection read kept ONLY for the admin panel
 * (moderation needs the full catalog incl. non-active listings).
 * Browse, landing and hydration must use getListingsPage /
 * getListingsByOwner — never this.
 *
 * Optional filtering mirrors the pure client util exactly.
 */
export async function getListings(
  filters?: Partial<ListingFilters>,
  origin?: LatLng | null,
): Promise<Listing[]> {
  await simulateLatency()
  const listings = getStore().listings
  if (!filters) return clone(listings)
  const applied: ListingFilters = { ...EMPTY_LISTING_FILTERS, ...filters }
  return clone(filterListings(listings, applied, origin ?? null))
}

export async function getListingById(listingId: string): Promise<Listing | null> {
  await simulateLatency()
  const listing = getStore().listings.find((l) => l.id === listingId)
  if (!listing) return null
  // View counter for the owner dashboard. Fire-and-forget by design:
  // the returned clone carries the pre-increment value, the store the new.
  listing.views += 1
  return clone(listing)
}

/**
 * Publish a new items-section listing (the wizard for the other sections
 * arrives in Phase 5). The listing is stored in the shared mock DB —
 * every part of the app reading through services/context sees it
 * immediately. A null fee publishes a free borrow listing; a fee
 * publishes a per-day rent listing.
 */
export async function createItemListing(input: CreateItemListingInput): Promise<ItemListing> {
  await simulateLatency(300, 600)

  const errors = validateCreateItemListingInput(input)
  if (Object.keys(errors).length > 0) {
    // Surface the first field error as the ApiError message.
    throw new ApiError('invalid', Object.values(errors)[0])
  }

  const owner: User = findUser(input.ownerId)
  const now = new Date().toISOString()
  const isRent = input.dailyFee != null && input.dailyFee > 0

  const listing: ItemListing = {
    id: nextId('listing'),
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
    // New listings live at the owner's home (mock geolocation).
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

  getStore().listings.push(listing)
  invalidateListingsCache()
  return clone(listing)
}

/**
 * Publish a listing in ANY section (Phase 5 — the 5-step wizard). Same
 * contract as createItemListing: validate here, store, return the stored
 * listing. New listings live at the owner's home (mock geolocation).
 */
const listingWindows = new Map<string, WindowState>()

/** Phase 8 rate limit (mock parity with the live counter + rules). */
function enforceListingQuota(ownerId: string) {
  const decision = checkWindow(
    listingWindows.get(ownerId) ?? { windowStart: null, count: 0 },
    new Date().toISOString(),
    LISTING_RATE_LIMIT.limit,
    LISTING_RATE_LIMIT.windowMs,
  )
  if (!decision.allowed) {
    throw new ApiError(
      'rate-limited',
      'You can publish at most 10 listings in 24 hours — try again later.',
    )
  }
  listingWindows.set(ownerId, { windowStart: decision.windowStart, count: decision.count })
}

export async function createListing(input: CreateListingInput): Promise<Listing> {
  await simulateLatency(300, 600)

  const errors = validateCreateListingInput(input)
  if (Object.keys(errors).length > 0) {
    throw new ApiError('invalid', Object.values(errors)[0])
  }
  enforceListingQuota(input.ownerId)
  assertNotSuspendedMock(input.ownerId)

  const owner: User = findUser(input.ownerId)
  const now = new Date().toISOString()

  const base = {
    id: nextId('listing'),
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

  const listing = { ...base, section: input.section, details: input.details } as Listing
  getStore().listings.push(listing)
  invalidateListingsCache()
  return clone(listing)
}

export type { UpdateListingBasicsInput } from './listingValidation'
import type { UpdateListingBasicsInput } from './listingValidation'

export async function updateListingBasics(
  listingId: string,
  ownerId: string,
  patch: UpdateListingBasicsInput,
): Promise<Listing> {
  await simulateLatency(200, 400)
  const listing = getStore().listings.find((l) => l.id === listingId)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  if (listing.ownerId !== ownerId) {
    throw new ApiError('forbidden', 'Only the owner can edit this listing.')
  }
  if (patch.title !== undefined) {
    if (patch.title.trim().length < 3 || patch.title.trim().length > 80) {
      throw new ApiError('invalid', 'Title must be 3–80 characters.')
    }
    listing.title = patch.title.trim()
  }
  if (patch.description !== undefined) {
    if (patch.description.trim().length < 10 || patch.description.trim().length > 1000) {
      throw new ApiError('invalid', 'Description must be 10–1000 characters.')
    }
    listing.description = patch.description.trim()
  }
  if (patch.price !== undefined) {
    if (!Number.isFinite(patch.price) || patch.price < 0) {
      throw new ApiError('invalid', 'Price can’t be negative.')
    }
    if (listing.listingType === 'borrow' && patch.price !== 0) {
      throw new ApiError('invalid', 'Borrow listings are free.')
    }
    listing.price = patch.price
  }
  if (patch.negotiable !== undefined && listing.listingType === 'sell') {
    listing.negotiable = patch.negotiable
  }
  listing.updatedAt = new Date().toISOString()
  invalidateListingsCache()
  return clone(listing)
}

/**
 * Owner-driven status change (pause / resume / mark sold / remove) —
 * validated against the same status machine the Firestore rules enforce.
 */
export async function updateListingStatus(
  listingId: string,
  ownerId: string,
  status: ListingStatus,
): Promise<Listing> {
  await simulateLatency(200, 400)
  const listing = getStore().listings.find((l) => l.id === listingId)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  if (listing.ownerId !== ownerId) {
    throw new ApiError('forbidden', 'Only the owner can change this listing’s status.')
  }
  if (!canTransitionListingStatus(listing.status, status)) {
    throw new ApiError('conflict', `A ${listing.status} listing can’t become ${status}.`)
  }
  listing.status = status
  listing.updatedAt = new Date().toISOString()
  invalidateListingsCache()
  return clone(listing)
}
