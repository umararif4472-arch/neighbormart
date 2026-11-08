import { useCallback, useMemo } from 'react'
import type { BorrowRequest, EffectiveRequestStatus, Item, User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useNow } from './useNow'
import { requestsApi, reviewsApi, toErrorMessage } from '@/services'
import { findById } from '@/utils/collections'
import {
  effectiveStatus,
  findScheduleConflicts,
  getReviewProgress,
  STATUS_META,
} from '@/utils/requestLifecycle'

/**
 * The current user's requests + lifecycle actions.
 *
 * Views (incoming/outgoing, grouped by EFFECTIVE status — including the
 * derived "overdue") are computed here through the state machine, so no
 * component duplicates status logic. Every action calls the service, then
 * syncs all affected entities (request, item, users) into context in one
 * dispatch sequence — fully live, no refresh anywhere.
 */

export interface RequestView {
  request: BorrowRequest
  /** Stored status + derived overdue. */
  effective: EffectiveRequestStatus
  statusMeta: (typeof STATUS_META)[EffectiveRequestStatus]
  /** Always defined — views without an item are filtered out. */
  item: Item
  itemTitle: string
  itemPhoto: string | null
  /** The other party in this request. */
  counterpart: User | undefined
  counterpartName: string
  counterpartAvatar: string | undefined
  /** Schedule conflicts with other PENDING requests on the same item. */
  conflicts: ReturnType<typeof findScheduleConflicts>
  /** Review progress once returned. */
  review: ReturnType<typeof getReviewProgress> | null
  /** Has the current user already reviewed? */
  iReviewed: boolean
}

function buildView(
  request: BorrowRequest,
  items: readonly Item[],
  users: readonly User[],
  requests: readonly BorrowRequest[],
  reviews: readonly import('@/types').Review[],
  now: Date,
  currentUserId: string,
): RequestView | null {
  const item = findById(items, request.itemId)
  if (!item) return null
  const isBorrower = request.borrowerId === currentUserId
  const counterpart = findById(users, isBorrower ? item.ownerId : request.borrowerId)
  const effective = effectiveStatus(request, now)
  const reviewsForRequest = reviews.filter((r) => r.requestId === request.id)

  const review =
    request.status === 'returned' || request.status === 'reviewed'
      ? getReviewProgress(reviewsForRequest, item.ownerId, request.borrowerId)
      : null

  return {
    request,
    effective,
    statusMeta: STATUS_META[effective],
    item,
    itemTitle: item.title,
    itemPhoto: item.photos[0] ?? null,
    counterpart,
    counterpartName: counterpart?.name ?? 'A neighbor',
    counterpartAvatar: counterpart?.avatarUrl,
    conflicts: findScheduleConflicts(request, requests),
    review,
    iReviewed: review
      ? request.borrowerId === currentUserId
        ? review.borrowerReviewed
        : review.lenderReviewed
      : false,
  }
}

export function useMyRequests() {
  const { state, dispatch } = useApp()
  const now = useNow()
  const currentUser = state.currentUser

  const allViews = useMemo(() => {
    if (!currentUser) return []
    return state.requests
      .map((request) =>
        buildView(
          request,
          state.items,
          state.users,
          state.requests,
          state.reviews,
          now,
          currentUser.id,
        ),
      )
      .filter((view): view is RequestView => view !== null)
  }, [state.requests, state.items, state.users, state.reviews, now, currentUser])

  const incoming = useMemo(() => {
    if (!currentUser) return []
    return allViews.filter((view) => view.item.ownerId === currentUser.id)
  }, [allViews, currentUser])

  const outgoing = useMemo(() => {
    if (!currentUser) return []
    return allViews.filter((view) => view.request.borrowerId === currentUser.id)
  }, [allViews, currentUser])

  /** Apply a service mutation result to context in one dispatch sequence. */
  const applyResult = useCallback(
    (result: requestsApi.RequestMutationResult) => {
      dispatch({ type: 'REQUESTS_UPSERTED', requests: [result.request] })
      if (result.item) dispatch({ type: 'ITEMS_UPSERTED', items: [result.item] })
      if (result.users.length > 0) dispatch({ type: 'USERS_UPSERTED', users: result.users })
      if (result.notifications.length > 0) {
        dispatch({ type: 'NOTIFICATIONS_APPENDED', notifications: result.notifications })
      }
    },
    [dispatch],
  )

  const sendRequest = useCallback(
    async (input: requestsApi.CreateRequestInput) => {
      const result = await requestsApi.createRequest(input)
      applyResult(result)
      return result.request
    },
    [applyResult],
  )

  const respondToRequest = useCallback(
    async (requestId: string, decision: 'approved' | 'declined') => {
      if (!currentUser) throw new Error('Not signed in')
      const result = await requestsApi.respondToRequest(requestId, decision, currentUser.id)
      applyResult(result)
      return result.request
    },
    [applyResult, currentUser],
  )

  const confirmPickup = useCallback(
    async (requestId: string) => {
      if (!currentUser) throw new Error('Not signed in')
      const result = await requestsApi.confirmPickup(requestId, currentUser.id)
      applyResult(result)
      return result.request
    },
    [applyResult, currentUser],
  )

  const markReturned = useCallback(
    async (requestId: string) => {
      if (!currentUser) throw new Error('Not signed in')
      const result = await requestsApi.markReturned(requestId, currentUser.id)
      applyResult(result)
      return result.request
    },
    [applyResult, currentUser],
  )

  const cancelRequest = useCallback(
    async (requestId: string) => {
      if (!currentUser) throw new Error('Not signed in')
      const result = await requestsApi.cancelRequest(requestId, currentUser.id)
      applyResult(result)
      return result.request
    },
    [applyResult, currentUser],
  )

  /**
   * Leave a review for a returned borrow. Syncs the review (which feeds the
   * reviewed user's trust score) and, if this completed the pair, the
   * returned → reviewed transition.
   */
  const sendReview = useCallback(
    async (input: reviewsApi.CreateReviewInput) => {
      const result = await reviewsApi.createReview(input)
      dispatch({ type: 'REVIEWS_APPENDED', reviews: [result.review] })
      if (result.request) {
        dispatch({ type: 'REQUESTS_UPSERTED', requests: [result.request] })
      }
      if (result.notifications.length > 0) {
        dispatch({ type: 'NOTIFICATIONS_APPENDED', notifications: result.notifications })
      }
      return result
    },
    [dispatch],
  )

  const reportIssue = useCallback(
    async (input: requestsApi.ReportIssueInput) => {
      const result = await requestsApi.reportIssue(input)
      applyResult(result)
      return result.request
    },
    [applyResult],
  )

  return {
    incoming,
    outgoing,
    allViews,
    sendRequest,
    respondToRequest,
    confirmPickup,
    markReturned,
    cancelRequest,
    sendReview,
    reportIssue,
    toErrorMessage,
  }
}
