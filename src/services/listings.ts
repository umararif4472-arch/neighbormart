import type { ItemListing, LatLng, Listing, ListingFilters, User } from '@/types'
import { EMPTY_LISTING_FILTERS, ITEM_CATEGORIES } from '@/types'
import { DEFAULT_CURRENCY } from '@/config'
import { filterListings } from '@/utils/filters'
import { ApiError } from './errors'
import { clone, findUser, getStore, nextId, simulateLatency } from './store'

/**
 * Listing service — the single data-access point for listings in every
 * section. All writes validate here (the mock "server" is the source of
 * truth), so client-side validation can drift without data corruption.
 * In Phase 3 this file is reimplemented against Firestore behind these
 * same signatures.
 */

export interface CreateItemListingInput {
  ownerId: string
  title: string
  description: string
  category: ItemListing['details']['category']
  condition: string
  photos: string[]
  maxDurationDays: number
  depositAmount: number | null
  /** null = free borrow; a number makes it a per-day rent listing. */
  dailyFee: number | null
  pickupPreference: ItemListing['details']['pickupPreference']
  pickupInstructions: string
}

export function validateCreateItemListingInput(
  input: CreateItemListingInput,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (input.title.trim().length < 3 || input.title.trim().length > 80) {
    errors.title = 'Title must be 3–80 characters.'
  }
  if (input.description.trim().length < 10 || input.description.trim().length > 1000) {
    errors.description = 'Description must be 10–1000 characters.'
  }
  if (!ITEM_CATEGORIES.includes(input.category)) {
    errors.category = 'Pick one of the categories.'
  }
  if (input.condition.trim().length < 3) {
    errors.condition = 'Add a short condition note (e.g. "Good — works great").'
  }
  if (
    !Number.isInteger(input.maxDurationDays) ||
    input.maxDurationDays < 1 ||
    input.maxDurationDays > 60
  ) {
    errors.maxDurationDays = 'Max borrow duration must be 1–60 days.'
  }
  if (input.depositAmount != null && (input.depositAmount < 0 || input.depositAmount > 200_000)) {
    errors.depositAmount = 'Deposit must be between Rs 0 and Rs 200,000.'
  }
  if (input.dailyFee != null && (input.dailyFee < 0 || input.dailyFee > 50_000)) {
    errors.dailyFee = 'Daily fee must be between Rs 0 and Rs 50,000.'
  }
  if (input.pickupInstructions.trim().length < 5) {
    errors.pickupInstructions = 'Tell neighbors where/how to pick up (5+ characters).'
  }
  return errors
}

/** Optional server-side filtering — mirrors the pure client util exactly. */
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
  return listing ? clone(listing) : null
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
    title: input.title.trim(),
    description: input.description.trim(),
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
  return clone(listing)
}
