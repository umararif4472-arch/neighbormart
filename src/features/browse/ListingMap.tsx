import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Listing, ListingStatus, User } from '@/types'
import { cn } from '@/utils/cn'
import { createProjection, type ProjectedPoint } from '@/utils/mapProjection'
import { listingEmoji, SECTION_META } from '@/utils/categoryMeta'
import { formatDistance, haversineKm } from '@/utils/distance'
import { ListingPhoto } from '@/components/listings/ListingPhoto'
import { Badge, listingStatusTone } from '@/components/ui/Badge'

export interface ListingMapProps {
  listings: Listing[]
  usersById: (id: string) => User | undefined
  origin: { lat: number; lng: number } | null
  /** Radius filter in km (draws the truthful ring + clips pins). */
  radiusKm: number | null
  className?: string
}

/**
 * Custom SVG neighborhood map — no map library needed.
 *
 * Geometry is honest: pins are placed by a pure lat/lng→pixel projection
 * with uniform scale, so relative pin distances and the radius ring match
 * real-world km (see utils/mapProjection.ts, unit-tested).
 *
 * Clicking a pin selects it and opens a preview card linking to the listing.
 * Fully keyboard accessible: pins are real <button> elements.
 */

// Decorative pseudo-streets so the canvas reads as a neighborhood map.
const STREETS = [
  'M0 84 H800',
  'M0 210 H800',
  'M0 340 H800',
  'M0 470 H800',
  'M120 0 V600',
  'M300 0 V600',
  'M480 0 V600',
  'M660 0 V600',
] as const

const MAP_BOUNDS = { width: 800, height: 600, padding: 48 }

export function ListingMap({ listings, usersById, origin, radiusKm, className }: ListingMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const projection = useMemo(
    () =>
      createProjection(
        listings.map((l) => l.location),
        origin,
        MAP_BOUNDS,
        radiusKm,
      ),
    [listings, origin, radiusKm],
  )

  const placed = useMemo(() => {
    return listings.map((listing) => ({
      listing,
      point: projection.project(listing.location),
      distanceKm: origin ? haversineKm(origin, listing.location) : null,
    }))
  }, [listings, projection, origin])

  const selected = placed.find((p) => p.listing.id === selectedId) ?? null
  const originPoint = origin ? projection.project(origin) : null

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-3xl border border-bark/10 bg-moss-50 shadow-sm',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${MAP_BOUNDS.width} ${MAP_BOUNDS.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Neighborhood map showing ${listings.length} listings${radiusKm ? ` within ${radiusKm} km` : ''}`}
        className="block h-full w-full"
      >
        {/* Canvas */}
        <rect
          width={MAP_BOUNDS.width}
          height={MAP_BOUNDS.height}
          className="fill-moss-50"
          rx="20"
        />
        {/* Park patches for warmth */}
        <ellipse cx={170} cy={150} rx={90} ry={60} className="fill-moss-100" />
        <ellipse cx={620} cy={430} rx={110} ry={70} className="fill-moss-100" />
        {/* River */}
        <path
          d="M-20 520 C 150 560, 300 470, 460 510 S 700 590, 830 540"
          className="stroke-sky-200"
          strokeWidth={26}
          fill="none"
          strokeLinecap="round"
        />
        {/* Streets */}
        {STREETS.map((d, i) => (
          <path
            key={i}
            d={d}
            className="stroke-white"
            strokeWidth={i < 4 ? 14 : 10}
            strokeLinecap="round"
          />
        ))}

        {/* Radius ring (truthful to real km through the projection) */}
        {originPoint && projection.radiusPx != null && projection.radiusPx > 8 && (
          <>
            <circle
              cx={originPoint.x}
              cy={originPoint.y}
              r={projection.radiusPx}
              className="fill-terracotta-600/10 stroke-terracotta-500"
              strokeWidth={2}
              strokeDasharray="8 8"
            />
            <text
              x={originPoint.x}
              y={Math.max(20, originPoint.y - projection.radiusPx - 8)}
              textAnchor="middle"
              className="fill-terracotta-700 text-[15px] font-semibold"
            >
              {radiusKm} km radius
            </text>
          </>
        )}

        {/* "You are here" home marker */}
        {originPoint && (
          <g>
            <circle
              cx={originPoint.x}
              cy={originPoint.y}
              r={11}
              className="fill-white stroke-terracotta-600"
              strokeWidth={3}
            />
            <circle cx={originPoint.x} cy={originPoint.y} r={4.5} className="fill-terracotta-600" />
          </g>
        )}
      </svg>

      {/* Item pins — HTML siblings positioned over the SVG.
          Buttons must NOT live inside <svg> (they collapse to 0×0 there);
          percentage coordinates align with the projection because the SVG
          stretches to fill this relative wrapper (preserveAspectRatio="none"). */}
      {placed.map(({ listing, point, distanceKm }) => (
        <PinButton
          key={listing.id}
          emoji={listingEmoji(listing)}
          point={point}
          selected={listing.id === selectedId}
          dimmed={listing.status === 'paused'}
          label={`${listing.title} — ${STATUS_LABEL[listing.status]}${distanceKm != null ? `, ${formatDistance(distanceKm)} away` : ''}`}
          onClick={() => setSelectedId((prev) => (prev === listing.id ? null : listing.id))}
        />
      ))}

      {/* Legend */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-2xl bg-white/90 px-3 py-2 text-[11px] font-medium text-bark-light shadow-sm backdrop-blur-sm">
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-terracotta-600 bg-white" />
          You
        </span>
        <span>Pins show listings near you — tap one for details</span>
      </div>

      {/* Selected-item preview card */}
      {selected && (
        <MapPreviewCard
          listing={selected.listing}
          owner={usersById(selected.listing.ownerId)}
          distanceKm={selected.distanceKm}
          onClose={() => setSelectedId(null)}
        />
      )}

      {placed.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream/70 p-6 text-center">
          <p className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-bark-light shadow-sm">
            Nothing on the map matches your filters.
          </p>
        </div>
      )}
    </div>
  )
}

