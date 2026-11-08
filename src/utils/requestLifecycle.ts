import type { EffectiveRequestStatus, ISODateString, RequestStatus } from '@/types'
import type { RequestStatus as Status } from '@/types'
import { periodsOverlap } from './dates'

/**
 * THE request lifecycle state machine. One place computes transitions and
 * effective display state — services call assertTransition() before mutating,
 * components call effectiveStatus()/STATUS_META to render. No status strings
 * are scattered anywhere else.
 *
 *   pending ──approve──→ approved ──confirm pickup──→ active ──return──→ returned
 *      │                     │                                        │
 *      ├──decline→ declined  └──cancel→ cancelled                     └──both reviewed──→ reviewed
 *      └──cancel→ cancelled
 *
 *   active + past dueAt (and not returned) ⇒ *overdue* — derived at display
 *   time so it appears/disappears without writes.
 */

export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  pending: ['approved', 'declined', 'cancelled'],
  approved: ['active', 'cancelled'],
  active: ['returned'],
  returned: ['reviewed'],
  reviewed: [],
  declined: [],
  cancelled: [],
}

/** Terminal statuses have no outgoing transitions. */
export function isTerminalStatus(status: RequestStatus): boolean {
  return REQUEST_TRANSITIONS[status].length === 0
}

/** Quick boolean check (assertTransition gives the why). */
export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return assertTransition(from, to).ok
}

/**
 * Validate a transition. Returns a friendly error message on failure —
 * services throw ApiError('conflict', msg); UIs can inline it.
 */
export function assertTransition(
  from: RequestStatus,
  to: RequestStatus,
): { ok: true } | { ok: false; error: string } {
  if (from === to) return { ok: false, error: `This request is already ${from}.` }
  if (isTerminalStatus(from)) {
    return { ok: false, error: `This request is ${from} — nothing further can happen.` }
  }
  if (!REQUEST_TRANSITIONS[from].includes(to)) {
    return { ok: false, error: `A ${from} request can't become ${to}.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Effective (display) status + time-derived states
// ---------------------------------------------------------------------------

/** End of the due day: the on-time deadline (matches the service's rule). */
export function endOfDueDayMs(dueAt: ISODateString): number {
  return Date.parse(dueAt) + 86_399_000
}

/** Past-due check for active borrows (badge colors, reminders, escalation). */
export function isOverdue(
  request: { status: string; dueAt: ISODateString | null },
  now: Date = new Date(),
): boolean {
  if (request.status !== 'active' || !request.dueAt) return false
  return Date.parse(now.toISOString()) > endOfDueDayMs(request.dueAt)
}

/** Due within N days (return reminders for active borrows). */
export function isDueSoon(
  request: { status: RequestStatus; dueAt: ISODateString | null },
  now: Date = new Date(),
  withinDays = 2,
): boolean {
  if (request.status !== 'active' || !request.dueAt) return false
  const diffDays = (Date.parse(request.dueAt) - Date.parse(now.toISOString())) / 86_400_000
  return diffDays >= 0 && diffDays <= withinDays
}

/**
 * The status the UI should show. "overdue" is derived on the fly from
 * active + past-due; everything else maps 1:1 to the stored status.
 */
export function effectiveStatus(
  request: { status: RequestStatus; dueAt: ISODateString | null },
  now: Date = new Date(),
): EffectiveRequestStatus {
  if (isOverdue(request, now)) return 'overdue'
  return request.status
}

// ---------------------------------------------------------------------------
// Display metadata — the single source for every status chip in the app
// ---------------------------------------------------------------------------

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'terracotta' | 'moss'

export const STATUS_META: Record<
  EffectiveRequestStatus,
  { label: string; tone: StatusTone; hint: string }
> = {
  pending: { label: 'Pending', tone: 'warning', hint: 'Awaiting the lender’s decision' },
  approved: { label: 'Approved', tone: 'success', hint: 'Pickup not yet confirmed' },
  active: { label: 'Out now', tone: 'terracotta', hint: 'Borrow in progress' },
  overdue: { label: 'Overdue', tone: 'danger', hint: 'Past the agreed return date' },
  returned: { label: 'Pending review', tone: 'moss', hint: 'Returned — review still outstanding' },
  reviewed: {
    label: 'Reviewed ✓',
    tone: 'neutral',
    hint: 'Both neighbors shared their experience',
  },
  declined: { label: 'Declined', tone: 'danger', hint: 'The lender declined this time' },
  cancelled: { label: 'Cancelled', tone: 'neutral', hint: 'Withdrawn before approval' },
}

// ---------------------------------------------------------------------------
// Review progress (the "pending review" sub-state)
// ---------------------------------------------------------------------------

export interface ReviewProgress {
  lenderReviewed: boolean
  borrowerReviewed: boolean
  allReviewed: boolean
  /** Who still owes a review ('both' when neither has). */
  awaitingReviewFrom: 'lender' | 'borrower' | 'both' | null
}

/**
 * Which parties have reviewed a request. A request with one review stays in
 * "returned" (visible pending-review sub-state); once both are in, the
 * service transitions it to "reviewed".
 */
export function getReviewProgress(
  reviewsForRequest: ReadonlyArray<{ reviewerId: string }>,
  lenderId: string,
  borrowerId: string,
): ReviewProgress {
  const lenderReviewed = reviewsForRequest.some((r) => r.reviewerId === lenderId)
  const borrowerReviewed = reviewsForRequest.some((r) => r.reviewerId === borrowerId)
  const allReviewed = lenderReviewed && borrowerReviewed
  const awaitingReviewFrom = allReviewed
    ? null
    : !lenderReviewed && !borrowerReviewed
      ? 'both'
      : lenderReviewed
        ? 'borrower'
        : 'lender'
  return { lenderReviewed, borrowerReviewed, allReviewed, awaitingReviewFrom }
}

// ---------------------------------------------------------------------------
// Schedule conflicts (overlapping pending requests on the same item)
// ---------------------------------------------------------------------------

export interface ScheduleConflict {
  id: string
  period: { start: ISODateString; end: ISODateString }
}

/**
 * Pending requests for the same item whose dates collide with `candidate`.
 * Surfaced in the dashboard BEFORE approval so a lender notices before
 * double-booking (the service re-checks at approve time as the backstop).
 */
export function findScheduleConflicts(
  candidate: { id?: string; itemId: string; period: { start: ISODateString; end: ISODateString } },
  requests: ReadonlyArray<{
    id: string
    itemId: string
    status: Status
    period: { start: ISODateString; end: ISODateString }
  }>,
): ScheduleConflict[] {
  return requests
    .filter(
      (other) =>
        other.id !== candidate.id &&
        other.itemId === candidate.itemId &&
        other.status === 'pending' &&
        periodsOverlap(other.period, candidate.period),
    )
    .map(({ id, period }) => ({ id, period }))
}
