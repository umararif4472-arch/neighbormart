import { Link } from 'react-router-dom'
import type { ItemListing, Listing, ListingStatus, PickupPreference, User } from '@/types'
import { useTrustScore } from '@/hooks/useTrustScore'
import { formatDate, formatMonthYear, formatResponseTime } from '@/utils/dates'
import { formatDistance, haversineKm } from '@/utils/distance'
import { formatMoney, formatPrice } from '@/utils/money'
import { Avatar } from '@/components/ui/Avatar'
import { TrustBadge, TrustMeter } from '@/components/ui/Trust'
import { CalendarIcon, CheckIcon, ClockIcon, MapPinIcon, TagIcon } from '@/components/icons'

const STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Available',
  reserved: 'Reserved',
  rented: 'Out now',
  sold: 'Sold',
  paused: 'Paused',
  removed: 'Removed',
}

const PICKUP_LABEL: Record<PickupPreference, string> = {
  pickup: 'Pickup at the owner’s place',
  'drop-off': 'Owner drops it off',
  either: 'Pickup or drop-off — whatever works',
}

/** Owner card: trust via the shared hook + pure calculator. Never hardcoded. */
export function OwnerCard({ owner, className }: { owner: User; className?: string }) {
  const { score } = useTrustScore(owner.id)
  const dealsCompleted =
    owner.stats.successfulLends +
    owner.stats.successfulBorrows +
    owner.stats.salesCompleted +
    owner.stats.rentalsHosted

  return (
    <section
      aria-label={`About the owner, ${owner.name}`}
      className={`flex flex-col gap-4 rounded-3xl border border-bark/10 bg-white p-5 shadow-sm ${className ?? ''}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={owner.name} src={owner.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-lg font-bold text-bark">{owner.name}</p>
            {score && <TrustBadge tierName={score.tierName} />}
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-bark-light">
            <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
            {owner.neighborhood}, {owner.city}
          </p>
        </div>
      </div>

      {score && <TrustMeter score={score} />}

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex flex-col rounded-2xl bg-bark/5 p-3">
          <dt className="font-semibold text-bark-light">Deals completed</dt>
          <dd className="font-display text-lg font-bold text-bark">{dealsCompleted}</dd>
        </div>
        <div className="flex flex-col rounded-2xl bg-bark/5 p-3">
          <dt className="font-semibold text-bark-light">On-time returns</dt>
          <dd className="font-display text-lg font-bold text-bark">{owner.stats.onTimeReturns}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1.5 text-xs text-bark-light">
        <p className="flex items-center gap-1.5">
          <CalendarIcon className="h-3.5 w-3.5" aria-hidden />
          Member since {formatMonthYear(owner.joinedAt)}
        </p>
        <p className="flex items-center gap-1.5">
          <ClockIcon className="h-3.5 w-3.5" aria-hidden />
          Typically replies in {formatResponseTime(owner.avgResponseMinutes)}
        </p>
        <p className="flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5" aria-hidden />
          {owner.phoneVerified ? 'Phone verified' : 'Phone unverified'}
          {' · '}
          {owner.emailVerified ? 'Email verified' : 'Email unverified'}
          {' · '}
          {owner.idVerified ? 'ID verified' : 'ID unverified'}
        </p>
      </div>

      <Link
        to={`/profile/${owner.id}`}
        className="text-sm font-semibold text-terracotta-700 underline-offset-4 hover:underline"
      >
        View {owner.name.split(' ')[0]}&apos;s profile →
      </Link>
    </section>
  )
}

export interface ListingTermsCardProps {
  listing: ItemListing
  origin: { lat: number; lng: number } | null
}

/** Borrowing terms for an items-section listing: duration, cost, deposit, pickup. */
export function ListingTermsCard({ listing, origin }: ListingTermsCardProps) {
  const terms = listing.details
  const distanceKm = origin ? haversineKm(origin, listing.location) : null

  return (
    <section
      aria-label="Borrowing terms"
      className="flex flex-col gap-3 rounded-3xl border border-bark/10 bg-white p-5 shadow-sm"
    >
      <h2 className="font-display text-lg font-bold text-bark">Borrowing terms</h2>

      <ul className="flex flex-col gap-2.5 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-bark-light">
            <CalendarIcon className="h-4 w-4" aria-hidden /> Max duration
          </span>
          <span className="font-semibold text-bark">Up to {terms.maxDurationDays} days</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-bark-light">
            <TagIcon className="h-4 w-4" aria-hidden /> Cost
          </span>
          <span className="font-semibold text-bark">{formatPrice(listing)}</span>
        </li>
        {terms.depositAmount != null && (
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-bark-light">
              <CheckIcon className="h-4 w-4" aria-hidden /> Deposit
            </span>
            <span className="font-semibold text-bark">
              {formatMoney(terms.depositAmount, listing.currency)} (refunded on return)
            </span>
          </li>
        )}
        <li className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-bark-light">
            <MapPinIcon className="h-4 w-4" aria-hidden /> Pickup
          </span>
          <span className="text-right font-semibold text-bark">
            {PICKUP_LABEL[terms.pickupPreference]}
          </span>
        </li>
        {distanceKm != null && (
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-bark-light">
              <MapPinIcon className="h-4 w-4" aria-hidden /> Distance
            </span>
            <span className="font-semibold text-bark">{formatDistance(distanceKm)} away</span>
          </li>
        )}
      </ul>

      <p className="rounded-2xl bg-moss-50 p-3 text-xs leading-relaxed text-moss-900">
        <span className="font-semibold">Owner&apos;s pickup notes: </span>
        {terms.pickupInstructions}
      </p>
    </section>
  )
}

/**
 * Key facts for vehicles / properties / arenas listings. Their booking
 * flows arrive in Phase 5 — this card already renders the full data
 * model so the detail page is truthful for every section.
 */
export function SectionFactsCard({ listing }: { listing: Listing }) {
  if (listing.section === 'items') return null
  const facts: Array<[string, string]> = [
    ['Price', formatPrice(listing) + (listing.negotiable ? ' (negotiable)' : '')],
    ['Location', `${listing.location.area}, ${listing.location.city}`],
  ]
  if (listing.section === 'vehicles') {
    const d = listing.details
    facts.push(
      ['Vehicle', `${d.make} ${d.model} · ${d.year}`],
      ['Mileage', `${d.mileageKm.toLocaleString('en-PK')} km`],
      ['Fuel', d.fuelType],
      ['Transmission', d.transmission],
      ['Registered in', d.registrationCity],
      ['With driver', d.withDriver ? 'Yes — driver included' : 'Self-drive'],
    )
  }
  if (listing.section === 'properties') {
    const d = listing.details
    facts.push(
      ['Type', d.propertyType],
      ['Size', `${d.areaSize} ${d.areaUnit}`],
      ...(d.bedrooms != null ? [['Bedrooms', String(d.bedrooms)] as [string, string]] : []),
      ...(d.bathrooms != null ? [['Bathrooms', String(d.bathrooms)] as [string, string]] : []),
      ['Furnished', d.furnished ? 'Yes' : 'No'],
      ['Available from', formatDate(d.availableFrom)],
      ...(d.amenities.length > 0
        ? [['Amenities', d.amenities.join(' · ')] as [string, string]]
        : []),
    )
  }
  if (listing.section === 'arenas') {
    const d = listing.details
    facts.push(
      ['Sports', d.sportTypes.join(' · ')],
      ['Surface', d.surface],
      ['Capacity', `${d.capacity} people`],
      ['Hours', `${d.openingHours.opens} – ${d.openingHours.closes}`],
      ['Slot length', d.slotMinutes >= 60 ? `${d.slotMinutes / 60} hr` : `${d.slotMinutes} min`],
      [
        'Facilities',
        [
          d.facilities.floodlights ? 'Floodlights' : null,
          d.facilities.parking ? 'Parking' : null,
          d.facilities.washrooms ? 'Washrooms' : null,
          d.facilities.changingRooms ? 'Changing rooms' : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Basic',
      ],
    )
  }

  return (
    <section
      aria-label="Listing facts"
      className="flex flex-col gap-3 rounded-3xl border border-bark/10 bg-white p-5 shadow-sm"
    >
      <h2 className="font-display text-lg font-bold text-bark">The facts</h2>
      <ul className="flex flex-col gap-2.5 text-sm">
        {facts.map(([label, value]) => (
          <li key={label} className="flex items-start justify-between gap-3">
            <span className="text-bark-light">{label}</span>
            <span className="text-right font-semibold text-bark">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export { STATUS_LABEL }
