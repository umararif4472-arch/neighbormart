import type { AppNotification, BorrowRequest, Listing, Review, User } from '@/types'
import { formatDate, formatDueLabel, relativeTime } from './dates'
import { findById } from './collections'
import { effectiveStatus, getReviewProgress, isDueSoon, isOverdue } from './requestLifecycle'

/**
 * THE notification feed, derived — not a hardcoded list.
 *
 * Lifecycle items (new request, approved, declined, due soon, overdue,
 * review requested, reviews received, all-done) are computed live from the
 * request state each render, so they can never go stale: act on a request
 * and its notifications update instantly, overdue appears when the clock
 * passes the due date, and completed reviews remove their own prompts.
 *
 * Only genuinely push-like events (a new chat message) are stored — the
 * rest is a projection of state.
 */

export type NotificationKind = 'action' | 'info'

export interface DerivedNotification {
  /** Stable id (drives React keys + dedupe against stored ones). */
  id: string
  type: AppNotification['type']
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  requestId?: string
  listingId?: string
  /** Stored notifications carry a read flag; derived ones act as unread. */
  read?: boolean
  /** Whether this row came from the store (message pushes) or was derived. */
  stored?: boolean
}

export interface DerivedFeedInput {
  userId: string
  requests: readonly BorrowRequest[]
  listings: readonly Listing[]
  users: readonly User[]
  reviews: readonly Review[]
  /** Stored push notifications (messages) to merge into the feed. */
  storedNotifications: readonly AppNotification[]
  now?: Date
}

const REVIEW_INFO_WINDOW_DAYS = 30

function firstName(name: string | undefined): string {
  return name?.split(' ')[0] ?? 'your neighbor'
}

/**
 * Build the merged feed: derived lifecycle notifications (sorted with
 * action items first) + stored push notifications, newest first overall.
 */
