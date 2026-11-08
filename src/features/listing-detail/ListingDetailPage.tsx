import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { usePageMeta } from '@/hooks/usePageMeta'
import { ReportModal } from '@/components/safety/ReportModal'
import { useAsync } from '@/hooks/useAsync'
import { listingsApi, requestsApi } from '@/services'
import type { Listing } from '@/types'
import { findById } from '@/utils/collections'
import { formatDate } from '@/utils/dates'
import { haversineKm } from '@/utils/distance'
import { formatMoney, formatPrice } from '@/utils/money'
import { listingEmoji, SECTION_META } from '@/utils/categoryMeta'
import { isOverdue } from '@/utils/requestLifecycle'
import { Badge, listingStatusTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PhotoGallery } from '@/components/listings/PhotoGallery'
import { ReviewsList } from '@/components/reviews/ReviewsList'
import { ChevronLeftIcon } from '@/components/icons'
import { ListingTermsCard, OwnerCard, SectionFactsCard, STATUS_LABEL } from './ListingSubcomponents'
import { RequestBorrowModal } from './RequestBorrowModal'
import { RequestDealModal } from './RequestDealModal'
import { ArenaBookingPanel } from './ArenaBookingPanel'
import { cn } from '@/utils/cn'

/**
 * /listing/:id — photo gallery, description, facts/terms, owner trust
 * card, reviews, and the section's deal flow (Phase 5):
 *  - items → request-to-borrow/rent modal
 *  - vehicles/properties → rent-period modal or sell-offer modal
 *  - arenas → inline slot-booking panel in the sidebar
 *
 * Edge cases handled deliberately:
 *  - bad/missing id → friendly 404-style empty state, no crash
 *  - your own listing → "This is your listing" (no request button)
 *  - zero reviews → "No reviews yet" state
 *  - out-now/paused/sold listings → deal flow disabled with the reason
 *    (expected-back date when an active/approved request exists)
 *  - contact buttons appear only when the owner opted in (showPhone)
 */
