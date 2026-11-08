import { useMemo } from 'react'
import type { Item, ItemFilters, LatLng } from '@/types'
import { haversineKm } from '@/utils/distance'
import { filterItems } from '@/utils/filters'

export type SortMode = 'distance' | 'newest'

/**
 * Filtering as a hook (no inline .filter() in JSX): takes raw items + filter
 * state, returns the filtered/sorted list. The same pure `filterItems` runs
 * inside the item service, so client and mock-server rules can't drift.
 */
export function useFilteredItems(
  items: readonly Item[],
  filters: ItemFilters,
  origin: LatLng | null,
  sort: SortMode = 'distance',
): Item[] {
  // Destructure to primitives so memo compares values, not object identity.
  const { query, categories, maxDistanceKm, availability } = filters

  return useMemo(() => {
    const filtered = filterItems(items, { query, categories, maxDistanceKm, availability }, origin)

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
  }, [items, query, categories, maxDistanceKm, availability, origin, sort])
}