/** A map pin rendered as a focusable button positioned over the SVG. */
function PinButton({
  emoji,
  point,
  selected,
  dimmed,
  label,
  onClick,
}: {
  emoji: string
  point: ProjectedPoint
  selected: boolean
  dimmed: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      style={{
        left: `${(point.x / MAP_BOUNDS.width) * 100}%`,
        top: `${(point.y / MAP_BOUNDS.height) * 100}%`,
      }}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-full cursor-pointer rounded-full border-2 shadow-md transition-transform',
        'h-9 w-9 text-base leading-none focus-visible:outline-2 focus-visible:outline-terracotta-600',
        selected
          ? 'z-20 scale-125 border-terracotta-600 bg-white'
          : 'z-10 border-white bg-cream hover:scale-110 hover:border-terracotta-400',
        dimmed && 'opacity-60 saturate-50',
      )}
    >
      <span aria-hidden>{emoji}</span>
    </button>
  )
}

/** Bottom-sheet-style preview card over the map. */
const STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Available',
  reserved: 'Reserved',
  rented: 'Out now',
  sold: 'Sold',
  paused: 'Paused',
  removed: 'Removed',
}

function MapPreviewCard({
  listing,
  owner,
  distanceKm,
  onClose,
}: {
  listing: Listing
  owner: User | undefined
  distanceKm: number | null
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-label={`${listing.title} preview`}
      className="absolute inset-x-3 bottom-3 z-30 flex gap-3 rounded-3xl border border-bark/10 bg-white p-3 shadow-xl"
    >
      <Link
        to={`/listing/${listing.id}`}
        className="shrink-0 overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-terracotta-600"
      >
        <ListingPhoto
          src={listing.photos[0]}
          alt={listing.title}
          emoji={listingEmoji(listing)}
          className="h-20 w-20"
          variant="thumb"
        />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            to={`/listing/${listing.id}`}
            className="font-display text-sm font-semibold leading-snug text-bark hover:text-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
          >
            {listing.title}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-full p-1 text-bark-light hover:bg-bark/5"
          >
            ✕
          </button>
        </div>
        <p className="truncate text-xs text-bark-light">
          {listing.section === 'items'
            ? listing.details.category
            : SECTION_META[listing.section].label}
          {owner ? ` · ${owner.name}` : ''}
          {distanceKm != null ? ` · ${formatDistance(distanceKm)}` : ''}
        </p>
        <div className="mt-auto flex items-center gap-2">
          <Badge tone={listingStatusTone(listing.status)} dot>
            {STATUS_LABEL[listing.status]}
          </Badge>
          <Link
            to={`/listing/${listing.id}`}
            className="text-xs font-semibold text-terracotta-700 underline-offset-2 hover:underline"
          >
            View details →
          </Link>
        </div>
      </div>
    </div>
  )
}
