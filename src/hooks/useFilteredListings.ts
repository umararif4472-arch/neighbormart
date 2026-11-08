import { useMemo } from 'react'
import type { LatLng, Listing, ListingFilters } from '@/types'
import { haversineKm } from '@/utils/distance'
import { filterListings } from '@/utils/filters'

export type SortMode = 'distance' | 'newest'

/**
 * Filtering as a hook (no inline .filter() in JSX): takes raw listings +
 * filter state, returns the filtered/sorted list. The same pure
 * `filterListings` runs inside the listing service, so client and
 * mock-server rules can't drift.
 */
export function useFilteredListings(
  listings: readonly Listing[],
  filters: ListingFilters,
  origin: LatLng | null,
  sort: SortMode = 'distance',
): Listing[] {
  // Destructure to primitives so memo compares values, not object identity.
  const { query, section, listingType, categories, maxDistanceKm, status } = filters

  return useMemo(() => {
    const filtered = filterListings(
      listings,
      { query, section, listingType, categories, maxDistanceKm, status },
      origin,
    )

    if (sort === 'newest') {
      return [...filtered].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    }
    if (origin) {
      return [...filtered].sort(
        (a, b) => haversineKm(origin, a.location) - haversineKm(origin, b.location),
      )
    }
    return filtered
    // Deps are the destructured primitives above, not the filters object.
  }, [listings, query, section, listingType, categories, maxDistanceKm, status, origin, sort])
}
