import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ListingSection } from '@/types'
import { LISTING_SECTIONS } from '@/types'
import { SECTION_META } from '@/utils/categoryMeta'
import { useApp } from '@/context/AppContext'
import { useListings } from '@/hooks/useListings'
import { useFilteredListings, type SortMode } from '@/hooks/useFilteredListings'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useTrustTiers } from '@/hooks/useTrustTiers'
import { findById } from '@/utils/collections'
import { haversineKm } from '@/utils/distance'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { BrowseGridSkeleton } from '@/components/ui/Skeleton'
import { ListingCard } from '@/components/listings/ListingCard'
import { ListIcon, MapPinIcon } from '@/components/icons'
import { cn } from '@/utils/cn'
import {
  DEFAULT_BROWSE_FILTERS,
  FilterBar,
  hasActiveFilters,
  type BrowseFilterState,
} from './FilterBar'
import { SectionFilters } from './SectionFilters'
import { ListingMap } from './ListingMap'

/**
 * Section browse — one page serves /browse (items) and the Phase 5
 * section routes (/vehicles, /properties, /arenas) via the `routeSection`
 * prop; the legacy ?section= param still works when no prop is given.
 *
 * List and map views share ONE filter state, so toggling between them
 * preserves everything. Search is debounced; filtering runs inside
 * useFilteredListings (no inline .filter() in JSX).
 */
export function BrowsePage({ routeSection }: { routeSection?: ListingSection } = {}) {
  const { state } = useApp()
  const [searchParams] = useSearchParams()
  const sectionParam = searchParams.get('section')
  const section: ListingSection =
    routeSection ??
    (LISTING_SECTIONS.includes(sectionParam as ListingSection)
      ? (sectionParam as ListingSection)
      : 'items')
  const { listings, loading, error, reload } = useListings()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null

  const [filters, setFilters] = useState<BrowseFilterState>(DEFAULT_BROWSE_FILTERS)
  const [sort, setSort] = useState<SortMode>('distance')
  const [view, setView] = useState<'list' | 'map'>('list')

  // Debounce the raw query — no re-filter on every keystroke.
  const debouncedQuery = useDebouncedValue(filters.query, 250)
  const searching = debouncedQuery !== filters.query

  const listingFilters = useMemo(
    () => ({
      query: debouncedQuery,
      section,
      listingType: filters.listingType,
      categories: filters.categories,
      maxDistanceKm: filters.radiusKm,
      status: filters.status,
      city: filters.city,
      area: filters.area,
      priceMin: filters.priceMin,
      priceMax: filters.priceMax,
      makes: filters.makes,
      fuelTypes: filters.fuelTypes,
      transmissions: filters.transmissions,
      yearMin: filters.yearMin,
      yearMax: filters.yearMax,
      withDriverOnly: filters.withDriverOnly,
      propertyTypes: filters.propertyTypes,
      minBedrooms: filters.minBedrooms,
      furnished: filters.furnished,
      sports: filters.sports,
      minCapacity: filters.minCapacity,
      facilities: filters.facilities,
    }),
    [debouncedQuery, filters, section],
  )

  const visible = useFilteredListings(listings, listingFilters, origin, sort)
  const sectionCount = useMemo(
    () => listings.filter((l) => l.section === section).length,
    [listings, section],
  )
  const sectionListings = useMemo(
    () => listings.filter((l) => l.section === section),
    [listings, section],
  )
  const cities = useMemo(
    () => [...new Set(listings.map((l) => l.location.city))].sort(),
    [listings],
  )
  const areas = useMemo(
    () =>
      [
        ...new Set(
          listings
            .filter((l) => !filters.city || l.location.city === filters.city)
            .map((l) => l.location.area),
        ),
      ].sort(),
    [listings, filters.city],
  )

  // Precompute owner tiers in one batch for the whole grid.
  const owners = useMemo(() => state.users, [state.users])
  const ownerTiers = useTrustTiers(owners)
  const usersById = (id: string) => findById(state.users, id)

  const patchFilters = (patch: Partial<BrowseFilterState>) =>
    setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () => setFilters(DEFAULT_BROWSE_FILTERS)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
            {section === 'items' ? 'Browse nearby' : SECTION_META[section].label}
          </h1>
          <p className="mt-1 text-sm text-bark-light">
            {section === 'items'
              ? currentUser
                ? `Around ${currentUser.neighborhood} — tools, gear, and party kit from neighbors.`
                : 'Tools, gear, and party kit from neighbors.'
              : SECTION_META[section].blurb}
          </p>
        </div>

        {/* View toggle — filters carry over */}
        <div
          role="group"
          aria-label="View mode"
          className="flex rounded-full border border-bark/15 bg-white p-1 shadow-sm"
        >
          <button
            type="button"
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
              view === 'list' ? 'bg-terracotta-600 text-white' : 'text-bark-light hover:text-bark',
            )}
          >
            <ListIcon className="h-4 w-4" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView('map')}
            aria-pressed={view === 'map'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
              view === 'map' ? 'bg-terracotta-600 text-white' : 'text-bark-light hover:text-bark',
            )}
          >
            <MapPinIcon className="h-4 w-4" />
            Map
          </button>
        </div>
      </header>

      <FilterBar
        filters={filters}
        onPatch={patchFilters}
        onReset={resetFilters}
        resultCount={visible.length}
        totalCount={sectionCount}
        searching={searching}
        showCategories={section === 'items'}
        cities={cities}
        areas={areas}
      />

      <SectionFilters
        section={section}
        listings={sectionListings}
        filters={filters}
        onPatch={patchFilters}
      />

      {/* Loading / error / empty / grid */}
      {loading ? (
        view === 'list' ? (
          <BrowseGridSkeleton count={8} />
        ) : (
          <div className="aspect-[4/3] max-h-[560px] w-full animate-pulse rounded-3xl bg-bark/10 sm:aspect-[16/9]" />
        )
      ) : error ? (
        <EmptyState
          tone="error"
          emoji="📡"
          title="We couldn't load the neighborhood"
          message={error}
          action={<Button onClick={reload}>Try again</Button>}
        />
      ) : view === 'map' ? (
        <ListingMap
          listings={visible}
          usersById={usersById}
          origin={origin}
          radiusKm={filters.radiusKm}
          className="aspect-[4/3] max-h-[560px] w-full sm:aspect-[16/9]"
        />
      ) : sectionCount === 0 ? (
        <EmptyState
          emoji="📦"
          title="Nothing listed nearby yet"
          message="The garage is empty — be the neighbor who fills it."
          action={<Button onClick={reload}>Refresh</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title={
            filters.query ? `Nothing matches "${filters.query}"` : 'No items match your filters'
          }
          message="Try a wider radius, fewer categories, or a different search."
          action={
            hasActiveFilters(filters) ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear all filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p aria-live="polite" className="text-xs font-medium text-bark-light">
              Showing {visible.length} of {sectionCount} listings
            </p>
            <label
              htmlFor="sort-by"
              className="flex items-center gap-1.5 text-xs font-semibold text-bark-light"
            >
              Sort
              <select
                id="sort-by"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="h-8 cursor-pointer rounded-full border border-bark/15 bg-white px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
              >
                <option value="distance">Nearest first</option>
                <option value="newest">Newest first</option>
                <option value="priceAsc">Price: low to high</option>
                <option value="priceDesc">Price: high to low</option>
              </select>
            </label>
          </div>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  owner={usersById(listing.ownerId)}
                  ownerTier={ownerTiers[listing.ownerId] ?? null}
                  distanceKm={origin ? haversineKm(origin, listing.location) : null}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
