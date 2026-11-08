import type { AppNotification, BorrowPeriod, BorrowRequest, Item, User } from '@/types'
import { periodsOverlap } from '@/utils/dates'
import { assertTransition, getReviewProgress } from '@/utils/requestLifecycle'
import { validateBorrowPeriod } from '@/utils/validation'
import { ApiError } from './errors'
import { createNotification } from './notifications'
import { clone, findItem, findRequest, findUser, getStore, nextId, simulateLatency } from './store'

/**
 * Borrow request service — mutations flow through the lifecycle state
 * machine (utils/requestLifecycle.ts) via assertTransition, so the rules
 * exist in exactly one place:
 *
 *   pending → approved → active → returned → reviewed
 *   pending → declined / cancelled       active + past due ⇒ overdue (derived)
 *
 * Notifications for lifecycle events are NOT stored — the dashboard derives
 * them live from request state (utils/derivedNotifications.ts). Only
 * push-like events that can't be derived (chat messages, issue reports)
 * create stored notifications.
 */

/** Statuses that reserve an item's calendar. */
const BUSY_STATUSES: BorrowRequest['status'][] = ['pending', 'approved', 'active']

export interface CreateRequestInput {
  itemId: string
  borrowerId: string
  period: BorrowPeriod
  note?: string
}

/** Everything a mutation might touch, so context can sync in one dispatch. */
export interface RequestMutationResult {
  request: BorrowRequest
  /** Updated when a transition changes availability (pickup/return). */
  item: Item | null
  /** Updated when a transition changes user stats (returns). */
  users: User[]
  /** Stored push notifications (issue reports; lifecycle events are derived). */
  notifications: AppNotification[]
}

export interface ReportIssueInput {
  requestId: string
  actorId: string
  reason: string
  note: string
}

export async function getRequestsForUser(userId: string): Promise<BorrowRequest[]> {
  await simulateLatency()
  const store = getStore()
  const visible = store.requests.filter((request) => {
    if (request.borrowerId === userId) return true
    const item = store.items.find((i) => i.id === request.itemId)
    return item?.ownerId === userId
  })
  // Newest first.
  visible.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return clone(visible)
}

/** All requests for one item (item detail: "expected back"). */
export async function getRequestsForItem(itemId: string): Promise<BorrowRequest[]> {
  await simulateLatency(80, 200)
  const list = getStore().requests.filter((r) => r.itemId === itemId)
  return clone(list)
}

export async function createRequest(input: CreateRequestInput): Promise<RequestMutationResult> {
  await simulateLatency(300, 600)

  const item = findItem(input.itemId)
  const borrower = findUser(input.borrowerId)

  if (item.ownerId === borrower.id) {
    throw new ApiError('invalid', 'You can\u2019t request your own item — it\u2019s already yours!')
  }
  if (item.availability !== 'available') {
    throw new ApiError(
      'conflict',
      item.availability === 'borrowed'
        ? `"${item.title}" is out with a neighbor right now.`
        : `"${item.title}" isn\u2019t taking requests at the moment.`,
    )
  }

  // The same pure validation the modal runs — the server double-checks.
  const validation = validateBorrowPeriod(
    input.period.start.slice(0, 10),
    input.period.end.slice(0, 10),
    item.borrowTerms.maxDurationDays,
  )
  if (!validation.valid) {
    const first = Object.values(validation.errors).find(Boolean)
    throw new ApiError('invalid', first ?? 'Those dates don\u2019t work for this item.')
  }

  const note = (input.note ?? '').trim().slice(0, 500)

  // Overlap guard: no double-booking the same calendar days.
  const conflict = getStore().requests.some(
    (request) =>
      request.itemId === item.id &&
      BUSY_STATUSES.includes(request.status) &&
      periodsOverlap(request.period, input.period),
  )
  if (conflict) {
    throw new ApiError(
      'conflict',
      'Someone already has a request for those dates — try different days.',
    )
  }

  const request: BorrowRequest = {
    id: nextId('req'),
    itemId: item.id,
    borrowerId: borrower.id,
    period: { ...input.period },
    note,
    status: 'pending',
    createdAt: new Date().toISOString(),
    respondedAt: null,
    dueAt: null,
    returnedAt: null,
    issue: null,
  }
  getStore().requests.push(request)

  return { request: clone(request), item: null, users: [], notifications: [] }
}

