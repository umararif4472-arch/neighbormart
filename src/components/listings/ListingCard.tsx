import { Link } from 'react-router-dom'
import type { Listing, ListingStatus, TrustTierName, User } from '@/types'
import { cn } from '@/utils/cn'
import { formatDistance } from '@/utils/distance'
import { formatMoney, formatPrice } from '@/utils/money'
import { listingEmoji } from '@/utils/categoryMeta'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, listingStatusTone } from '@/components/ui/Badge'
import { TrustBadge } from '@/components/ui/Trust'
import { ListingPhoto } from './ListingPhoto'
import { sectionAccent } from '@/utils/sectionAccent'
import { SECTION_META } from '@/utils/categoryMeta'

export interface ListingCardProps {
  listing: Listing
  owner: User | undefined
  /** The owner's CURRENT trust tier, computed by the caller (useTrustScore). */
  ownerTier: TrustTierName | null
  /** Distance from the viewer (null when location is unknown). */
  distanceKm: number | null
  className?: string
}

const STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Available',
  reserved: 'Reserved',
  rented: 'Out now',
  sold: 'Sold',
  paused: 'Paused',
  removed: 'Removed',
}

/** One-line section-specific subtitle under the title. */
function subtitle(listing: Listing): string {
  switch (listing.section) {
    case 'items':
      return listing.details.category
    case 'vehicles':
      return `${listing.details.make} ${listing.details.model} · ${listing.details.year}`
    case 'properties': {
      const d = listing.details
      const beds = d.bedrooms != null ? `${d.bedrooms} bed · ` : ''
      return `${beds}${d.areaSize} ${d.areaUnit} · ${listing.location.area}`
    }
    case 'arenas':
      return listing.details.sportTypes.join(' · ')
  }
}

/** Grid card for browse, section pages, landing live feed, and profiles. */
export function ListingCard({
  listing,
  owner,
  ownerTier,
  distanceKm,
  className,
}: ListingCardProps) {
  return (
    <article
      className={cn(
        'group flex flex-col overflow-hidden rounded-3xl border border-bark/10 bg-surface shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:shadow-md focus-within:-translate-y-0.5',
        className,
      )}
    >
      <Link
        to={`/listing/${listing.id}`}
        className="relative block focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta-600"
      >
        <ListingPhoto
          src={listing.photos[0]}
          alt={listing.title}
          emoji={listingEmoji(listing)}
          className="aspect-[4/3] w-full"
          variant="card"
        />
        <span
          className={cn(
            'absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-sm',
            sectionAccent(listing.section).chip,
          )}
        >
          {SECTION_META[listing.section].emoji} {SECTION_META[listing.section].label.split(' ')[0]}
        </span>
        <Badge
          tone={listingStatusTone(listing.status)}
          dot
          className="absolute left-3 top-3 shadow-sm"
        >
          {STATUS_LABEL[listing.status]}
        </Badge>
        {distanceKm != null && (
          <span className="absolute bottom-3 right-3 rounded-full bg-bark/75 px-2 py-0.5 text-xs font-semibold text-cream backdrop-blur-sm">
            {formatDistance(distanceKm)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <Link
          to={`/listing/${listing.id}`}
          className="font-display text-base font-semibold leading-snug text-bark transition-colors hover:text-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          {listing.title}
        </Link>
        <p className="text-xs font-medium text-bark-light">{subtitle(listing)}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {owner ? (
            <Link
              to={`/profile/${owner.id}`}
              className="flex min-w-0 items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-terracotta-600"
              aria-label={`View ${owner.name}'s profile`}
            >
              <Avatar name={owner.name} src={owner.avatarUrl} size="xs" />
              <span className="max-w-24 truncate text-xs font-medium text-bark-light hover:text-terracotta-700">
                {owner.name}
              </span>
            </Link>
          ) : (
            <span className="text-xs text-bark-light">Neighbor</span>
          )}
          {owner && ownerTier && <TrustBadge tierName={ownerTier} />}
        </div>

        <p className="text-xs font-semibold text-moss-700">
          {formatPrice(listing)}
          {listing.section === 'items' &&
          listing.details.depositAmount != null &&
          listing.listingType === 'borrow'
            ? ` · ${formatMoney(listing.details.depositAmount, listing.currency)} deposit`
            : ''}
          {listing.negotiable ? ' · Negotiable' : ''}
        </p>
      </div>
    </article>
  )
}
