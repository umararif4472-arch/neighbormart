import type { AppNotification, BorrowRequest, Review } from '@/types'
import { ApiError } from './errors'
import { maybeCompleteReview } from './requests'
import { createNotification } from './notifications'
import { clone, findRequest, findUser, getStore, nextId, simulateLatency } from './store'

/**
 * Review service. Both parties of a completed borrow can review each other
 * ONCE (double-review attempts get a clean conflict error), reviews feed the
 * trust score through the pure calculator, and the SECOND review completes
 * the returned → reviewed lifecycle transition.
 */

export interface CreateReviewInput {
  requestId: string
  reviewerId: string
  rating: number
  comment: string
}

export interface ReviewMutationResult {
  review: Review
  /** The updated request when this review completed the pair. */
  request: BorrowRequest | null
  notifications: AppNotification[]
}

export async function getReviews(): Promise<Review[]> {
  await simulateLatency()
  return clone(getStore().reviews)
}

export async function getReviewsForUser(userId: string): Promise<Review[]> {
  await simulateLatency(80, 250)
  const list = getStore()
    .reviews.filter((r) => r.revieweeId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return clone(list)
}

export async function getReviewsForListing(listingId: string): Promise<Review[]> {
  await simulateLatency(80, 250)
  const list = getStore()
    .reviews.filter((r) => r.listingId === listingId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return clone(list)
}

export async function createReview(input: CreateReviewInput): Promise<ReviewMutationResult> {
  await simulateLatency(300, 600)

  const request = findRequest(input.requestId)
  const reviewer = findUser(input.reviewerId)

  // The state machine owns the rule: reviews happen once the deal is done
  // ("returned", "completed" for sales/arena slots, or "reviewed"
  // pre-transition — the duplicate check below makes a second review
  // impossible in practice).
  if (
    request.status !== 'returned' &&
    request.status !== 'completed' &&
    request.status !== 'reviewed'
  ) {
    throw new ApiError('conflict', 'You can review once the deal is complete.')
  }

  // Determine the other party from the request (lender = listing owner).
  const listing = getStore().listings.find((l) => l.id === request.listingId)
  if (!listing) throw new ApiError('not-found', 'The borrowed listing no longer exists.')

  const isBorrower = request.borrowerId === reviewer.id
  const isLender = listing.ownerId === reviewer.id
  if (!isBorrower && !isLender) {
    throw new ApiError('forbidden', 'Only the two neighbors in this borrow can review it.')
  }

  const revieweeId = isBorrower ? listing.ownerId : request.borrowerId

  // EDGE CASE: one review per party per request — enforced here in one
  // place, so a double attempt gets a clear error instead of a duplicate.
  const duplicate = getStore().reviews.some(
    (r) => r.requestId === request.id && r.reviewerId === reviewer.id,
  )
  if (duplicate) {
    throw new ApiError('conflict', 'You already left a review for this borrow — one each!')
  }

  const rating = Math.round(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError('invalid', 'Rating must be 1–5 stars.')
  }
  const comment = input.comment.trim()
  if (comment.length < 3 || comment.length > 500) {
    throw new ApiError('invalid', 'Reviews need a short comment (3–500 characters).')
  }

  const review: Review = {
    id: nextId('rev'),
    requestId: request.id,
    listingId: listing.id,
    reviewerId: reviewer.id,
    revieweeId,
    reviewerRole: isBorrower ? 'borrower' : 'lender',
    rating,
    comment,
    createdAt: new Date().toISOString(),
  }
  getStore().reviews.push(review)

  // If this was the second of the pair, complete the lifecycle transition
  // (the request leaves its "pending review" sub-state).
  const updatedRequest = maybeCompleteReview(request.id)

  const reviewee = findUser(revieweeId)
  const notification = createNotification(
    reviewee.id,
    'review-received',
    'You got a review',
    `${reviewer.name} left you ${rating} star${rating === 1 ? '' : 's'} on "${listing.title}".`,
    { requestId: request.id, listingId: listing.id },
  )

  return { review: clone(review), request: updatedRequest, notifications: [notification] }
}
