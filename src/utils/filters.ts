import type { Item, ItemCategory, ItemFilters, LatLng } from '@/types'
import { haversineKm } from './distance'

/**
 * Pure item filtering — the exact same logic runs client-side (through
 * useFilteredItems) and "server-side" inside the item service, so behavior
 * can never drift between the two.
 */
export function filterItems(
  items: readonly Item[],
  filters: ItemFilters,
  origin: LatLng | null,
): Item[] {
  const query = filters.query.trim().toLowerCase()
  return items.filter((item) => {
    if (filters.categories.length > 0 && !filters.categories.includes(item.category)) return false
    if (filters.availability !== 'all' && item.availability !== filters.availability) return false
    if (origin && filters.maxDistanceKm != null) {
      if (haversineKm(origin, item.location) > filters.maxDistanceKm) return false
    }
    if (query) {
      const haystack = `${item.title} ${item.description} ${item.category}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

/** Category counts for the browse header chips. */
export function countByCategory(
  items: readonly Item[],
): Array<{ category: ItemCategory; count: number }> {
  const counts = new Map<ItemCategory, number>()
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  }
  return [...counts.entries()].map(([category, count]) => ({ category, count }))
}