export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useApp()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null

  const [reportOpen, setReportOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [dealOpen, setDealOpen] = useState(false)

  // Listing loads through the service (real async path, missing id → null).
  const listingQuery = useAsync(() => listingsApi.getListingById(id ?? ''), [id])
  const listing = listingQuery.data
  // Per-listing SEO (Phase 8): shared links preview the photo + title.
  usePageMeta({
    title: listing?.title ?? 'Listing',
    description: listing?.description.slice(0, 160),
    image: listing?.photos[0],
  })
  const isItem = listing?.section === 'items'

  // Active borrow info for "expected back" (items flow; service = source of truth).
  const borrowQuery = useAsync(() => requestsApi.getRequestsForListing(id ?? ''), [id])
  const activeBorrow = useMemo(
    () => borrowQuery.data?.find((r) => r.status === 'active' || r.status === 'approved') ?? null,
    [borrowQuery.data],
  )

  const owner = listing ? findById(state.users, listing.ownerId) : undefined
  const isOwnListing = Boolean(listing && currentUser && listing.ownerId === currentUser.id)

  // Reviews about this listing (from context — stays live after new reviews).
  const listingReviews = useMemo(
    () =>
      listing
        ? state.reviews
            .filter((r) => r.listingId === listing.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [],
    [state.reviews, listing],
  )

  // --- Loading -------------------------------------------------------------
  if (listingQuery.loading) {
    return (
      <div
        className="flex flex-col gap-6"
        aria-busy="true"
        role="status"
        aria-label="Loading listing"
      >
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-4">
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-52 w-full rounded-3xl" />
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  // --- Missing listing (bad id or service error) -----------------------------
  if (!listing) {
    return (
      <EmptyState
        emoji="🧭"
        title="This listing wandered off the block"
        message={
          listingQuery.error
            ? listingQuery.error
            : "We couldn't find that listing — it may have been removed by its owner."
        }
        action={
          <Link to="/browse">
            <Button variant="secondary">Back to browse</Button>
          </Link>
        }
        className="mx-auto max-w-lg"
      />
    )
  }

  // --- CTA state machine (own / out now / paused / section / available) -----
  const cta = resolveCta({ listing, isOwnListing, activeBorrow })
  const condition =
    listing.section === 'items' || listing.section === 'vehicles' ? listing.details.condition : null

  return (
    <div className="flex flex-col gap-8">
      <Link
        to="/browse"
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-bark-light transition-colors hover:text-terracotta-700 dark:hover:text-terracotta-300"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to browse
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: gallery + description + reviews */}
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {activeBorrow && isOverdue(activeBorrow) ? (
                <Badge tone="danger" dot>
                  Overdue — expected back {formatDate(activeBorrow.dueAt!)}
                </Badge>
              ) : (
                <Badge tone={listingStatusTone(listing.status)} dot>
                  {STATUS_LABEL[listing.status]}
                </Badge>
              )}
              <Badge tone="terracotta">
                {isItem ? listing.details.category : SECTION_META[listing.section].label}
              </Badge>
              {activeBorrow?.dueAt && listing.status === 'rented' && !isOverdue(activeBorrow) && (
                <Badge tone="neutral">Expected back {formatDate(activeBorrow.dueAt)}</Badge>
              )}
            </div>
            <h1 className="font-display text-2xl font-extrabold leading-tight text-bark sm:text-3xl">
              {listing.title}
            </h1>
            <p className="text-sm text-bark-light">
              Listed by{' '}
              {owner ? (
                <Link
                  to={`/profile/${owner.id}`}
                  className="font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-4 hover:underline"
                >
                  {owner.name}
                </Link>
              ) : (
                'a neighbor'
              )}
              {origin ? ` · ${formatDistanceFrom(origin, listing)}` : ''} · {listing.location.area},{' '}
              {listing.location.city}
            </p>
          </div>

          <PhotoGallery photos={listing.photos} alt={listing.title} emoji={listingEmoji(listing)} />

          <section aria-labelledby="about-listing" className="flex flex-col gap-3">
            <h2 id="about-listing" className="font-display text-lg font-bold text-bark">
              About this listing
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-bark-light">
              {listing.description}
            </p>
            {condition && (
              <p className="rounded-2xl border border-bark/10 bg-surface p-3 text-sm text-bark">
                <span className="font-semibold">Condition: </span>
                {condition}
              </p>
            )}
          </section>

          <section aria-labelledby="listing-reviews" className="flex flex-col gap-3">
            <h2 id="listing-reviews" className="font-display text-lg font-bold text-bark">
              What neighbors say{' '}
              <span className="text-sm font-medium text-bark-light">({listingReviews.length})</span>
            </h2>
            <ReviewsList
              reviews={listingReviews}
              usersById={(reviewerId) => findById(state.users, reviewerId)}
              emptyTitle="No reviews yet"
              emptyMessage="The first deal sets the tone — be the first and tell the block how it went."
            />
          </section>
        </div>

        {/* Right: terms/facts + owner + CTA (sticky on desktop) */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {isItem ? (
            <ListingTermsCard listing={listing} origin={origin} />
          ) : (
            <SectionFactsCard listing={listing} />
          )}
          {owner && <OwnerCard owner={owner} contactable={Boolean(currentUser) && !isOwnListing} />}
          {currentUser && !isOwnListing && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="self-start text-xs font-semibold text-bark-light underline-offset-2 transition-colors hover:text-bark hover:underline"
            >
              🚩 Report this listing
            </button>
          )}

          {/* Arena booking panel (desktop sidebar / stacks on mobile) */}
          {listing.section === 'arenas' && owner && currentUser && cta.kind === 'arena' && (
            <ArenaBookingPanel listing={listing} owner={owner} requests={borrowQuery.data ?? []} />
          )}

          {/* CTA (desktop) */}
          <div className="hidden flex-col gap-2 lg:flex">
            {cta.kind === 'borrow' ? (
              <Button size="lg" onClick={() => setRequestOpen(true)}>
                {cta.label}
              </Button>
            ) : cta.kind === 'deal' ? (
              <Button size="lg" onClick={() => setDealOpen(true)}>
                {cta.label}
              </Button>
            ) : cta.kind === 'arena' ? (
              <p className="text-center text-xs text-bark-light">
                Pick a day and slot in the booking panel above to request this arena.
              </p>
            ) : (
              <CtaNotice cta={cta} />
            )}
          </div>
        </div>
      </div>

      {/* Sticky mobile CTA bar (above the tab bar) */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-[68px] z-20 border-t border-bark/10 bg-cream/95 px-4 py-3 backdrop-blur-md lg:hidden',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-bark">{listing.title}</p>
            <p className="text-xs font-medium text-moss-700 dark:text-moss-300">
              {formatPrice(listing)}
              {isItem && listing.details.depositAmount != null
                ? ` · ${formatMoney(listing.details.depositAmount, listing.currency)} deposit`
                : ''}
            </p>
          </div>
          {cta.kind === 'borrow' ? (
            <Button onClick={() => setRequestOpen(true)}>{cta.label}</Button>
          ) : cta.kind === 'deal' ? (
            <Button onClick={() => setDealOpen(true)}>{cta.label}</Button>
          ) : cta.kind === 'arena' ? (
            <a
              href="#arena-booking"
              className="inline-flex h-10 items-center rounded-full bg-terracotta-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
            >
              Book a slot
            </a>
          ) : (
            <p className="max-w-40 text-right text-xs font-semibold text-bark-light">{cta.label}</p>
          )}
        </div>
      </div>

      {currentUser && (
        <ReportModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          actorId={currentUser.id}
          targetType="listing"
          targetId={listing.id}
          targetLabel={listing.title}
        />
      )}
      {owner && currentUser && !isOwnListing && isItem && (
        <RequestBorrowModal
          listing={listing}
          owner={owner}
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
        />
      )}
      {owner &&
        currentUser &&
        !isOwnListing &&
        (listing.section === 'vehicles' || listing.section === 'properties') && (
          <RequestDealModal
            listing={listing}
            owner={owner}
            open={dealOpen}
            onClose={() => setDealOpen(false)}
          />
        )}
    </div>
  )
}

// ---------------------------------------------------------------------------

type CtaState =
  | { kind: 'borrow'; label: string }
  | { kind: 'deal'; label: string }
  | { kind: 'arena'; label: 'Book a slot' }
  | { kind: 'notice'; label: string; hint?: string }

/**
 * Pure CTA resolver — the edge cases live here, testable.
 * Out-now listings show the expected-back date when the data exists;
 * Phase 5 gives every section its own deal flow.
 */
function resolveCta(input: {
  listing: Listing
  isOwnListing: boolean
  activeBorrow: { status: string; dueAt: string | null } | null
}): CtaState {
  const { listing, isOwnListing, activeBorrow } = input

  if (isOwnListing) {
    return {
      kind: 'notice',
      label: 'This is your listing',
      hint: 'Manage requests and deals from your dashboard.',
    }
  }
  if (listing.status === 'sold') {
    return {
      kind: 'notice',
      label: 'Sold',
      hint: 'This one found a new home. Browse similar listings nearby.',
    }
  }
  if (listing.status === 'reserved') {
    return {
      kind: 'notice',
      label: 'Reserved',
      hint:
        listing.listingType === 'sell'
          ? 'An offer has been accepted — the handover is being arranged.'
          : 'A deal is being arranged for this listing right now.',
    }
  }
  if (listing.status === 'rented') {
    const overdue = activeBorrow != null && isOverdue(activeBorrow)
    return {
      kind: 'notice',
      label: overdue
        ? `Out now — overdue, was due ${activeBorrow?.dueAt ? formatDate(activeBorrow.dueAt) : 'recently'}`
        : activeBorrow?.dueAt
          ? `Out now — expected back ${formatDate(activeBorrow.dueAt)}`
          : 'Out with a neighbor right now',
      hint: 'Check back after it’s returned, or browse similar listings nearby.',
    }
  }
  if (listing.status !== 'active') {
    return {
      kind: 'notice',
      label: 'Not taking requests right now',
      hint: 'The owner has paused requests for this listing.',
    }
  }
  if (listing.section === 'items') {
    return {
      kind: 'borrow',
      label: listing.listingType === 'rent' ? 'Request to rent' : 'Request to borrow',
    }
  }
  if (listing.section === 'arenas') {
    return { kind: 'arena', label: 'Book a slot' }
  }
  // vehicles / properties
  return listing.listingType === 'sell'
    ? { kind: 'deal', label: 'Make an offer' }
    : { kind: 'deal', label: 'Request to rent' }
}

function CtaNotice({ cta }: { cta: CtaState & { kind: 'notice' } }) {
  return (
    <div
      aria-label={cta.label}
      className="flex flex-col items-center gap-1 rounded-2xl border border-bark/10 bg-surface px-4 py-3 text-center shadow-sm"
    >
      <p className="text-sm font-semibold text-bark">{cta.label}</p>
      {cta.hint && <p className="text-xs text-bark-light">{cta.hint}</p>}
    </div>
  )
}

function formatDistanceFrom(
  origin: { lat: number; lng: number },
  listing: { location: { lat: number; lng: number } },
): string {
  const km = haversineKm(origin, listing.location)
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
}
