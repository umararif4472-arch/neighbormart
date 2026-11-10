import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  where,
  writeBatch,
} from 'firebase/firestore/lite'
import type {
  AppNotification,
  ArenaSlot,
  BorrowPeriod,
  BorrowRequest,
  Listing,
  User,
} from '@/types'
import { localDateFromToday } from '@/utils/dates'
import {
  assertTransition,
  getReviewProgress,
  requestsCollide,
  validateArenaSlot,
} from '@/utils/requestLifecycle'
import { validateBorrowPeriod } from '@/utils/validation'
import { ApiError } from '../errors'
import { getDb, getFirebaseAuth } from '../firebase'
import { assertNotSuspendedLive } from './users'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'
import { fetchPrivateProfile, mergePrivateProfile, normalizePublicUser } from './privateProfile'
import { createNotification } from './notifications'

/**
 * Live borrow-request service (Firestore) — the same lifecycle and rules
 * as the mock service, enforced by the same pure state machine
 * (utils/requestLifecycle.ts):
 *
 *   pending → approved → active → returned → reviewed
 *   pending → declined / cancelled
 *
 * Multi-document effects (listing status, user stats, notifications)
 * commit in one write batch so a deal can never half-apply. Requests
 * carry a denormalized `ownerId` (the listing's owner) purely so
 * "requests for my listings" is a single query — it is stripped before
 * data reaches the app, exactly like the mock model prescribes.
 */

type RequestDoc = BorrowRequest & { ownerId: string }

const BUSY_STATUSES: BorrowRequest['status'][] = ['pending', 'approved', 'active']

export interface CreateRequestInput {
  listingId: string
  borrowerId: string
  period: BorrowPeriod
  note?: string
  /** Sell listings: the buyer's offer (null = asking price). */
  offerAmount?: number | null
  /** Arena listings: the slot being booked. */
  slot?: ArenaSlot | null
}

export interface RequestMutationResult {
  request: BorrowRequest
  listing: Listing | null
  users: User[]
  notifications: AppNotification[]
}

export interface ReportIssueInput {
  requestId: string
  actorId: string
  reason: string
  note: string
}

function toRequest(docData: RequestDoc): BorrowRequest {
  const { ownerId: _ownerId, ...request } = docData
  return request
}

async function fetchRequest(requestId: string): Promise<RequestDoc> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.requests, requestId))
  const request = fromDoc<RequestDoc>(snap)
  if (!request) throw new ApiError('not-found', 'That borrow request no longer exists.')
  return request
}

async function fetchListing(listingId: string): Promise<Listing> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.listings, listingId))
  const listing = fromDoc<Listing>(snap)
  if (!listing) {
    throw new ApiError('not-found', 'That listing doesn’t exist — it may have been removed.')
  }
  return listing
}

async function fetchUser(userId: string): Promise<User> {
  const db = getDb()
  const snap = await getDoc(doc(db, COLLECTIONS.users, userId))
  if (!snap.exists()) throw new ApiError('not-found', 'That neighbor no longer has an account.')
  const publicUser = normalizePublicUser({
    id: userId,
    ...(snap.data() as Record<string, unknown>),
  })
  // Privacy split: other participants come from the public doc only.
  // The signed-in user's own copy merges the private doc — mutation
  // results are upserted into app state, and a public-only copy would
  // wipe their phone / block list / precise location from the UI.
  let ownUid: string | null = null
  try {
    ownUid = getFirebaseAuth().currentUser?.uid ?? null
  } catch {
    ownUid = null
  }
  if (ownUid !== userId) return publicUser
  return mergePrivateProfile(publicUser, await fetchPrivateProfile(db, userId))
}

