import type {
  ArenaFacilities,
  ItemCategory,
  ListingStatus,
  ListingType,
  PropertyType,
  VehicleFuelType,
  VehicleTransmission,
} from '@/types'
import { cn } from '@/utils/cn'
import { CATEGORY_META } from '@/utils/categoryMeta'
import { SearchIcon, XIcon } from '@/components/icons'

/** Filter state owned by BrowsePage — shared by list AND map views. */
export interface BrowseFilterState {
  query: string
  categories: ItemCategory[]
  radiusKm: number | null
  status: ListingStatus | 'all'
  listingType: ListingType | 'all'
  // Phase 5: location + price
  city: string
  area: string
  priceMin: number | null
  priceMax: number | null
  // Phase 5: vehicles
  makes: string[]
  fuelTypes: VehicleFuelType[]
  transmissions: VehicleTransmission[]
  yearMin: number | null
  yearMax: number | null
  withDriverOnly: boolean
  // Phase 5: properties
  propertyTypes: PropertyType[]
  minBedrooms: number | null
  furnished: 'any' | 'furnished' | 'unfurnished'
  // Phase 5: arenas
  sports: string[]
  minCapacity: number | null
  facilities: Array<keyof ArenaFacilities>
}

export const DEFAULT_BROWSE_FILTERS: BrowseFilterState = {
  query: '',
  categories: [],
  radiusKm: null,
  status: 'all',
  listingType: 'all',
  city: '',
  area: '',
  priceMin: null,
  priceMax: null,
  makes: [],
  fuelTypes: [],
  transmissions: [],
  yearMin: null,
  yearMax: null,
  withDriverOnly: false,
  propertyTypes: [],
  minBedrooms: null,
  furnished: 'any',
  sports: [],
  minCapacity: null,
  facilities: [],
}

export function hasActiveFilters(filters: BrowseFilterState): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.categories.length > 0 ||
    filters.radiusKm != null ||
    filters.status !== 'all' ||
    filters.listingType !== 'all' ||
    filters.city !== '' ||
    filters.area !== '' ||
    filters.priceMin != null ||
    filters.priceMax != null ||
    filters.makes.length > 0 ||
    filters.fuelTypes.length > 0 ||
    filters.transmissions.length > 0 ||
    filters.yearMin != null ||
    filters.yearMax != null ||
    filters.withDriverOnly ||
    filters.propertyTypes.length > 0 ||
    filters.minBedrooms != null ||
    filters.furnished !== 'any' ||
    filters.sports.length > 0 ||
    filters.minCapacity != null ||
    filters.facilities.length > 0
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
  /** Categories only exist in the items section; other sections hide the chips. */
  showCategories?: boolean
  /** Distinct cities/areas present in the catalog (for the selects). */
  cities?: string[]
  areas?: string[]
  className?: string
}

const DEAL_TYPES: Array<{ value: ListingType | 'all'; label: string }> = [
  { value: 'all', label: 'All deals' },
  { value: 'borrow', label: 'Borrow (free)' },
  { value: 'rent', label: 'Rent' },
  { value: 'sell', label: 'Buy' },
]

const selectClass =
  'h-8 cursor-pointer rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600'

/**
 * Search + category chips + radius/status selects. Query input is
 * debounced by the parent (useDebouncedValue) before filtering runs.
 */
export function FilterBar({
  filters,
  onPatch,
  onReset,
  resultCount,
  totalCount,
  searching,
  showCategories = true,
  cities = [],
  areas = [],
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

      {/* Category chips (multi-select, items section only) */}
      {showCategories && (
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
      )}

      {/* Deal type chips (Phase 5) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Deal type">
        {DEAL_TYPES.map((deal) => (
          <button
            key={deal.value}
            type="button"
            onClick={() => onPatch({ listingType: deal.value })}
            aria-pressed={filters.listingType === deal.value}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filters.listingType === deal.value
                ? 'border-moss-600 bg-moss-600 text-white'
                : 'border-bark/15 bg-white text-bark-light hover:border-moss-400 hover:text-moss-800',
            )}
          >
            {deal.label}
          </button>
        ))}
      </div>

      {/* City / area / price (Phase 5) */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="city-filter" className="text-xs font-semibold text-bark-light">
          City
        </label>
        <select
          id="city-filter"
          value={filters.city}
          onChange={(e) => onPatch({ city: e.target.value, area: '' })}
          className={selectClass}
        >
          <option value="">All cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        <label htmlFor="area-filter" className="ml-2 text-xs font-semibold text-bark-light">
          Area
        </label>
        <select
          id="area-filter"
          value={filters.area}
          onChange={(e) => onPatch({ area: e.target.value })}
          className={selectClass}
        >
          <option value="">All areas</option>
          {areas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>

        <label htmlFor="price-min" className="ml-2 text-xs font-semibold text-bark-light">
          Price Rs
        </label>
        <input
          id="price-min"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Min"
          value={filters.priceMin ?? ''}
          onChange={(e) =>
            onPatch({ priceMin: e.target.value === '' ? null : Number(e.target.value) })
          }
          className="h-8 w-24 rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
        />
        <span aria-hidden className="text-xs text-bark-light">
          –
        </span>
        <input
          id="price-max"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Max"
          aria-label="Maximum price"
          value={filters.priceMax ?? ''}
          onChange={(e) =>
            onPatch({ priceMax: e.target.value === '' ? null : Number(e.target.value) })
          }
          className="h-8 w-24 rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
        />
      </div>

      {/* Radius + status + reset */}
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

        <label htmlFor="status-filter" className="ml-2 text-xs font-semibold text-bark-light">
          Status
        </label>
        <select
          id="status-filter"
          value={filters.status}
          onChange={(e) => onPatch({ status: e.target.value as ListingStatus | 'all' })}
          className="h-8 cursor-pointer rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <option value="all">All statuses</option>
          <option value="active">Available</option>
          <option value="rented">Out now</option>
          <option value="paused">Paused</option>
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
