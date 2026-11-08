import { describe, expect, it } from 'vitest'
import type { AppNotification, BorrowRequest, Item, Review, User } from '@/types'
import { buildNotificationFeed } from './derivedNotifications'

/**
 * The derived notification feed — projected from request state, so it can
 * never go stale. Fixtures keep everything deterministic.
 */

const NOW = new Date('2026-09-05T12:00:00')

const me: User = {
  id: 'u-me',
  name: 'Maya Chen',
  avatarUrl: '',
  bio: '',
  neighborhood: '',
  homeLocation: { lat: 0, lng: 0 },
  joinedAt: '2025-01-01',
  phoneVerified: true,
  emailVerified: true,
  responseRate: 0.9,
  avgResponseMinutes: 30,
  stats: { successfulLends: 5, successfulBorrows: 5, onTimeReturns: 4, lateReturns: 1 },
  badges: [],
}

const other: User = { ...me, id: 'u-other', name: 'Tom Alvarez' }
const nina: User = { ...me, id: 'u-nina', name: 'Nina Kowalski' }

const myItem: Item = {
  id: 'i-mine',
  ownerId: 'u-me',
  title: 'Cordless Drill',
  description: '',
  category: 'Tools',
  condition: '',
  photos: [],
  location: { lat: 0, lng: 0 },
  availability: 'available',
  borrowTerms: {
    maxDurationDays: 7,
    depositAmount: null,
    dailyFee: null,
    pickupPreference: 'either',
    pickupInstructions: 'Porch',
  },
  createdAt: '2026-01-01',
}

const theirItem: Item = {
  ...myItem,
  id: 'i-theirs',
  ownerId: 'u-other',
  title: 'Karaoke Machine',
  availability: 'borrowed',
}

function request(overrides: Partial<BorrowRequest> = {}): BorrowRequest {
  return {
    id: 'r1',
    itemId: 'i-mine',
    borrowerId: 'u-other',
    period: { start: '2026-09-06T00:00:00', end: '2026-09-08T00:00:00' },
    note: '',
    status: 'pending',
    createdAt: '2026-09-04T10:00:00.000Z',
    respondedAt: null,
    dueAt: null,
    returnedAt: null,
    issue: null,
    ...overrides,
  }
}

function run(requests: BorrowRequest[], reviews: Review[] = [], stored: AppNotification[] = []) {
  return buildNotificationFeed({
    userId: 'u-me',
    requests,
    items: [myItem, theirItem],
    users: [me, other, nina],
    reviews,
    storedNotifications: stored,
    now: NOW,
  })
}