export function buildNotificationFeed(input: DerivedFeedInput): {
  feed: DerivedNotification[]
  attentionCount: number
} {
  const { userId, requests, listings, users, reviews, storedNotifications } = input
  const now = input.now ?? new Date()
  const derived: DerivedNotification[] = []

  for (const request of requests) {
    const listing = findById(listings, request.listingId)
    if (!listing) continue
    const isLender = listing.ownerId === userId
    const isBorrower = request.borrowerId === userId
    if (!isLender && !isBorrower) continue

    const borrower = findById(users, request.borrowerId)
    const owner = findById(users, listing.ownerId)
    const counterpart = isLender ? borrower : owner
    const other = firstName(counterpart?.name)
    const status = effectiveStatus(request, now)

    const push = (
      partial: Omit<DerivedNotification, 'id' | 'requestId' | 'listingId'> & { suffix: string },
    ) => {
      const { suffix, ...rest } = partial
      derived.push({
        id: `dnf-${request.id}-${suffix}`,
        requestId: request.id,
        listingId: listing.id,
        ...rest,
      })
    }

    switch (status) {
      case 'pending':
        if (isLender) {
          push({
            suffix: 'pending-in',
            type: 'request-received',
            kind: 'action',
            title: 'New borrow request',
            body: `${borrower?.name ?? 'A neighbor'} wants to borrow your ${listing.title}.`,
            createdAt: request.createdAt,
          })
        } else {
          push({
            suffix: 'pending-out',
            type: 'request-received',
            kind: 'info',
            title: `Waiting on ${other}`,
            body: `Your request for ${listing.title} is still pending.`,
            createdAt: request.createdAt,
          })
        }
        break
      case 'approved':
        push({
          suffix: 'approved',
          type: 'request-approved',
          kind: isLender ? 'action' : 'info',
          title: isLender ? 'Confirm pickup' : 'Request approved 🎉',
          body: isLender
            ? `Once ${other} picks up the ${listing.title}, confirm it here — the clock starts then.`
            : `${other} approved the ${listing.title} — plan pickup via messages.`,
          createdAt: request.respondedAt ?? request.createdAt,
        })
        break
      case 'active':
      case 'overdue': {
        if (isOverdue(request, now)) {
          push({
            suffix: 'overdue',
            type: 'overdue',
            kind: 'action',
            title: isLender ? `Your ${listing.title} is overdue` : `${listing.title} is overdue`,
            body: isLender
              ? `${borrower?.name ?? 'The borrower'} is past the return date (${formatDate(request.dueAt!)}). Message them or report an issue.`
              : `${formatDueLabel(request.dueAt!)} — return it or check in with ${other}.`,
            createdAt: request.dueAt!,
          })
        } else if (isDueSoon(request, now)) {
          push({
            suffix: 'due-soon',
            type: 'return-reminder',
            kind: 'info',
            title: isLender ? `${listing.title} due back soon` : 'Return reminder',
            body: isLender
              ? `${other} should return your ${listing.title} by ${formatDate(request.dueAt!)}.`
              : `${listing.title} — ${formatDueLabel(request.dueAt!)}. Plan it with ${other}.`,
            createdAt: request.dueAt!,
          })
        } else {
          // Active with a comfortable due date — quiet for now, but the
          // dashboard still shows it under "Out now".
        }
        break
      }
      case 'returned': {
        const progress = getReviewProgress(
          reviews.filter((r) => r.requestId === request.id),
          listing.ownerId,
          request.borrowerId,
        )
        const iReviewed = isLender ? progress.lenderReviewed : progress.borrowerReviewed
        const counterpartReviewed = isLender ? progress.borrowerReviewed : progress.lenderReviewed
        if (!iReviewed) {
          push({
            suffix: 'review-requested',
            type: 'review-requested',
            kind: 'action',
            title: `Review your ${isLender ? 'lend' : 'borrow'}`,
            body: `How did the ${listing.title} exchange with ${other} go? Reviews feed their trust score.`,
            createdAt: request.returnedAt ?? request.createdAt,
          })
        } else if (!counterpartReviewed) {
          push({
            suffix: 'awaiting-their-review',
            type: 'review-received',
            kind: 'info',
            title: 'Thanks for your review!',
            body: `Waiting for ${other} to review the ${listing.title} exchange too.`,
            createdAt: request.returnedAt ?? request.createdAt,
          })
        } else {
          push({
            suffix: 'all-reviewed',
            type: 'return-confirmed',
            kind: 'info',
            title: 'All wrapped up 🌟',
            body: `The ${listing.title} borrow is returned and reviewed by both of you.`,
            createdAt: request.returnedAt ?? request.createdAt,
          })
        }
        break
      }
      case 'declined':
        if (isBorrower) {
          push({
            suffix: 'declined',
            type: 'request-declined',
            kind: 'info',
            title: 'Declined this time',
            body: `${other} can't lend the ${listing.title} for those dates. No harm done — try different days.`,
            createdAt: request.respondedAt ?? request.createdAt,
          })
        }
        break
      case 'cancelled':
        push({
          suffix: 'cancelled',
          type: 'request-declined',
          kind: 'info',
          title: 'Request cancelled',
          body: `The ${listing.title} request was withdrawn before approval.`,
          createdAt: request.respondedAt ?? request.createdAt,
        })
        break
      case 'reviewed':
        // Terminal & fully wrapped — the all-reviewed notice under
        // 'returned' already covered it; don't duplicate terminal noise.
        break
    }

    // Flagged borrows always surface as actionable, on top of status feed.
    if (request.issue && request.issue.reportedBy === userId) {
      // Already reported — the escalation is visible on the request row.
    }
  }

  // Reviews received recently (info) — derived from review state too.
  const reviewCutoff = now.getTime() - REVIEW_INFO_WINDOW_DAYS * 86_400_000
  for (const review of reviews) {
    if (review.revieweeId !== userId) continue
    const when = Date.parse(review.createdAt)
    if (when < reviewCutoff) continue
    const reviewer = findById(users, review.reviewerId)
    derived.push({
      id: `dnf-review-${review.id}`,
      type: 'review-received',
      kind: 'info',
      title: `You got a ${review.rating}-star review`,
      body: `${reviewer?.name ?? 'A neighbor'}: "${review.comment.slice(0, 80)}${review.comment.length > 80 ? '…' : ''}"`,
      createdAt: review.createdAt,
      requestId: review.requestId,
      listingId: review.listingId,
    })
  }

  // Merge stored push notifications (messages etc.).
  const stored: DerivedNotification[] = storedNotifications
    .filter((n) => n.userId === userId)
    .map((n) => ({
      id: `stf-${n.id}`,
      type: n.type,
      kind: n.type === 'message-received' ? 'action' : 'info',
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      requestId: n.requestId,
      listingId: n.listingId,
      read: n.read,
      stored: true,
    }))

  const feed = [...derived, ...stored].sort((a, b) => {
    // Actionable items first, then newest first.
    if (a.kind !== b.kind) return a.kind === 'action' ? -1 : 1
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })

  const attentionCount = feed.filter(
    (n) => n.kind === 'action' && (n.stored ? n.read !== true : true),
  ).length

  return { feed, attentionCount }
}

/** Friendly display label for a feed row's age. */
export function feedTimestamp(createdAt: string, now: Date = new Date()): string {
  return relativeTime(createdAt, now.toISOString())
}
