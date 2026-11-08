import { useMemo, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useItems } from '@/hooks/useItems'
import { useFilteredItems, type SortMode } from '@/hooks/useFilteredItems'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useTrustTiers } from '@/hooks/useTrustTiers'
import { findById } from '@/utils/collections'
import { haversineKm } from '@/utils/distance'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { BrowseGridSkeleton } from '@/components/ui/Skeleton'
import { ItemCard } from '@/components/items/ItemCard'
import { ListIcon, MapPinIcon } from '@/components/icons'
import { cn } from '@/utils/cn'
import {
  DEFAULT_BROWSE_FILTERS,
  FilterBar,
  hasActiveFilters,
  type BrowseFilterState,
} from './FilterBar'
import { ItemMap } from './ItemMap'

/**
 * /browse — the neighborhood's shared garage.
 *
 * List and map views share ONE filter state, so toggling between them
 * preserves everything. Search is debounced; filtering runs inside
 * useFilteredItems (no inline .filter() in JSX).
 */
export function BrowsePage() {
  const { state } = useApp()
  const { items, loading, error, reload } = useItems()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null

  const [filters, setFilters] = useState<BrowseFilterState>(DEFAULT_BROWSE_FILTERS)
  const [sort, setSort] = useState<SortMode>('distance')
  const [view, setView] = useState<'list' | 'map'>('list')

  // Debounce the raw query — no re-filter on every keystroke.
  const debouncedQuery = useDebouncedValue(filters.query, 250)
  const searching = debouncedQuery !== filters.query

  const itemFilters = useMemo(
    () => ({
      query: debouncedQuery,
      categories: filters.categories,
      maxDistanceKm: filters.radiusKm,
      availability: filters.availability,
    }),
    [debouncedQuery, filters.categories, filters.radiusKm, filters.availability],
  )

  const visible = useFilteredItems(items, itemFilters, origin, sort)

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
            Browse nearby
          </h1>
          <p className="mt-1 text-sm text-bark-light">
            {currentUser
              ? `Around ${currentUser.neighborhood} — your neighbors' shared garage.`
              : "Your neighbors' shared garage."}
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
        totalCount={items.length}
        searching={searching}
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
        <ItemMap
          items={visible}
          usersById={usersById}
          origin={origin}
          radiusKm={filters.radiusKm}
          className="aspect-[4/3] max-h-[560px] w-full sm:aspect-[16/9]"
        />
      ) : items.length === 0 ? (
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
              Showing {visible.length} of {items.length} items
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
              </select>
            </label>
          </div>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  owner={usersById(item.ownerId)}
                  ownerTier={ownerTiers[item.ownerId] ?? null}
                  distanceKm={origin ? haversineKm(origin, item.location) : null}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
