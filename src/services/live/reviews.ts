import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore/lite'
import type { AppNotification, BorrowRequest, Listing, Review, User } from '@/types'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'
import { createNotification } from './notifications'
import { maybeCompleteReview } from './requests'

/**
 * Live review service. Same rules as the mock: both parties of a returned
 * borrow review each other ONCE, and the second review completes the
 * lifecycle. The document id is deterministic — `${requestId}_${reviewerId}`
 * — so the one-review-per-deal rule is also enforceable in
 * firestore.rules (create-only-if-absent), not just here.
 */

export interface CreateReviewInput {
  requestId: string
  reviewerId: string
  rating: number
  comment: string
}

export interface ReviewMutationResult {
  review: Review
  request: BorrowRequest | null
  notifications: AppNotification[]
}

/**
 * @deprecated Whole-collection read kept ONLY for the admin panel.
 * Profiles/details/trust use the scoped fetches below — global review
 * hydration was removed in Workstream A.
 */
export async function getReviews(): Promise<Review[]> {
  const q = query(collection(getDb(), COLLECTIONS.reviews), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return fromDocs<Review>(snap.docs)
}

/** Reviews WRITTEN by a user (reviewerId == userId), newest first. */
export async function getReviewsByUser(userId: string): Promise<Review[]> {
  // Single-field equality only (no composite index exists for
  // reviewerId + createdAt, and Workstream A adds none) — the sort
  // runs client-side over this one user's reviews.
  const q = query(collection(getDb(), COLLECTIONS.reviews), where('reviewerId', '==', userId))
  const snap = await getDocs(q)
  return fromDocs<Review>(snap.docs).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
}

/** Reviews ABOUT a user (revieweeId == userId), newest first. */
export async function getReviewsForUser(userId: string): Promise<Review[]> {
  const q = query(
    collection(getDb(), COLLECTIONS.reviews),
    where('revieweeId', '==', userId),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return fromDocs<Review>(snap.docs)
}

export async function getReviewsForListing(listingId: string): Promise<Review[]> {
  const q = query(
    collection(getDb(), COLLECTIONS.reviews),
    where('listingId', '==', listingId),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return fromDocs<Review>(snap.docs)
}

export async function createReview(input: CreateReviewInput): Promise<ReviewMutationResult> {
  const db = getDb()

  const requestSnap = await getDoc(doc(db, COLLECTIONS.requests, input.requestId))
  const request = fromDoc<BorrowRequest>(requestSnap)
  if (!request) throw new ApiError('not-found', 'That borrow request no longer exists.')

  const reviewerSnap = await getDoc(doc(db, COLLECTIONS.users, input.reviewerId))
  const reviewer = fromDoc<User>(reviewerSnap)
  if (!reviewer) throw new ApiError('not-found', 'Your profile could not be found.')

  if (
    request.status !== 'returned' &&
    request.status !== 'completed' &&
    request.status !== 'reviewed'
  ) {
    throw new ApiError('conflict', 'You can review once the listing has been returned.')
  }

  const listingSnap = await getDoc(doc(db, COLLECTIONS.listings, request.listingId))
  const listing = fromDoc<Listing>(listingSnap)
  if (!listing) throw new ApiError('not-found', 'The borrowed listing no longer exists.')

  const isBorrower = request.borrowerId === reviewer.id
  const isLender = listing.ownerId === reviewer.id
  if (!isBorrower && !isLender) {
    throw new ApiError('forbidden', 'Only the two neighbors in this borrow can review it.')
  }
  const revieweeId = isBorrower ? listing.ownerId : request.borrowerId

  const reviewId = `${request.id}_${reviewer.id}`
  const reviewRef = doc(db, COLLECTIONS.reviews, reviewId)
  const existing = await getDoc(reviewRef)
  if (existing.exists()) {
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
    id: reviewId,
    requestId: request.id,
    listingId: listing.id,
    reviewerId: reviewer.id,
    revieweeId,
    reviewerRole: isBorrower ? 'borrower' : 'lender',
    rating,
    comment,
    createdAt: new Date().toISOString(),
  }
  const { id: _id, ...reviewData } = review
  await setDoc(reviewRef, stripUndefined(reviewData))

  const updatedRequest = await maybeCompleteReview(request.id)

  const revieweeSnap = await getDoc(doc(db, COLLECTIONS.users, revieweeId))
  if (!revieweeSnap.exists()) {
    throw new ApiError('not-found', 'That neighbor no longer has an account.')
  }
  const notification = await createNotification(
    revieweeId,
    'review-received',
    'You got a review',
    `${reviewer.name} left you ${rating} star${rating === 1 ? '' : 's'} on "${listing.title}".`,
    { requestId: request.id, listingId: listing.id },
  )

  return { review, request: updatedRequest, notifications: [notification] }
}
