import { addDoc, collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import type { ItemListing, LatLng, Listing, ListingFilters, User } from '@/types'
import { EMPTY_LISTING_FILTERS } from '@/types'
import { DEFAULT_CURRENCY } from '@/config'
import { filterListings } from '@/utils/filters'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { validateCreateItemListingInput, type CreateItemListingInput } from '../listingValidation'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'

export type { CreateItemListingInput } from '../listingValidation'
export { validateCreateItemListingInput } from '../listingValidation'

/**
 * Live listing service (Firestore). Reads fetch the collection ordered by
 * createdAt and apply the SAME pure `filterListings` the mock uses and
 * the browse UI uses, so filtering behavior cannot drift between
 * backends. firestore.indexes.json carries the composite indexes for
 * moving these filters server-side as the catalog grows.
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
  const snap = await getDoc(doc(getDb(), COLLECTIONS.listings, listingId))
  return fromDoc<Listing>(snap)
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
    title: input.title.trim(),
    description: input.description.trim(),
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

  const ref = await addDoc(collection(getDb(), COLLECTIONS.listings), stripUndefined(listing))
  return { id: ref.id, ...listing }
}
