import { useMemo } from 'react'
import type { LatLng, Listing, ListingFilters } from '@/types'
import { haversineKm } from '@/utils/distance'
import { filterListings } from '@/utils/filters'

export type SortMode = 'distance' | 'newest' | 'priceAsc' | 'priceDesc'

/**
 * Filtering as a hook (no inline .filter() in JSX): takes raw listings +
 * filter state, returns the filtered/sorted list. The same pure
 * `filterListings` runs inside the listing service, so client and
 * mock-server rules can't drift.
 *
 * Callers build the filters object with useMemo, so depending on its
 * identity is stable (no re-filter per render).
 */
export function useFilteredListings(
  listings: readonly Listing[],
  filters: ListingFilters,
  origin: LatLng | null,
  sort: SortMode = 'distance',
): Listing[] {
  return useMemo(() => {
    const filtered = filterListings(listings, filters, origin)

    switch (sort) {
      case 'newest':
        return [...filtered].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      case 'priceAsc':
        return [...filtered].sort((a, b) => a.price - b.price)
      case 'priceDesc':
        return [...filtered].sort((a, b) => b.price - a.price)
      default:
        if (origin) {
          return [...filtered].sort(
            (a, b) => haversineKm(origin, a.location) - haversineKm(origin, b.location),
          )
        }
        return filtered
    }
  }, [listings, filters, origin, sort])
}
