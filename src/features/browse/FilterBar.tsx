import type { ItemAvailability, ItemCategory } from '@/types'
import { cn } from '@/utils/cn'
import { CATEGORY_META } from '@/utils/categoryMeta'
import { SearchIcon, XIcon } from '@/components/icons'

/** Filter state owned by BrowsePage — shared by list AND map views. */
export interface BrowseFilterState {
  query: string
  categories: ItemCategory[]
  radiusKm: number | null
  availability: ItemAvailability | 'all'
}

export const DEFAULT_BROWSE_FILTERS: BrowseFilterState = {
  query: '',
  categories: [],
  radiusKm: null,
  availability: 'all',
}

export function hasActiveFilters(filters: BrowseFilterState): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.categories.length > 0 ||
    filters.radiusKm != null ||
    filters.availability !== 'all'
  )
}

export interface FilterBarProps {
  filters: BrowseFilterState
  onPatch: (patch: Partial<BrowseFilterState>) => void
  onReset: () => void
  resultCount: number
  totalCount: number
  /** True while the debounced query hasn't caught up with the input. */
  searching: boolean
  className?: string
}

/**
 * Search + category chips + radius/availability selects. Query input is
 * debounced by the parent (useDebouncedValue) before filtering runs.
 */
export function FilterBar({
  filters,
  onPatch,
  onReset,
  resultCount,
  totalCount,
  searching,
  className,
}: FilterBarProps) {
  return (
    <section aria-label="Filters" className={cn('flex flex-col gap-3', className)}>
      {/* Search */}
      <div className="relative">
        <label htmlFor="item-search" className="sr-only">
          Search items
        </label>
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-bark-light" />
        <input
          id="item-search"
          type="search"
          value={filters.query}
          onChange={(e) => onPatch({ query: e.target.value })}
          placeholder="Search tools, tents, karaoke machines…"
          className="w-full rounded-full border border-bark/15 bg-white py-3 pl-12 pr-11 text-sm text-bark shadow-sm transition-colors placeholder:text-bark-light/60 focus-visible:outline-2 focus-visible:outline-terracotta-600"
        />
        {filters.query && (
          <button
            type="button"
            onClick={() => onPatch({ query: '' })}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-bark-light transition-colors hover:bg-bark/5 hover:text-bark"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category chips (multi-select) */}
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar"
        role="group"
        aria-label="Filter by category"
      >
        <button
          type="button"
          onClick={() => onPatch({ categories: [] })}
          aria-pressed={filters.categories.length === 0}
          className={cn(
            'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
            filters.categories.length === 0
              ? 'border-terracotta-600 bg-terracotta-600 text-white'
              : 'border-bark/15 bg-white text-bark-light hover:border-terracotta-300 hover:text-terracotta-700',
          )}
        >
          All
        </button>
        {(Object.keys(CATEGORY_META) as ItemCategory[]).map((category) => {
          const active = filters.categories.includes(category)
          return (
            <button
              key={category}
              type="button"
              onClick={() =>
                onPatch({
                  categories: active
                    ? filters.categories.filter((c) => c !== category)
                    : [...filters.categories, category],
                })
              }
              aria-pressed={active}
              className={cn(
                'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'border-terracotta-600 bg-terracotta-600 text-white'
                  : 'border-bark/15 bg-white text-bark-light hover:border-terracotta-300 hover:text-terracotta-700',
              )}
            >
              <span aria-hidden className="mr-1">
                {CATEGORY_META[category].emoji}
              </span>
              {category}
            </button>
          )
        })}
      </div>

      {/* Radius + availability + reset */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="radius-filter" className="text-xs font-semibold text-bark-light">
          Within
        </label>
        <select
          id="radius-filter"
          value={filters.radiusKm ?? 'any'}
          onChange={(e) =>
            onPatch({ radiusKm: e.target.value === 'any' ? null : Number(e.target.value) })
          }
          className="h-8 cursor-pointer rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <option value="any">any distance</option>
          <option value={1}>1 km</option>
          <option value={2}>2 km</option>
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
        </select>

        <label htmlFor="availability-filter" className="ml-2 text-xs font-semibold text-bark-light">
          Status
        </label>
        <select
          id="availability-filter"
          value={filters.availability}
          onChange={(e) => onPatch({ availability: e.target.value as ItemAvailability | 'all' })}
          className="h-8 cursor-pointer rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="borrowed">Borrowed</option>
          <option value="unavailable">Unavailable</option>
        </select>

        <p aria-live="polite" className="ml-auto text-xs font-medium text-bark-light">
          {searching ? 'Searching…' : `${resultCount} of ${totalCount} items`}
        </p>

        {hasActiveFilters(filters) && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-50"
          >
            Clear all
          </button>
        )}
      </div>
    </section>
  )
}
