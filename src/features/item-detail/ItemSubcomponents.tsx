import { Link } from 'react-router-dom'
import type { Item, User } from '@/types'
import { useTrustScore } from '@/hooks/useTrustScore'
import { formatMonthYear, formatResponseTime } from '@/utils/dates'
import { formatDistance, haversineKm } from '@/utils/distance'
import { Avatar } from '@/components/ui/Avatar'
import { TrustBadge, TrustMeter } from '@/components/ui/Trust'
import { CalendarIcon, CheckIcon, ClockIcon, MapPinIcon, TagIcon } from '@/components/icons'

const AVAILABILITY_LABEL: Record<Item['availability'], string> = {
  available: 'Available',
  borrowed: 'Borrowed',
  unavailable: 'Unavailable',
}

const PICKUP_LABEL: Record<Item['borrowTerms']['pickupPreference'], string> = {
  pickup: 'Pickup at the owner’s place',
  'drop-off': 'Owner drops it off',
  either: 'Pickup or drop-off — whatever works',
}

/** Owner card: trust via the shared hook + pure calculator. Never hardcoded. */
export function OwnerCard({ owner, className }: { owner: User; className?: string }) {
  const { score } = useTrustScore(owner.id)

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
            {owner.neighborhood}
          </p>
        </div>
      </div>

      {score && <TrustMeter score={score} />}

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex flex-col rounded-2xl bg-bark/5 p-3">
          <dt className="font-semibold text-bark-light">Successful lends</dt>
          <dd className="font-display text-lg font-bold text-bark">
            {owner.stats.successfulLends}
          </dd>
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

export interface BorrowTermsCardProps {
  item: Item
  origin: { lat: number; lng: number } | null
}

/** Borrowing terms: duration, cost, deposit, pickup. */
export function BorrowTermsCard({ item, origin }: BorrowTermsCardProps) {
  const terms = item.borrowTerms
  const distanceKm = origin ? haversineKm(origin, item.location) : null

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
          <span className="font-semibold text-bark">
            {terms.dailyFee != null ? `$${terms.dailyFee}/day` : 'Free to borrow'}
          </span>
        </li>
        {terms.depositAmount != null && (
          <li className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-bark-light">
              <CheckIcon className="h-4 w-4" aria-hidden /> Deposit
            </span>
            <span className="font-semibold text-bark">
              ${terms.depositAmount} (refunded on return)
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

export { AVAILABILITY_LABEL }
