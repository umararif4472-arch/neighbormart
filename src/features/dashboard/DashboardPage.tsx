import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EffectiveRequestStatus, Listing, ListingStatus } from '@/types'
import { useApp } from '@/context/AppContext'
import { useMyRequests, type RequestView } from '@/hooks/useRequests'
import { useDerivedNotifications } from '@/hooks/useDerivedNotifications'
import { useTrustScore } from '@/hooks/useTrustScore'
import { listingsApi } from '@/services'
import { relativeTime } from '@/utils/dates'
import { formatPrice } from '@/utils/money'
import { listingEmoji } from '@/utils/categoryMeta'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, listingStatusTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { TrustBadge } from '@/components/ui/Trust'
import { cn } from '@/utils/cn'
import { RequestCard } from './RequestCard'
import { ReviewModal } from './ReviewModal'
import { ReportIssueModal } from './ReportIssueModal'
import { EditListingModal } from './EditListingModal'

/**
 * /dashboard — the request lifecycle, live.
 *
 * Tabs: Requests for me / My requests / Notifications / My listings. Rows are grouped by the
 * state machine's EFFECTIVE status (incl. derived "overdue"), every action
 * calls the service then syncs context, and the notification tab is a
 * derived projection of request state — nothing here needs a refresh.
 */

type TabId = 'lending' | 'borrowing' | 'notifications'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'lending', label: 'Requests for me' },
  { id: 'borrowing', label: 'My requests' },
  { id: 'notifications', label: 'Notifications' },
]

/** Incoming-request groups — lifecycle order, most attention first. */
const LENDING_GROUPS: Array<{ status: EffectiveRequestStatus; label: string }> = [
  { status: 'pending', label: 'Waiting on you' },
  { status: 'overdue', label: 'Overdue — needs a nudge' },
  { status: 'active', label: 'Out with neighbors' },
  { status: 'approved', label: 'Pickup to confirm' },
  { status: 'completed', label: 'Deals completed' },
  { status: 'returned', label: 'Reviews pending' },
  { status: 'reviewed', label: 'Fully wrapped up' },
  { status: 'declined', label: 'Declined' },
  { status: 'cancelled', label: 'Cancelled' },
]

/** My-request groups — what's current first, then history. */
const BORROWING_GROUPS: Array<{ status: EffectiveRequestStatus; label: string }> = [
  { status: 'overdue', label: 'Overdue — return it or check in' },
  { status: 'active', label: 'Out now' },
  { status: 'approved', label: 'Pickup to plan' },
  { status: 'pending', label: 'Awaiting a yes' },
  { status: 'completed', label: 'Deals completed' },
  { status: 'returned', label: 'Reviews pending' },
  { status: 'reviewed', label: 'Fully wrapped up' },
  { status: 'declined', label: 'Declined' },
]

