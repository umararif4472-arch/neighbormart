import type {
  ArenaListing,
  ArenaSlot,
  BorrowPeriod,
  EffectiveRequestStatus,
  ISODateString,
  RequestStatus,
} from '@/types'
import type { RequestStatus as Status } from '@/types'
import { localDateFromToday, periodsOverlap } from './dates'

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
  // approved → completed covers the no-return-leg deals (Phase 5):
  // a sale handed over, or an arena slot that has been played.
  approved: ['active', 'cancelled', 'completed'],
  active: ['returned'],
  returned: ['reviewed'],
  completed: ['reviewed'],
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
  completed: { label: 'Completed', tone: 'success', hint: 'Deal done — no return needed' },
  reviewed: {
    label: 'Reviewed ✓',
    tone: 'neutral',
    hint: 'Both neighbors shared their experience',
  },
  declined: { label: 'Declined', tone: 'danger', hint: 'The lender declined this time' },
  cancelled: { label: 'Cancelled', tone: 'neutral', hint: 'Withdrawn before approval' },
}

// ---------------------------------------------------------------------------
// Arena slots (Phase 5) — collision + booking-window validation
// ---------------------------------------------------------------------------

/** Two arena slots collide when they share a date and their times overlap. */
export function slotsOverlap(a: ArenaSlot, b: ArenaSlot): boolean {
  return a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime
}

/** Collision test that understands both date periods and arena slots. */
export function requestsCollide(
  a: { period: BorrowPeriod; slot: ArenaSlot | null },
  b: { period: BorrowPeriod; slot: ArenaSlot | null },
): boolean {
  if (a.slot && b.slot) return slotsOverlap(a.slot, b.slot)
  return periodsOverlap(a.period, b.period)
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * Arena slot rules: inside the advance-booking window, on the slot grid
 * defined by opening hours + slotMinutes, and far enough ahead to
 * satisfy the minimum notice. Returns a friendly error or null. Used by
 * BOTH service backends and the booking UI, so they can never drift.
 */
export function validateArenaSlot(listing: ArenaListing, slot: ArenaSlot): string | null {
  const d = listing.details
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(slot.date) ||
    !TIME_RE.test(slot.startTime) ||
    !TIME_RE.test(slot.endTime)
  ) {
    return 'Pick a valid date and time for your slot.'
  }
  if (slot.date < localDateFromToday(0)) return 'That date is in the past.'
  if (slot.date > localDateFromToday(d.advanceBooking.maxAdvanceDays)) {
    return `This arena takes bookings at most ${d.advanceBooking.maxAdvanceDays} days ahead.`
  }
  const opens = toMinutes(d.openingHours.opens)
  const closes = toMinutes(d.openingHours.closes)
  const start = toMinutes(slot.startTime)
  const end = toMinutes(slot.endTime)
  if (start < opens || end > closes || end <= start) {
    return `Slots run between ${d.openingHours.opens} and ${d.openingHours.closes}.`
  }
  if ((start - opens) % d.slotMinutes !== 0 || (end - opens) % d.slotMinutes !== 0) {
    return `Slots start on the ${d.slotMinutes}-minute grid from ${d.openingHours.opens}.`
  }
  const startMs = Date.parse(`${slot.date}T${slot.startTime}:00`)
  if (startMs < Date.now() + d.advanceBooking.minAdvanceHours * 3_600_000) {
    return `Book at least ${d.advanceBooking.minAdvanceHours} hours ahead.`
  }
  return null
}

/** All bookable slots for one day (start/end pairs on the grid). */
export function arenaSlotsForDay(
  listing: ArenaListing,
): Array<{ startTime: string; endTime: string }> {
  const d = listing.details
  const opens = toMinutes(d.openingHours.opens)
  const closes = toMinutes(d.openingHours.closes)
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  const slots: Array<{ startTime: string; endTime: string }> = []
  for (let start = opens; start + d.slotMinutes <= closes; start += d.slotMinutes) {
    slots.push({ startTime: fmt(start), endTime: fmt(start + d.slotMinutes) })
  }
  return slots
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
  candidate: {
    id?: string
    listingId: string
    period: { start: ISODateString; end: ISODateString }
  },
  requests: ReadonlyArray<{
    id: string
    listingId: string
    status: Status
    period: { start: ISODateString; end: ISODateString }
  }>,
): ScheduleConflict[] {
  return requests
    .filter(
      (other) =>
        other.id !== candidate.id &&
        other.listingId === candidate.listingId &&
        other.status === 'pending' &&
        periodsOverlap(other.period, candidate.period),
    )
    .map(({ id, period }) => ({ id, period }))
}