export async function getRequestsForUser(userId: string): Promise<BorrowRequest[]> {
  const db = getDb()
  const [asBorrower, asOwner] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.requests), where('borrowerId', '==', userId))),
    getDocs(query(collection(db, COLLECTIONS.requests), where('ownerId', '==', userId))),
  ])
  const byId = new Map<string, BorrowRequest>()
  for (const requestDoc of [
    ...fromDocs<RequestDoc>(asBorrower.docs),
    ...fromDocs<RequestDoc>(asOwner.docs),
  ]) {
    byId.set(requestDoc.id, toRequest(requestDoc))
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export async function getRequestsForListing(listingId: string): Promise<BorrowRequest[]> {
  const snap = await getDocs(
    query(collection(getDb(), COLLECTIONS.requests), where('listingId', '==', listingId)),
  )
  return fromDocs<RequestDoc>(snap.docs).map(toRequest)
}

/** How long a rent period may run, per section (days) — mirrors the mock. */
const RENT_PERIOD_CAPS: Record<string, number> = { vehicles: 30, properties: 366 }

export async function createRequest(input: CreateRequestInput): Promise<RequestMutationResult> {
  const listing = await fetchListing(input.listingId)
  const borrower = await fetchUser(input.borrowerId)
  await assertNotSuspendedLive(borrower.id)

  if (listing.ownerId === borrower.id) {
    throw new ApiError('invalid', 'You can’t request your own listing — it’s already yours!')
  }
  if (listing.status !== 'active') {
    throw new ApiError(
      'conflict',
      listing.status === 'rented'
        ? `"${listing.title}" is out with a neighbor right now.`
        : `"${listing.title}" isn’t taking requests at the moment.`,
    )
  }

  const note = (input.note ?? '').trim().slice(0, 500)
  let offerAmount: number | null = null
  let slot: ArenaSlot | null = null
  let period: BorrowPeriod = { ...input.period }

  if (listing.section === 'arenas') {
    if (!input.slot) throw new ApiError('invalid', 'Pick a slot to book.')
    const slotError = validateArenaSlot(listing, input.slot)
    if (slotError) throw new ApiError('invalid', slotError)
    slot = { ...input.slot }
    period = { start: slot.date, end: slot.date }
  } else if (listing.listingType === 'sell') {
    const offer = input.offerAmount ?? listing.price
    if (!Number.isFinite(offer) || offer <= 0) {
      throw new ApiError('invalid', 'Make an offer above Rs 0.')
    }
    if (!listing.negotiable && offer !== listing.price) {
      throw new ApiError('invalid', 'This listing isn’t negotiable — offer the asking price.')
    }
    if (offer > listing.price * 2) {
      throw new ApiError(
        'invalid',
        'That offer is more than double the asking price — message the owner instead.',
      )
    }
    offerAmount = offer
    const today = localDateFromToday(0)
    period = { start: today, end: today }
  } else {
    const maxDays =
      listing.section === 'items'
        ? listing.details.maxDurationDays
        : (RENT_PERIOD_CAPS[listing.section] ?? 30)
    const validation = validateBorrowPeriod(
      input.period.start.slice(0, 10),
      input.period.end.slice(0, 10),
      maxDays,
    )
    if (!validation.valid) {
      const first = Object.values(validation.errors).find(Boolean)
      throw new ApiError('invalid', first ?? 'Those dates don’t work for this listing.')
    }
  }

  if (listing.listingType !== 'sell') {
    const existing = await getRequestsForListing(listing.id)
    const conflict = existing.some(
      (request) =>
        BUSY_STATUSES.includes(request.status) && requestsCollide(request, { period, slot }),
    )
    if (conflict) {
      throw new ApiError(
        'conflict',
        slot
          ? 'That slot is already booked — pick another time.'
          : 'Someone already has a request for those dates — try different days.',
      )
    }
  }

  const requestData: Omit<RequestDoc, 'id'> = {
    listingId: listing.id,
    borrowerId: borrower.id,
    ownerId: listing.ownerId,
    period,
    note,
    offerAmount,
    slot,
    status: 'pending',
    createdAt: new Date().toISOString(),
    respondedAt: null,
    dueAt: null,
    returnedAt: null,
    issue: null,
  }
  const ref = await addDoc(collection(getDb(), COLLECTIONS.requests), stripUndefined(requestData))

  return {
    request: toRequest({ id: ref.id, ...requestData }),
    listing: null,
    users: [],
    notifications: [],
  }
}

export async function respondToRequest(
  requestId: string,
  decision: 'approved' | 'declined',
  actorId: string,
): Promise<RequestMutationResult> {
  const request = await fetchRequest(requestId)
  const listing = await fetchListing(request.listingId)

  if (listing.ownerId !== actorId) {
    throw new ApiError('forbidden', 'Only the owner can respond to this request.')
  }

  const transition = assertTransition(request.status, decision)
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const siblings = decision === 'approved' ? await getRequestsForListing(listing.id) : []
  if (decision === 'approved' && listing.listingType !== 'sell') {
    const collision = siblings.some(
      (other) =>
        other.id !== request.id &&
        BUSY_STATUSES.includes(other.status) &&
        requestsCollide(other, request),
    )
    if (collision) {
      throw new ApiError(
        'conflict',
        'Another request already holds those dates for this listing. Decline it first or pick different days.',
      )
    }
  }

  const db = getDb()
  const batch = writeBatch(db)
  const updates: Partial<RequestDoc> = {
    status: decision,
    respondedAt: new Date().toISOString(),
  }
  if (decision === 'approved') updates.dueAt = request.period.end
  batch.update(doc(db, COLLECTIONS.requests, requestId), stripUndefined(updates))

  // Sell flow: approving an offer reserves the listing and declines the
  // competing offers, all in the same batch.
  let updatedListing: Listing | null = null
  if (decision === 'approved' && listing.listingType === 'sell') {
    const now = new Date().toISOString()
    for (const other of siblings) {
      if (other.id !== request.id && other.status === 'pending') {
        batch.update(doc(db, COLLECTIONS.requests, other.id), {
          status: 'declined',
          respondedAt: now,
        })
      }
    }
    batch.update(doc(db, COLLECTIONS.listings, listing.id), { status: 'reserved', updatedAt: now })
    updatedListing = { ...listing, status: 'reserved', updatedAt: now }
  }
  await batch.commit()

  return {
    request: toRequest({ ...request, ...updates }),
    listing: updatedListing,
    users: [],
    notifications: [],
  }
}

export async function confirmPickup(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  const request = await fetchRequest(requestId)
  const listing = await fetchListing(request.listingId)
  const owner = await fetchUser(listing.ownerId)
  const borrower = await fetchUser(request.borrowerId)

  if (actorId !== owner.id && actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the lender or borrower can confirm pickup.')
  }

  const transition = assertTransition(request.status, 'active')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const now = new Date().toISOString()
  const batch = writeBatch(getDb())
  batch.update(doc(getDb(), COLLECTIONS.requests, requestId), { status: 'active' })
  batch.update(doc(getDb(), COLLECTIONS.listings, listing.id), {
    status: 'rented',
    updatedAt: now,
  })
  await batch.commit()

  return {
    request: toRequest({ ...request, status: 'active' }),
    listing: { ...listing, status: 'rented', updatedAt: now },
    users: [],
    notifications: [],
  }
}

export async function markReturned(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  const request = await fetchRequest(requestId)
  const listing = await fetchListing(request.listingId)
  const owner = await fetchUser(listing.ownerId)
  const borrower = await fetchUser(request.borrowerId)

  if (actorId !== owner.id && actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the lender or borrower can mark a return.')
  }

  const transition = assertTransition(request.status, 'returned')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const now = new Date().toISOString()
  const onTime = request.dueAt ? Date.parse(now) <= Date.parse(request.dueAt) + 86_399_000 : true

  // Workstream D: stats move by FieldValue.increment on the dotted
  // counter paths — never a read-modify-write of the whole stats
  // object (two deals finishing together used to lose one update).
  // Only the counters this deal actually bumps are written; the
  // rules' stats-delta branch (diff limited to stats, each counter
  // old-or-old+1) is satisfied by construction.
  const borrowerIncrements: Record<string, ReturnType<typeof increment>> = {
    'stats.successfulBorrows': increment(1),
    ...(onTime
      ? { 'stats.onTimeReturns': increment(1) }
      : { 'stats.lateReturns': increment(1) }),
  }
  const ownerIncrements: Record<string, ReturnType<typeof increment>> = {
    'stats.successfulLends': increment(1),
    ...(listing.listingType === 'rent' ? { 'stats.rentalsHosted': increment(1) } : {}),
  }

  const db = getDb()
  const batch = writeBatch(db)
  batch.update(doc(db, COLLECTIONS.requests, requestId), { status: 'returned', returnedAt: now })
  batch.update(doc(db, COLLECTIONS.listings, listing.id), { status: 'active', updatedAt: now })
  batch.update(doc(db, COLLECTIONS.users, borrower.id), borrowerIncrements)
  batch.update(doc(db, COLLECTIONS.users, owner.id), ownerIncrements)
  await batch.commit()

  // The returned copies are the UI's optimistic view (the write above
  // used increments, so these are computed locally for display only).
  const borrowerStats = {
    ...borrower.stats,
    successfulBorrows: borrower.stats.successfulBorrows + 1,
    onTimeReturns: borrower.stats.onTimeReturns + (onTime ? 1 : 0),
    lateReturns: borrower.stats.lateReturns + (onTime ? 0 : 1),
  }
  const ownerStats = {
    ...owner.stats,
    successfulLends: owner.stats.successfulLends + 1,
    rentalsHosted: owner.stats.rentalsHosted + (listing.listingType === 'rent' ? 1 : 0),
  }

  return {
    request: toRequest({ ...request, status: 'returned', returnedAt: now }),
    listing: { ...listing, status: 'active', updatedAt: now },
    users: [
      { ...owner, stats: ownerStats },
      { ...borrower, stats: borrowerStats },
    ],
    notifications: [],
  }
}

/**
 * Transition returned → reviewed once BOTH sides have reviewed. Called by
 * the review service after inserting a review; returns the updated
 * request (null when the pair isn't complete yet).
 */
export async function maybeCompleteReview(requestId: string): Promise<BorrowRequest | null> {
  const request = await fetchRequest(requestId)
  const listing = await fetchListing(request.listingId).catch(() => null)
  if (!listing || (request.status !== 'returned' && request.status !== 'completed')) return null

  const snap = await getDocs(
    query(collection(getDb(), COLLECTIONS.reviews), where('requestId', '==', requestId)),
  )
  const existing = fromDocs<{ reviewerId: string }>(snap.docs)
  if (!getReviewProgress(existing, listing.ownerId, request.borrowerId).allReviewed) {
    return null
  }

  const transition = assertTransition(request.status, 'reviewed')
  if (!transition.ok) return null

  const batch = writeBatch(getDb())
  batch.update(doc(getDb(), COLLECTIONS.requests, requestId), { status: 'reviewed' })
  await batch.commit()
  return toRequest({ ...request, status: 'reviewed' })
}

/**
 * Close a no-return-leg deal (Phase 5): a sale handed over, or an arena
 * slot played. Owner-only; batch-committed like every other mutation.
 */
export async function markCompleted(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  const request = await fetchRequest(requestId)
  const listing = await fetchListing(request.listingId)
  const owner = await fetchUser(listing.ownerId)
  const borrower = await fetchUser(request.borrowerId)

  if (listing.ownerId !== actorId) {
    throw new ApiError('forbidden', 'Only the owner can complete this deal.')
  }

  const transition = assertTransition(request.status, 'completed')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const now = new Date().toISOString()
  const db = getDb()
  const batch = writeBatch(db)
  batch.update(doc(db, COLLECTIONS.requests, requestId), { status: 'completed' })

  let updatedListing: Listing | null = null
  let updatedOwner: User = owner
  if (listing.listingType === 'sell') {
    batch.update(doc(db, COLLECTIONS.listings, listing.id), { status: 'sold', updatedAt: now })
    updatedListing = { ...listing, status: 'sold', updatedAt: now }
    // Workstream D: increment only the bumped counter (see
    // markReturned); the returned owner copy is display-only.
    batch.update(doc(db, COLLECTIONS.users, owner.id), {
      'stats.salesCompleted': increment(1),
    })
    updatedOwner = {
      ...owner,
      stats: { ...owner.stats, salesCompleted: owner.stats.salesCompleted + 1 },
    }
  } else if (listing.listingType === 'rent') {
    batch.update(doc(db, COLLECTIONS.users, owner.id), {
      'stats.rentalsHosted': increment(1),
    })
    updatedOwner = {
      ...owner,
      stats: { ...owner.stats, rentalsHosted: owner.stats.rentalsHosted + 1 },
    }
  }
  await batch.commit()

  return {
    request: toRequest({ ...request, status: 'completed' }),
    listing: updatedListing,
    users: [updatedOwner, borrower],
    notifications: [],
  }
}

export async function cancelRequest(
  requestId: string,
  actorId: string,
): Promise<RequestMutationResult> {
  const request = await fetchRequest(requestId)
  if (request.borrowerId !== actorId) {
    throw new ApiError('forbidden', 'Only the borrower can withdraw a request.')
  }

  const transition = assertTransition(request.status, 'cancelled')
  if (!transition.ok) {
    throw new ApiError('conflict', transition.error)
  }

  const db = getDb()
  const batch = writeBatch(db)
  batch.update(doc(db, COLLECTIONS.requests, requestId), { status: 'cancelled' })

  // A cancelled approved offer frees the listing (reserved → active).
  let updatedListing: Listing | null = null
  if (request.status === 'approved') {
    const listing = await fetchListing(request.listingId).catch(() => null)
    if (listing && listing.listingType === 'sell' && listing.status === 'reserved') {
      const now = new Date().toISOString()
      batch.update(doc(db, COLLECTIONS.listings, listing.id), { status: 'active', updatedAt: now })
      updatedListing = { ...listing, status: 'active', updatedAt: now }
    }
  }
  await batch.commit()

  return {
    request: toRequest({ ...request, status: 'cancelled' }),
    listing: updatedListing,
    users: [],
    notifications: [],
  }
}

/**
 * Escalation path for problem borrows. Flags the request, writes a
 * moderation record to the `reports` collection, and pushes a stored
 * notification to the other party — without mutating lifecycle status.
 */
export async function reportIssue(input: ReportIssueInput): Promise<RequestMutationResult> {
  const request = await fetchRequest(input.requestId)
  const listing = await fetchListing(request.listingId)
  const owner = await fetchUser(listing.ownerId)
  const borrower = await fetchUser(request.borrowerId)

  if (input.actorId !== owner.id && input.actorId !== borrower.id) {
    throw new ApiError('forbidden', 'Only the two neighbors in this borrow can report an issue.')
  }
  if (request.issue) {
    throw new ApiError('conflict', 'An issue was already reported for this borrow.')
  }
  if (input.reason.trim().length < 3) {
    throw new ApiError('invalid', 'Pick what went wrong.')
  }

  const issue = {
    reportedBy: input.actorId,
    reason: input.reason.trim(),
    note: input.note.trim().slice(0, 500),
    reportedAt: new Date().toISOString(),
  }

  const db = getDb()
  const batch = writeBatch(db)
  batch.update(doc(db, COLLECTIONS.requests, request.id), { issue })
  const reportRef = doc(collection(db, COLLECTIONS.reports))
  batch.set(
    reportRef,
    stripUndefined({
      kind: 'borrow-issue',
      requestId: request.id,
      listingId: listing.id,
      reportedBy: input.actorId,
      reason: issue.reason,
      note: issue.note,
      status: 'open',
      createdAt: issue.reportedAt,
    }),
  )
  await batch.commit()

  const recipientId = input.actorId === owner.id ? borrower.id : owner.id
  const reporter = input.actorId === owner.id ? owner : borrower
  const notification = await createNotification(
    recipientId,
    'issue-reported',
    'Issue reported on a borrow',
    `${reporter.name} flagged "${issue.reason}" on the ${listing.title} borrow — please check your messages.`,
    { requestId: request.id, listingId: listing.id },
  )

  return {
    request: toRequest({ ...request, issue }),
    listing: null,
    users: [],
    notifications: [notification],
  }
}