export function DashboardPage() {
  const { state, dispatch } = useApp()
  const {
    incoming,
    outgoing,
    respondToRequest,
    confirmPickup,
    markReturned,
    markCompleted,
    cancelRequest,
    toErrorMessage,
  } = useMyRequests()
  const { feed, attentionCount } = useDerivedNotifications()
  const { score } = useTrustScore(state.currentUser?.id)

  const [tab, setTab] = useState<TabId>('lending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reviewTarget, setReviewTarget] = useState<RequestView | null>(null)
  const [issueTarget, setIssueTarget] = useState<RequestView | null>(null)
  const [editTarget, setEditTarget] = useState<Listing | null>(null)

  const myListings = useMemo(
    () =>
      state.listings.filter(
        (listing) => listing.ownerId === state.currentUser?.id && listing.status !== 'removed',
      ),
    [state.listings, state.currentUser],
  )

  const listingStats = useMemo(() => {
    const me = state.currentUser
    return {
      views: myListings.reduce((sum, l) => sum + l.views, 0),
      inquiries: incoming.length,
      dealsDone: me
        ? me.stats.successfulLends + me.stats.salesCompleted + me.stats.rentalsHosted
        : 0,
    }
  }, [myListings, incoming, state.currentUser])

  async function runListingAction(listing: Listing, status: ListingStatus) {
    const me = state.currentUser
    if (!me) return
    await runAction(`listing:${listing.id}`, async () => {
      const updated = await listingsApi.updateListingStatus(listing.id, me.id, status)
      dispatch({ type: 'LISTINGS_UPSERTED', listings: [updated] })
    })
  }

  async function runAction(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(toErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  /** Conflict labels for a request, resolved against the other pending ones. */
  const conflictLabelsFor = (view: RequestView): string[] =>
    view.conflicts.map((conflict) => {
      const other = state.requests.find((r) => r.id === conflict.id)
      const borrower = other ? state.users.find((u) => u.id === other.borrowerId) : undefined
      const short = (iso: string) => iso.slice(5, 10).replace('-', '/')
      return `${borrower?.name ?? 'another neighbor'} (${short(conflict.period.start)}–${short(conflict.period.end)})`
    })

  const lendingByStatus = useMemo(
    () =>
      LENDING_GROUPS.map((group) => ({
        ...group,
        views: incoming.filter((view) => view.effective === group.status),
      })).filter((group) => group.views.length > 0),
    [incoming],
  )

  const borrowingByStatus = useMemo(
    () =>
      BORROWING_GROUPS.map((group) => ({
        ...group,
        views: outgoing.filter((view) => view.effective === group.status),
      })).filter((group) => group.views.length > 0),
    [outgoing],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header with live trust snapshot */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
            Your dashboard
          </h1>
          <p className="mt-1 text-sm text-bark-light">
            {state.currentUser
              ? `Welcome back, ${state.currentUser.name.split(' ')[0]} — the block's business, live.`
              : "The block's business, live."}
          </p>
        </div>
        {score && (
          <div className="flex items-center gap-3 rounded-3xl border border-bark/10 bg-surface px-4 py-3 shadow-sm">
            <Avatar
              name={state.currentUser?.name ?? 'You'}
              src={state.currentUser?.avatarUrl}
              size="sm"
            />
            <div className="flex w-44 flex-col gap-1">
              <div className="flex items-center justify-between">
                <TrustBadge tierName={score.tierName} />
                <span className="text-sm font-bold text-bark">{score.total}/100</span>
              </div>
              <Link
                to="/trust"
                className="text-[11px] font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-2 hover:underline"
              >
                How trust works →
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="no-scrollbar flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-bark/10 bg-surface p-1 shadow-sm sm:w-fit"
      >
        {TABS.map(({ id, label }) => {
          const count =
            id === 'lending'
              ? incoming.filter((v) => v.effective === 'pending' || v.effective === 'overdue')
                  .length
              : id === 'borrowing'
                ? outgoing.filter((v) =>
                    ['pending', 'approved', 'active', 'overdue'].includes(v.effective),
                  ).length
                : attentionCount
          return (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
                tab === id ? 'bg-terracotta-600 text-white' : 'text-bark-light hover:text-bark',
              )}
            >
              {label}
              {count > 0 && (
                <span
                  aria-label={`${count} need attention`}
                  className={cn(
                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold',
                    tab === id ? 'bg-white/25 text-white' : 'bg-terracotta-600 text-white',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300"
        >
          {actionError}
        </p>
      )}

      {/* LENDING */}
      {tab === 'lending' && (
        <div className="flex flex-col gap-6">
          <section aria-label="Your listings" className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-bark">
              Your listings{' '}
              <span className="text-sm font-medium text-bark-light">({myListings.length})</span>
            </h2>
            {myListings.length === 0 ? (
              <EmptyState
                emoji="🧰"
                title="Nothing listed yet"
                message="The garage is full of maybes — list one and it'll show up here."
                action={
                  <Link to="/list-item">
                    <Button variant="secondary">List something</Button>
                  </Link>
                }
              />
            ) : (
              <>
                {/* Owner stats strip */}
                <dl className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['Total views', listingStats.views],
                      ['Inquiries', listingStats.inquiries],
                      ['Deals done', listingStats.dealsDone],
                    ] as const
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col rounded-2xl border border-bark/10 bg-surface p-3 shadow-sm"
                    >
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-bark-light">
                        {label}
                      </dt>
                      <dd className="font-display text-xl font-bold text-bark">{value}</dd>
                    </div>
                  ))}
                </dl>

                <ul className="flex list-none flex-col gap-2">
                  {myListings.map((item) => {
                    const busy = busyId === `listing:${item.id}`
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-3 shadow-sm"
                      >
                        <span aria-hidden className="text-2xl">
                          {listingEmoji(item)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/listing/${item.id}`}
                            className="block truncate text-sm font-semibold text-bark hover:text-terracotta-700 dark:hover:text-terracotta-300"
                          >
                            {item.title}
                          </Link>
                          <p className="text-xs text-bark-light">
                            {formatPrice(item)} · {item.views} views
                          </p>
                        </div>
                        <Badge tone={listingStatusTone(item.status)} dot>
                          {item.status === 'rented' ? 'Out' : item.status}
                        </Badge>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setEditTarget(item)}
                          >
                            Edit
                          </Button>
                          {item.status === 'active' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={busy}
                              onClick={() => runListingAction(item, 'paused')}
                            >
                              Pause
                            </Button>
                          )}
                          {item.status === 'paused' && (
                            <Button
                              size="sm"
                              loading={busy}
                              onClick={() => runListingAction(item, 'active')}
                            >
                              Resume
                            </Button>
                          )}
                          {item.status === 'active' && item.listingType === 'sell' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => runListingAction(item, 'sold')}
                            >
                              Mark sold
                            </Button>
                          )}
                          {(item.status === 'active' ||
                            item.status === 'paused' ||
                            item.status === 'sold') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60"
                              disabled={busy}
                              onClick={() => runListingAction(item, 'removed')}
                            >
                              Remove
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled
                            title="Boosts arrive with payments — coming in a later update"
                          >
                            Boost 🚀
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          {lendingByStatus.length === 0 ? (
            <EmptyState
              emoji="🌱"
              title="No borrow requests yet"
              message="When neighbors ask to borrow your things, everything lands here — approvals, pickups, returns, reviews."
            />
          ) : (
            lendingByStatus.map((group) => (
              <section key={group.status} aria-label={group.label} className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-bark">
                  {group.label}{' '}
                  <span className="text-sm font-medium text-bark-light">
                    ({group.views.length})
                  </span>
                </h2>
                <ul className="flex list-none flex-col gap-3">
                  {group.views.map((view) => (
                    <li key={view.request.id}>
                      <RequestCard
                        view={view}
                        viewerRole="lender"
                        conflictLabels={conflictLabelsFor(view)}
                        busy={busyId === view.request.id}
                        actions={
                          <>
                            {view.effective === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  loading={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () =>
                                      respondToRequest(view.request.id, 'approved'),
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () =>
                                      respondToRequest(view.request.id, 'declined'),
                                    )
                                  }
                                >
                                  Decline
                                </Button>
                              </>
                            )}
                            {view.effective === 'approved' &&
                              (view.listing.listingType === 'sell' ||
                              view.listing.section === 'arenas' ? (
                                <>
                                  <Button
                                    size="sm"
                                    loading={busyId === view.request.id}
                                    onClick={() =>
                                      runAction(view.request.id, () =>
                                        markCompleted(view.request.id),
                                      )
                                    }
                                  >
                                    {view.listing.listingType === 'sell'
                                      ? 'Mark sold'
                                      : 'Mark completed'}
                                  </Button>
                                  <Link
                                    to={`/messages/${view.request.id}`}
                                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 dark:text-terracotta-300 hover:bg-terracotta-50 dark:hover:bg-terracotta-900/50"
                                  >
                                    Chat →
                                  </Link>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () => confirmPickup(view.request.id))
                                  }
                                >
                                  Confirm pickup
                                </Button>
                              ))}
                            {view.effective === 'completed' && !view.iReviewed && (
                              <Button size="sm" onClick={() => setReviewTarget(view)}>
                                Review {view.counterpartName.split(' ')[0]}
                              </Button>
                            )}
                            {(view.effective === 'active' || view.effective === 'overdue') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () => markReturned(view.request.id))
                                  }
                                >
                                  Mark as returned
                                </Button>
                                <Link
                                  to={`/messages/${view.request.id}`}
                                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 dark:text-terracotta-300 hover:bg-terracotta-50 dark:hover:bg-terracotta-900/50"
                                >
                                  Chat →
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60"
                                  onClick={() => setIssueTarget(view)}
                                >
                                  Report issue
                                </Button>
                              </>
                            )}
                            {view.effective === 'returned' && !view.iReviewed && (
                              <Button size="sm" onClick={() => setReviewTarget(view)}>
                                Review {view.counterpartName.split(' ')[0]}
                              </Button>
                            )}
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      {/* BORROWING */}
      {tab === 'borrowing' && (
        <div className="flex flex-col gap-6">
          {borrowingByStatus.length === 0 ? (
            <EmptyState
              emoji="🛍️"
              title="Nothing borrowed yet"
              message="Browse what your neighbors have to offer — your first borrow is a click away."
              action={
                <Link to="/browse">
                  <Button variant="secondary">Browse items</Button>
                </Link>
              }
            />
          ) : (
            borrowingByStatus.map((group) => (
              <section key={group.status} aria-label={group.label} className="flex flex-col gap-3">
                <h2 className="font-display text-lg font-bold text-bark">
                  {group.label}{' '}
                  <span className="text-sm font-medium text-bark-light">
                    ({group.views.length})
                  </span>
                </h2>
                <ul className="flex list-none flex-col gap-3">
                  {group.views.map((view) => (
                    <li key={view.request.id}>
                      <RequestCard
                        view={view}
                        viewerRole="borrower"
                        conflictLabels={[]}
                        busy={busyId === view.request.id}
                        actions={
                          <>
                            {view.effective === 'pending' && (
                              <>
                                <span className="text-xs font-medium text-bark-light">
                                  Awaiting {view.counterpartName.split(' ')[0]}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () => cancelRequest(view.request.id))
                                  }
                                >
                                  Withdraw
                                </Button>
                              </>
                            )}
                            {(view.effective === 'active' || view.effective === 'overdue') && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={busyId === view.request.id}
                                  onClick={() =>
                                    runAction(view.request.id, () => markReturned(view.request.id))
                                  }
                                >
                                  I returned it
                                </Button>
                                <Link
                                  to={`/messages/${view.request.id}`}
                                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 dark:text-terracotta-300 hover:bg-terracotta-50 dark:hover:bg-terracotta-900/50"
                                >
                                  Chat →
                                </Link>
                                {view.effective === 'overdue' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/60"
                                    onClick={() => setIssueTarget(view)}
                                  >
                                    Report issue
                                  </Button>
                                )}
                              </>
                            )}
                            {(view.effective === 'returned' || view.effective === 'completed') &&
                              !view.iReviewed && (
                                <Button size="sm" onClick={() => setReviewTarget(view)}>
                                  Review {view.counterpartName.split(' ')[0]}
                                </Button>
                              )}
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      {/* NOTIFICATIONS — the derived feed */}
      {tab === 'notifications' && (
        <div className="flex flex-col gap-4">
          <p className="rounded-3xl border border-bark/10 bg-surface/80 px-4 py-3 text-xs leading-relaxed text-bark-light">
            This feed is{' '}
            <span className="font-semibold text-bark">live-derived from your requests</span> —
            approve, return, or review anything and it updates instantly. Nothing goes stale.
          </p>
          {feed.length === 0 ? (
            <EmptyState
              emoji="🔔"
              title="All quiet"
              message="No notifications yet — make a request, or list an item for your neighbors."
            />
          ) : (
            <ul className="flex list-none flex-col gap-2">
              {feed.map((notification) => (
                <li
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-3 rounded-3xl border p-4',
                    notification.kind === 'action'
                      ? 'border-terracotta-200 dark:border-terracotta-800 bg-terracotta-50/60 dark:bg-terracotta-900/50'
                      : 'border-bark/10 bg-surface/70',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1 text-[10px] leading-none',
                      notification.kind === 'action'
                        ? 'text-terracotta-600 dark:text-terracotta-400'
                        : 'text-bark/25',
                    )}
                  >
                    ●
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-bark">{notification.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-bark-light">
                      {notification.body}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] text-bark-light">
                      {relativeTime(notification.createdAt)}
                    </span>
                    {notification.kind === 'action' && notification.requestId && (
                      <Link
                        to="/dashboard"
                        className="text-xs font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-2 hover:underline"
                      >
                        Act →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          view={reviewTarget}
          viewerRole={
            reviewTarget.request.borrowerId === state.currentUser?.id ? 'borrower' : 'lender'
          }
          open
          onClose={() => setReviewTarget(null)}
        />
      )}
      {issueTarget && (
        <ReportIssueModal view={issueTarget} open onClose={() => setIssueTarget(null)} />
      )}
      {editTarget && (
        <EditListingModal listing={editTarget} open onClose={() => setEditTarget(null)} />
      )}
    </div>
  )
}