export async function respondToRequest(
  requestId: string,
  decision: 'approved' | 'declined',
  actorId: string,
): Promise<RequestMutationResult> {
  await simulateLatency(200, 450)

  const request = findRequest(requestId)
  const item = findItem(request.itemId)

  if (item.ownerId !== actorId) {
    throw new ApiError('forbidden', 'Only the owner can respond to this request.')
  }

  // The state machine is the only authority on transitions.
  const transition = assertTransition(request.status, decision)
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  // Approving a window that collides with another reserved request fails.
  if (decision === 'approved') {
    const collision = getStore().requests.some(
      (other) =>
        other.id !== request.id &&
        other.itemId === item.id &&
        BUSY_STATUSES.includes(other.status) &&
        periodsOverlap(other.period, request.period),
    )
    if (collision) {
      throw new ApiError(
        'conflict',
        'Another request already holds those dates for this item. Decline it first or pick different days.',
      )
    }
  }

  request.status = decision
  request.respondedAt = new Date().toISOString()
  if (decision === 'approved') request.dueAt = request.period.end

  return { request: clone(request), item: null, users: [], notifications: [] }
}

export async function confirmPickup(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  await simulateLatency(200, 450)

  const request = findRequest(requestId)
  const item = findItem(request.itemId)
  const owner = findUser(item.ownerId)
  const borrower = findUser(request.borrowerId)

  if (actorId !== owner.id && actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the lender or borrower can confirm pickup.')
  }

  const transition = assertTransition(request.status, 'active')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  request.status = 'active'
  item.availability = 'borrowed'

  return { request: clone(request), item: clone(item), users: [], notifications: [] }
}

export async function markReturned(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  await simulateLatency(200, 450)

  const request = findRequest(requestId)
  const item = findItem(request.itemId)
  const owner = findUser(item.ownerId)
  const borrower = findUser(request.borrowerId)

  if (actorId !== owner.id && actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the lender or borrower can mark a return.')
  }

  const transition = assertTransition(request.status, 'returned')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const now = new Date().toISOString()
  request.status = 'returned'
  request.returnedAt = now
  item.availability = 'available'

  // The on-time/late split is what feeds the trust score — this is the
  // moment the score's inputs change (visible on profiles immediately).
  const onTime = request.dueAt ? Date.parse(now) <= Date.parse(request.dueAt) + 86_399_000 : true
  borrower.stats.successfulBorrows += 1
  if (onTime) borrower.stats.onTimeReturns += 1
  else borrower.stats.lateReturns += 1
  owner.stats.successfulLends += 1

  return {
    request: clone(request),
    item: clone(item),
    users: [clone(owner), clone(borrower)],
    notifications: [],
  }
}

/**
 * Transition returned → reviewed once BOTH sides have reviewed. Called by
 * the review service after inserting a review; returns the updated request
 * (null when the pair isn't complete yet — the request stays in "returned",
 * i.e. the visible pending-review sub-state).
 */
export function maybeCompleteReview(requestId: string): BorrowRequest | null {
  const request = findRequest(requestId)
  const item = getStore().items.find((i) => i.id === request.itemId)
  if (!item || request.status !== 'returned') return null

  const existing = getStore().reviews.filter((r) => r.requestId === requestId)
  if (!getReviewProgress(existing, item.ownerId, request.borrowerId).allReviewed) return null

  const transition = assertTransition(request.status, 'reviewed')
  if (!transition.ok) return null
  request.status = 'reviewed'
  return clone(request)
}

export async function cancelRequest(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  await simulateLatency(150, 350)

  const request = findRequest(requestId)
  if (request.borrowerId !== actorId) {
    throw new ApiError('forbidden', 'Only the borrower can withdraw a request.')
  }

  const transition = assertTransition(request.status, 'cancelled')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  request.status = 'cancelled'
  return { request: clone(request), item: null, users: [], notifications: [] }
}

/**
 * Escalation path for problem borrows (e.g. an overdue item that never came
 * back). Flags the request and pushes a stored notification to the other
 * party — it intentionally does NOT mutate lifecycle status.
 */
export async function reportIssue(input: ReportIssueInput): Promise<RequestMutationResult> {
  await simulateLatency(200, 450)

  const request = findRequest(input.requestId)
  const item = findItem(request.itemId)
  const owner = findUser(item.ownerId)
  const borrower = findUser(request.borrowerId)

  if (input.actorId !== owner.id && input.actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the two neighbors in this borrow can report an issue.')
  }
  if (request.issue) {
    throw new ApiError('conflict', 'An issue was already reported for this borrow.')
  }
  if (input.reason.trim().length < 3) {
    throw new ApiError('invalid', 'Pick what went wrong.')
  }

  request.issue = {
    reportedBy: input.actorId,
    reason: input.reason.trim(),
    note: input.note.trim().slice(0, 500),
    reportedAt: new Date().toISOString(),
  }

  const recipientId = input.actorId === owner.id ? borrower.id : owner.id
  const reporter = input.actorId === owner.id ? owner : borrower
  const notification = createNotification(
    recipientId,
    'issue-reported',
    'Issue reported on a borrow',
    `${reporter.name} flagged "${request.issue.reason}" on the ${item.title} borrow — please check your messages.`,
    { requestId: request.id, itemId: item.id },
  )

  return { request: clone(request), item: null, users: [], notifications: [notification] }
}