describe('buildNotificationFeed — lifecycle projection', () => {
  it('incoming pending → actionable "New borrow request"', () => {
    const { feed, attentionCount } = run([request()])
    const item = feed.find((n) => n.id === 'dnf-r1-pending-in')
    expect(item?.kind).toBe('action')
    expect(item?.title).toBe('New borrow request')
    expect(item?.body).toContain('Tom Alvarez')
    expect(attentionCount).toBe(1)
  })

  it('outgoing pending → informational waiting notice', () => {
    const outgoing = request({ itemId: 'i-theirs', borrowerId: 'u-me' })
    const { feed } = run([outgoing])
    const item = feed.find((n) => n.id === 'dnf-r1-pending-out')
    expect(item?.kind).toBe('info')
    expect(item?.title).toBe('Waiting on Tom')
  })

  it('approved → success for borrower, pickup-confirm action for lender', () => {
    const incoming = request({ status: 'approved', respondedAt: '2026-09-04T11:00:00.000Z' })
    const lenderFeed = run([incoming]).feed
    expect(lenderFeed.find((n) => n.id === 'dnf-r1-approved')?.kind).toBe('action')

    const outgoing = request({ itemId: 'i-theirs', borrowerId: 'u-me', status: 'approved' })
    const borrowerFeed = run([outgoing]).feed
    const notice = borrowerFeed.find((n) => n.id === 'dnf-r1-approved')
    expect(notice?.kind).toBe('info')
    expect(notice?.title).toContain('approved 🎉')
  })

  it('declined → notice for the borrower only', () => {
    const outgoing = request({
      itemId: 'i-theirs',
      borrowerId: 'u-me',
      status: 'declined',
      respondedAt: '2026-09-04T11:00:00.000Z',
    })
    const { feed } = run([outgoing])
    expect(feed.find((n) => n.id === 'dnf-r1-declined')?.title).toBe('Declined this time')
  })

  it('due within 2 days → due-soon reminder', () => {
    const active = request({ status: 'active', dueAt: '2026-09-06T00:00:00' })
    const { feed } = run([active])
    const item = feed.find((n) => n.id === 'dnf-r1-due-soon')
    expect(item?.type).toBe('return-reminder')
    expect(item?.body).toContain('Cordless Drill')
  })

  it('past due → overdue escalation item, not due-soon', () => {
    const overdue = request({ status: 'active', dueAt: '2026-09-02T00:00:00' })
    const { feed, attentionCount } = run([overdue])
    const item = feed.find((n) => n.id === 'dnf-r1-overdue')
    expect(item?.kind).toBe('action')
    expect(item?.type).toBe('overdue')
    expect(feed.find((n) => n.id === 'dnf-r1-due-soon')).toBeUndefined()
    expect(attentionCount).toBe(1)
  })

  it('returned + I still owe a review → actionable review-requested', () => {
    const returned = request({
      status: 'returned',
      returnedAt: '2026-09-03T18:00:00.000Z',
      dueAt: '2026-09-04T00:00:00',
    })
    const { feed } = run([returned], [])
    const item = feed.find((n) => n.id === 'dnf-r1-review-requested')
    expect(item?.kind).toBe('action')
    expect(item?.body).toContain('Tom')
  })

  it('returned + I reviewed but they have not → "waiting" info, no action', () => {
    const returned = request({ status: 'returned', returnedAt: '2026-09-03T18:00:00.000Z' })
    const reviews: Review[] = [
      {
        id: 'rev-1',
        requestId: 'r1',
        itemId: 'i-mine',
        reviewerId: 'u-me',
        revieweeId: 'u-other',
        reviewerRole: 'lender',
        rating: 5,
        comment: 'Great',
        createdAt: '2026-09-03T19:00:00.000Z',
      },
    ]
    const { feed } = run([returned], reviews)
    const waiting = feed.find((n) => n.id === 'dnf-r1-awaiting-their-review')
    expect(waiting?.kind).toBe('info')
    expect(feed.find((n) => n.id === 'dnf-r1-review-requested')).toBeUndefined()
  })

  it('reviews received recently surface as info items', () => {
    const review: Review = {
      id: 'rev-9',
      requestId: 'r-x',
      itemId: 'i-mine',
      reviewerId: 'u-nina',
      revieweeId: 'u-me',
      reviewerRole: 'borrower',
      rating: 5,
      comment: 'Spotless return, cookies included.',
      createdAt: '2026-09-02T10:00:00.000Z',
    }
    const { feed } = run([], [review])
    const item = feed.find((n) => n.id === 'dnf-review-rev-9')
    expect(item?.title).toBe('You got a 5-star review')
    expect(item?.body).toContain('Nina Kowalski')
  })

  it('merges stored push notifications (messages) and sorts action-first', () => {
    const incoming = request()
    const stored = [
      {
        id: 'n1',
        userId: 'u-me',
        type: 'message-received' as const,
        title: 'New message from Tom',
        body: '…',
        requestId: 'r1',
        itemId: 'i-mine',
        read: false,
        createdAt: '2026-09-05T10:00:00.000Z',
      },
    ]
    const { feed } = run([incoming], [], stored)
    expect(feed).toHaveLength(2)
    // Both are actionable → newest wins: the fresh message, then the request.
    expect(feed[0].id).toBe('stf-n1')
    expect(feed[0].kind).toBe('action')
    expect(feed[1].id).toBe('dnf-r1-pending-in')
  })

  it('action items sort ahead of info regardless of time', () => {
    const incoming = request() // action, older createdAt
    const overdue = request({
      id: 'r2',
      itemId: 'i-theirs',
      borrowerId: 'u-me',
      status: 'active',
      dueAt: '2026-09-01T00:00:00',
    })
    const { feed } = run([incoming, overdue])
    expect(feed.every((n) => n.kind === 'action')).toBe(true)
  })
})
