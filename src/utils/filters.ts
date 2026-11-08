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
    // Phase 5: location + price (cross-section).
    if (filters.city && listing.location.city !== filters.city) return false
    if (filters.area && listing.location.area !== filters.area) return false
    if (filters.priceMin != null && listing.price < filters.priceMin) return false
    if (filters.priceMax != null && listing.price > filters.priceMax) return false
    if (!matchesSectionFilters(listing, filters)) return false
    if (query) {
      const haystack =
        `${listing.title} ${listing.description} ${searchableDetails(listing)}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

/**
 * Phase 5 section-specific filters. A set filter only passes listings of
 * its own section with matching details — selecting any vehicle filter
 * narrows the result to vehicles, exactly like item categories do.
 */
function matchesSectionFilters(listing: Listing, filters: ListingFilters): boolean {
  const hasVehicleFilters =
    (filters.makes?.length ?? 0) > 0 ||
    (filters.fuelTypes?.length ?? 0) > 0 ||
    (filters.transmissions?.length ?? 0) > 0 ||
    filters.yearMin != null ||
    filters.yearMax != null ||
    filters.withDriverOnly === true
  if (hasVehicleFilters) {
    if (listing.section !== 'vehicles') return false
    const d = listing.details
    if (filters.makes?.length && !filters.makes.includes(d.make)) return false
    if (filters.fuelTypes?.length && !filters.fuelTypes.includes(d.fuelType)) return false
    if (filters.transmissions?.length && !filters.transmissions.includes(d.transmission))
      return false
    if (filters.yearMin != null && d.year < filters.yearMin) return false
    if (filters.yearMax != null && d.year > filters.yearMax) return false
    if (filters.withDriverOnly && !d.withDriver) return false
  }

  const hasPropertyFilters =
    (filters.propertyTypes?.length ?? 0) > 0 ||
    filters.minBedrooms != null ||
    (filters.furnished != null && filters.furnished !== 'any')
  if (hasPropertyFilters) {
    if (listing.section !== 'properties') return false
    const d = listing.details
    if (filters.propertyTypes?.length && !filters.propertyTypes.includes(d.propertyType))
      return false
    if (filters.minBedrooms != null && (d.bedrooms ?? 0) < filters.minBedrooms) return false
    if (filters.furnished === 'furnished' && !d.furnished) return false
    if (filters.furnished === 'unfurnished' && d.furnished) return false
  }

  const hasArenaFilters =
    (filters.sports?.length ?? 0) > 0 ||
    filters.minCapacity != null ||
    (filters.facilities?.length ?? 0) > 0
  if (hasArenaFilters) {
    if (listing.section !== 'arenas') return false
    const d = listing.details
    if (filters.sports?.length && !filters.sports.some((sport) => d.sportTypes.includes(sport)))
      return false
    if (filters.minCapacity != null && d.capacity < filters.minCapacity) return false
    if (filters.facilities?.length && !filters.facilities.every((f) => d.facilities[f]))
      return false
  }

  return true
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
