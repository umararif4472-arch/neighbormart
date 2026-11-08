import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useAsync } from '@/hooks/useAsync'
import { itemsApi, requestsApi } from '@/services'
import { findById } from '@/utils/collections'
import { formatDate } from '@/utils/dates'
import { haversineKm } from '@/utils/distance'
import { isOverdue } from '@/utils/requestLifecycle'
import { Badge, availabilityTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PhotoGallery } from '@/components/items/PhotoGallery'
import { ReviewsList } from '@/components/reviews/ReviewsList'
import { ChevronLeftIcon } from '@/components/icons'
import { OwnerCard, BorrowTermsCard, AVAILABILITY_LABEL } from './ItemSubcomponents'
import { RequestBorrowModal } from './RequestBorrowModal'
import { cn } from '@/utils/cn'

/**
 * /item/:id — photo gallery, description, terms, owner trust card,
 * reviews, and the request-to-borrow flow.
 *
 * Edge cases handled deliberately (per spec):
 *  - bad/missing id → friendly 404-style empty state, no crash
 *  - your own item → "This is your item" (no request button)
 *  - zero reviews → "No reviews yet" state
 *  - borrowed/unavailable → request flow disabled with the reason
 *    (expected-back date when an active/approved request exists)
 */
export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useApp()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null

  const [requestOpen, setRequestOpen] = useState(false)

  // Item loads through the service (real async path, missing id → null).
  const itemQuery = useAsync(() => itemsApi.getItemById(id ?? ''), [id])
  const item = itemQuery.data

  // Active borrow info for "expected back" (service = source of truth).
  const borrowQuery = useAsync(() => requestsApi.getRequestsForItem(id ?? ''), [id])
  const activeBorrow = useMemo(
    () => borrowQuery.data?.find((r) => r.status === 'active' || r.status === 'approved') ?? null,
    [borrowQuery.data],
  )

  const owner = item ? findById(state.users, item.ownerId) : undefined
  const isOwnItem = Boolean(item && currentUser && item.ownerId === currentUser.id)

  // Reviews about this item (from context — stays live after new reviews).
  const itemReviews = useMemo(
    () =>
      item
        ? state.reviews
            .filter((r) => r.itemId === item.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [],
    [state.reviews, item],
  )

  // --- Loading -------------------------------------------------------------
  if (itemQuery.loading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" role="status" aria-label="Loading item">
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

  // --- Missing item (bad id or service error) ------------------------------
  if (!item) {
    return (
      <EmptyState
        emoji="🧭"
        title="This item wandered off the block"
        message={
          itemQuery.error
            ? itemQuery.error
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

  // --- CTA state machine (own item / unavailable / borrowed / available) ----
  const cta = resolveCta({ item, isOwnItem, activeBorrow })

  return (
    <div className="flex flex-col gap-8">
      <Link
        to="/browse"
        className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-bark-light transition-colors hover:text-terracotta-700"
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
                <Badge tone={availabilityTone(item.availability)} dot>
                  {AVAILABILITY_LABEL[item.availability]}
                </Badge>
              )}
              <Badge tone="terracotta">{item.category}</Badge>
              {activeBorrow?.dueAt &&
                item.availability === 'borrowed' &&
                !isOverdue(activeBorrow) && (
                  <Badge tone="neutral">Expected back {formatDate(activeBorrow.dueAt)}</Badge>
                )}
            </div>
            <h1 className="font-display text-2xl font-extrabold leading-tight text-bark sm:text-3xl">
              {item.title}
            </h1>
            <p className="text-sm text-bark-light">
              Shared by{' '}
              {owner ? (
                <Link
                  to={`/profile/${owner.id}`}
                  className="font-semibold text-terracotta-700 underline-offset-4 hover:underline"
                >
                  {owner.name}
                </Link>
              ) : (
                'a neighbor'
              )}
              {origin ? ` · ${item.location ? formatDistanceFrom(origin, item) : ''}` : ''}
            </p>
          </div>

          <PhotoGallery photos={item.photos} alt={item.title} category={item.category} />

          <section aria-labelledby="about-item" className="flex flex-col gap-3">
            <h2 id="about-item" className="font-display text-lg font-bold text-bark">
              About this item
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-bark-light">
              {item.description}
            </p>
            <p className="rounded-2xl border border-bark/10 bg-white p-3 text-sm text-bark">
              <span className="font-semibold">Condition: </span>
              {item.condition}
            </p>
          </section>

          <section aria-labelledby="item-reviews" className="flex flex-col gap-3">
            <h2 id="item-reviews" className="font-display text-lg font-bold text-bark">
              What neighbors say{' '}
              <span className="text-sm font-medium text-bark-light">({itemReviews.length})</span>
            </h2>
            <ReviewsList
              reviews={itemReviews}
              usersById={(reviewerId) => findById(state.users, reviewerId)}
              emptyTitle="No reviews yet"
              emptyMessage="The first borrower sets the tone — borrow it and tell the block how it went."
            />
          </section>
        </div>

        {/* Right: terms + owner + CTA (sticky on desktop) */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <BorrowTermsCard item={item} origin={origin} />
          {owner && <OwnerCard owner={owner} />}

          {/* CTA (desktop) */}
          <div className="hidden flex-col gap-2 lg:flex">
            {cta.kind === 'request' ? (
              <Button size="lg" onClick={() => setRequestOpen(true)}>
                Request to borrow
              </Button>
            ) : (
              <CtaNotice cta={cta} />
            )}
            {cta.kind === 'notice' && cta.hint && (
              <p className="text-center text-xs text-bark-light">{cta.hint}</p>
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
            <p className="truncate text-sm font-semibold text-bark">{item.title}</p>
            <p className="text-xs font-medium text-moss-700">
              {item.borrowTerms.dailyFee != null
                ? `$${item.borrowTerms.dailyFee}/day`
                : 'Free to borrow'}
              {item.borrowTerms.depositAmount != null
                ? ` · $${item.borrowTerms.depositAmount} deposit`
                : ''}
            </p>
          </div>
          {cta.kind === 'request' ? (
            <Button onClick={() => setRequestOpen(true)}>Request to borrow</Button>
          ) : (
            <p className="max-w-40 text-right text-xs font-semibold text-bark-light">{cta.label}</p>
          )}
        </div>
      </div>

      {owner && currentUser && !isOwnItem && (
        <RequestBorrowModal
          item={item}
          owner={owner}
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

type CtaState =
  { kind: 'request'; label: 'Request to borrow' } | { kind: 'notice'; label: string; hint?: string }

/**
 * Pure CTA resolver — the edge cases from the spec live here, testable.
 * Borrowed items show the expected-back date when the data exists.
 */
function resolveCta(input: {
  item: { availability: 'available' | 'borrowed' | 'unavailable' }
  isOwnItem: boolean
  activeBorrow: { status: string; dueAt: string | null } | null
}): CtaState {
  const { item, isOwnItem, activeBorrow } = input

  if (isOwnItem) {
    return {
      kind: 'notice',
      label: 'This is your item',
      hint: 'It’s in your lending list — manage requests from your dashboard.',
    }
  }
  if (item.availability === 'borrowed') {
    const overdue = activeBorrow != null && isOverdue(activeBorrow)
    return {
      kind: 'notice',
      label: overdue
        ? `Borrowed — overdue, was due ${activeBorrow?.dueAt ? formatDate(activeBorrow.dueAt) : 'recently'}`
        : activeBorrow?.dueAt
          ? `Borrowed — expected back ${formatDate(activeBorrow.dueAt)}`
          : 'Borrowed right now',
      hint: 'Check back after it’s returned, or browse similar items nearby.',
    }
  }
  if (item.availability === 'unavailable') {
    return {
      kind: 'notice',
      label: 'Not taking requests right now',
      hint: 'The owner has paused requests for this item.',
    }
  }
  return { kind: 'request', label: 'Request to borrow' }
}

function CtaNotice({ cta }: { cta: CtaState & { kind: 'notice' } }) {
  return (
    <div
      aria-label={cta.label}
      className="flex flex-col items-center gap-1 rounded-2xl border border-bark/10 bg-white px-4 py-3 text-center shadow-sm"
    >
      <p className="text-sm font-semibold text-bark">{cta.label}</p>
      {cta.hint && <p className="text-xs text-bark-light">{cta.hint}</p>}
    </div>
  )
}

function formatDistanceFrom(
  origin: { lat: number; lng: number },
  item: { location: { lat: number; lng: number } },
): string {
  const km = haversineKm(origin, item.location)
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`
}
