import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EffectiveRequestStatus } from '@/types'
import { useApp } from '@/context/AppContext'
import { useMyRequests, type RequestView } from '@/hooks/useRequests'
import { useDerivedNotifications } from '@/hooks/useDerivedNotifications'
import { useTrustScore } from '@/hooks/useTrustScore'
import { relativeTime } from '@/utils/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, listingStatusTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { TrustBadge } from '@/components/ui/Trust'
import { cn } from '@/utils/cn'
import { RequestCard } from './RequestCard'
import { ReviewModal } from './ReviewModal'
import { ReportIssueModal } from './ReportIssueModal'

/**
 * /dashboard — the request lifecycle, live.
 *
 * Three tabs (Lending / Borrowing / Notifications). Rows are grouped by the
 * state machine's EFFECTIVE status (incl. derived "overdue"), every action
 * calls the service then syncs context, and the notification tab is a
 * derived projection of request state — nothing here needs a refresh.
 */

type TabId = 'lending' | 'borrowing' | 'notifications'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'lending', label: 'Lending' },
  { id: 'borrowing', label: 'Borrowing' },
  { id: 'notifications', label: 'Notifications' },
]

/** Lending groups — lifecycle order, most attention first. */
const LENDING_GROUPS: Array<{ status: EffectiveRequestStatus; label: string }> = [
  { status: 'pending', label: 'Waiting on you' },
  { status: 'overdue', label: 'Overdue — needs a nudge' },
  { status: 'active', label: 'Out with neighbors' },
  { status: 'approved', label: 'Pickup to confirm' },
  { status: 'returned', label: 'Reviews pending' },
  { status: 'reviewed', label: 'Fully wrapped up' },
  { status: 'declined', label: 'Declined' },
  { status: 'cancelled', label: 'Cancelled' },
]

/** Borrowing groups — what's current first, then history. */
const BORROWING_GROUPS: Array<{ status: EffectiveRequestStatus; label: string }> = [
  { status: 'overdue', label: 'Overdue — return it or check in' },
  { status: 'active', label: 'Out now' },
  { status: 'approved', label: 'Pickup to plan' },
  { status: 'pending', label: 'Awaiting a yes' },
  { status: 'returned', label: 'Reviews pending' },
  { status: 'reviewed', label: 'Fully wrapped up' },
  { status: 'declined', label: 'Declined' },
]

export function DashboardPage() {
  const { state } = useApp()
  const {
    incoming,
    outgoing,
    respondToRequest,
    confirmPickup,
    markReturned,
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

  const myListings = useMemo(
    () => state.listings.filter((listing) => listing.ownerId === state.currentUser?.id),
    [state.listings, state.currentUser],
  )

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
          <div className="flex items-center gap-3 rounded-3xl border border-bark/10 bg-white px-4 py-3 shadow-sm">
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
                className="text-[11px] font-semibold text-terracotta-700 underline-offset-2 hover:underline"
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
        className="no-scrollbar flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-bark/10 bg-white p-1 shadow-sm sm:w-fit"
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
          className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {actionError}
        </p>
      )}

      {/* LENDING */}
      {tab === 'lending' && (
        <div className="flex flex-col gap-6">
          <section aria-label="Your items" className="flex flex-col gap-3">
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
                    <Button variant="secondary">List an item</Button>
                  </Link>
                }
              />
            ) : (
              <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {myListings.map((item) => (
                  <li key={item.id}>
                    <Link
                      to={`/listing/${item.id}`}
                      className="flex h-full flex-col justify-between gap-2 rounded-3xl border border-bark/10 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <p className="line-clamp-2 text-xs font-semibold text-bark">{item.title}</p>
                      <Badge tone={listingStatusTone(item.status)} dot>
                        {item.status === 'rented' ? 'Out' : item.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
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
                            {view.effective === 'approved' && (
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
                                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 hover:bg-terracotta-50"
                                >
                                  Chat →
                                </Link>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-700 hover:bg-red-50"
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
                                  className="rounded-full px-3 py-1.5 text-xs font-semibold text-terracotta-700 hover:bg-terracotta-50"
                                >
                                  Chat →
                                </Link>
                                {view.effective === 'overdue' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-700 hover:bg-red-50"
                                    onClick={() => setIssueTarget(view)}
                                  >
                                    Report issue
                                  </Button>
                                )}
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

      {/* NOTIFICATIONS — the derived feed */}
      {tab === 'notifications' && (
        <div className="flex flex-col gap-4">
          <p className="rounded-3xl border border-bark/10 bg-white/70 px-4 py-3 text-xs leading-relaxed text-bark-light">
            This feed is{' '}
            <span className="font-semibold text-bark">live-derived from your requests</span> —
            approve, return, or review anything and it updates instantly. Nothing goes stale.
          </p>
          {feed.length === 0 ? (
            <EmptyState
              emoji="🔔"
              title="All quiet"
              message="No notifications yet — request something, or lend something out."
            />
          ) : (
            <ul className="flex list-none flex-col gap-2">
              {feed.map((notification) => (
                <li
                  key={notification.id}
                  className={cn(
                    'flex items-start gap-3 rounded-3xl border p-4',
                    notification.kind === 'action'
                      ? 'border-terracotta-200 bg-terracotta-50/60'
                      : 'border-bark/10 bg-white/60',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1 text-[10px] leading-none',
                      notification.kind === 'action' ? 'text-terracotta-600' : 'text-bark/25',
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
                        className="text-xs font-semibold text-terracotta-700 underline-offset-2 hover:underline"
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
    </div>
  )
}
