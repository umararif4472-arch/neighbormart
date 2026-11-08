import type { ItemCategory, ItemListing, LatLng, Listing, ListingFilters } from '@/types'
import { haversineKm } from './distance'

/**
 * Pure listing filtering — the exact same logic runs client-side (through
 * useFilteredListings) and "server-side" inside the listing service, so
 * behavior can never drift between the two.
 *
 * Cross-section fields (query, section, type, status, distance) filter
 * every listing; the category filter only exists on item listings, so
 * selecting any category narrows the result to matching items (the
 * browse UI only offers categories inside the items section anyway).
 */
export function filterListings(
  listings: readonly Listing[],
  filters: ListingFilters,
  origin: LatLng | null,
): Listing[] {
  const query = filters.query.trim().toLowerCase()
  return listings.filter((listing) => {
    if (filters.section !== 'all' && listing.section !== filters.section) return false
    if (filters.listingType !== 'all' && listing.listingType !== filters.listingType) return false
    if (filters.status !== 'all' && listing.status !== filters.status) return false
    if (filters.categories.length > 0) {
      if (listing.section !== 'items') return false
      if (!filters.categories.includes(listing.details.category)) return false
    }
    if (origin && filters.maxDistanceKm != null) {
      if (haversineKm(origin, listing.location) > filters.maxDistanceKm) return false
    }
    if (query) {
      const haystack =
        `${listing.title} ${listing.description} ${searchableDetails(listing)}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

/** Extra searchable text per section (category, make/model, property type, sports). */
function searchableDetails(listing: Listing): string {
  switch (listing.section) {
    case 'items':
      return listing.details.category
    case 'vehicles':
      return `${listing.details.make} ${listing.details.model}`
    case 'properties':
      return listing.details.propertyType
    case 'arenas':
      return listing.details.sportTypes.join(' ')
  }
}

/** Category counts for the items-section browse header chips. */
export function countByCategory(
  listings: readonly ItemListing[],
): Array<{ category: ItemCategory; count: number }> {
  const counts = new Map<ItemCategory, number>()
  for (const listing of listings) {
    const category = listing.details.category
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }))
}
