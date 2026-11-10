import { useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { reviewsApi } from '@/services'

/**
 * Scoped review loading (Workstream A). Reviews are fetched per user
 * profile or per listing — never as a global hydration — and upserted
 * into AppContext, where the existing consumers (trust calculator,
 * profile sections, listing reviews, dashboard review progress) read
 * them exactly as before.
 */

/** Reviews about a user AND reviews they wrote (both directions feed trust + profile). */
export function useReviewsForUser(userId: string | undefined | null) {
  const { dispatch } = useApp()

  useEffect(() => {
    if (!userId) return
    let alive = true
    void Promise.all([
      reviewsApi.getReviewsForUser(userId),
      reviewsApi.getReviewsByUser(userId),
    ])
      .then(([about, by]) => {
        if (!alive) return
        const merged = [...about, ...by]
        if (merged.length > 0) dispatch({ type: 'REVIEWS_UPSERTED', reviews: merged })
      })
      .catch(() => {
        // Reviews are progressive detail; a failure leaves the
        // section empty rather than breaking the page.
      })
    return () => {
      alive = false
    }
  }, [userId, dispatch])
}

/** Reviews attached to one listing (listing detail page). */
export function useReviewsForListing(listingId: string | undefined | null) {
  const { dispatch } = useApp()

  useEffect(() => {
    if (!listingId) return
    let alive = true
    void reviewsApi
      .getReviewsForListing(listingId)
      .then((reviews) => {
        if (!alive) return
        if (reviews.length > 0) dispatch({ type: 'REVIEWS_UPSERTED', reviews })
      })
      .catch(() => {
        // See useReviewsForUser — never break the page for reviews.
      })
    return () => {
      alive = false
    }
  }, [listingId, dispatch])
}
