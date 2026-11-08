import type { ArenaFacilities, Listing, ListingSection, PropertyType } from '@/types'
import { PROPERTY_TYPES } from '@/types'
import { cn } from '@/utils/cn'
import type { BrowseFilterState } from './FilterBar'

/**
 * Phase 5 per-section filter controls, rendered under the shared
 * FilterBar on section browse pages. Options (makes, sports) derive
 * from the catalog itself, so the UI never offers a filter with no
 * possible results.
 */

export interface SectionFiltersProps {
  section: ListingSection
  listings: readonly Listing[]
  filters: BrowseFilterState
  onPatch: (patch: Partial<BrowseFilterState>) => void
}

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
    active
      ? 'border-terracotta-600 bg-terracotta-600 text-white'
      : 'border-bark/15 bg-surface text-bark-light hover:border-terracotta-300 hover:text-terracotta-700',
  )

const selectClass =
  'h-8 cursor-pointer rounded-full border border-bark/15 bg-surface px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

const FACILITY_LABELS: Array<{ key: keyof ArenaFacilities; label: string }> = [
  { key: 'floodlights', label: 'Floodlights' },
  { key: 'parking', label: 'Parking' },
  { key: 'washrooms', label: 'Washrooms' },
  { key: 'changingRooms', label: 'Changing rooms' },
]

export function SectionFilters({ section, listings, filters, onPatch }: SectionFiltersProps) {
  if (section === 'items') return null

  return (
    <section
      aria-label={`${section} filters`}
      className="flex flex-col gap-3 rounded-3xl border border-bark/10 bg-white/70 p-4"
    >
      {section === 'vehicles' && (
        <>
          <ChipRow
            label="Make"
            options={[
              ...new Set(
                listings.flatMap((l) => (l.section === 'vehicles' ? [l.details.make] : [])),
              ),
            ].sort()}
            selected={filters.makes}
            onToggle={(make) => onPatch({ makes: toggle(filters.makes, make) })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-bark-light">Fuel</span>
            {(['petrol', 'diesel', 'cng', 'hybrid', 'electric'] as const).map((fuel) => (
              <button
                key={fuel}
                type="button"
                aria-pressed={filters.fuelTypes.includes(fuel)}
                onClick={() => onPatch({ fuelTypes: toggle(filters.fuelTypes, fuel) })}
                className={chipClass(filters.fuelTypes.includes(fuel))}
              >
                {fuel.toUpperCase()}
              </button>
            ))}
            <span className="ml-2 text-xs font-semibold text-bark-light">Gearbox</span>
            {(['manual', 'automatic'] as const).map((gear) => (
              <button
                key={gear}
                type="button"
                aria-pressed={filters.transmissions.includes(gear)}
                onClick={() => onPatch({ transmissions: toggle(filters.transmissions, gear) })}
                className={chipClass(filters.transmissions.includes(gear))}
              >
                {gear === 'manual' ? 'Manual' : 'Automatic'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="year-min" className="text-xs font-semibold text-bark-light">
              Year from
            </label>
            <input
              id="year-min"
              type="number"
              placeholder="2015"
              value={filters.yearMin ?? ''}
              onChange={(e) =>
                onPatch({ yearMin: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="h-8 w-24 rounded-full border border-bark/15 bg-surface px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
            />
            <label htmlFor="year-max" className="text-xs font-semibold text-bark-light">
              to
            </label>
            <input
              id="year-max"
              type="number"
              placeholder="2025"
              value={filters.yearMax ?? ''}
              onChange={(e) =>
                onPatch({ yearMax: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="h-8 w-24 rounded-full border border-bark/15 bg-surface px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
            />
            <label className="ml-2 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-bark-light">
              <input
                type="checkbox"
                checked={filters.withDriverOnly}
                onChange={(e) => onPatch({ withDriverOnly: e.target.checked })}
                className="h-4 w-4 accent-terracotta-600"
              />
              With driver only
            </label>
          </div>
        </>
      )}

      {section === 'properties' && (
        <>
          <ChipRow
            label="Type"
            options={[...PROPERTY_TYPES]}
            selected={filters.propertyTypes}
            onToggle={(type) =>
              onPatch({ propertyTypes: toggle(filters.propertyTypes, type as PropertyType) })
            }
            format={(type) => type.charAt(0).toUpperCase() + type.slice(1)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="min-beds" className="text-xs font-semibold text-bark-light">
              Bedrooms
            </label>
            <select
              id="min-beds"
              value={filters.minBedrooms ?? 'any'}
              onChange={(e) =>
                onPatch({
                  minBedrooms: e.target.value === 'any' ? null : Number(e.target.value),
                })
              }
              className={selectClass}
            >
              <option value="any">Any</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}+
                </option>
              ))}
            </select>
            <label htmlFor="furnished" className="ml-2 text-xs font-semibold text-bark-light">
              Furnishing
            </label>
            <select
              id="furnished"
              value={filters.furnished}
              onChange={(e) =>
                onPatch({ furnished: e.target.value as BrowseFilterState['furnished'] })
              }
              className={selectClass}
            >
              <option value="any">Any</option>
              <option value="furnished">Furnished</option>
              <option value="unfurnished">Unfurnished</option>
            </select>
          </div>
        </>
      )}

      {section === 'arenas' && (
        <>
          <ChipRow
            label="Sport"
            options={[
              ...new Set(
                listings.flatMap((l) => (l.section === 'arenas' ? l.details.sportTypes : [])),
              ),
            ].sort()}
            selected={filters.sports}
            onToggle={(sport) => onPatch({ sports: toggle(filters.sports, sport) })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="min-capacity" className="text-xs font-semibold text-bark-light">
              Capacity at least
            </label>
            <input
              id="min-capacity"
              type="number"
              min={1}
              placeholder="10"
              value={filters.minCapacity ?? ''}
              onChange={(e) =>
                onPatch({ minCapacity: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="h-8 w-24 rounded-full border border-bark/15 bg-surface px-3 text-xs font-medium text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
            />
            <span className="ml-2 text-xs font-semibold text-bark-light">Facilities</span>
            {FACILITY_LABELS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={filters.facilities.includes(key)}
                onClick={() => onPatch({ facilities: toggle(filters.facilities, key) })}
                className={chipClass(filters.facilities.includes(key))}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function ChipRow({
  label,
  options,
  selected,
  onToggle,
  format,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  format?: (value: string) => string
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-bark-light">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={selected.includes(option)}
          onClick={() => onToggle(option)}
          className={chipClass(selected.includes(option))}
        >
          {format ? format(option) : option}
        </button>
      ))}
    </div>
  )
}
