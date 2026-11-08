import { describe, expect, it } from 'vitest'
import type { BorrowRequest, RequestStatus } from '@/types'
import {
  assertTransition,
  canTransition,
  effectiveStatus,
  findScheduleConflicts,
  getReviewProgress,
  isDueSoon,
  isOverdue,
  isTerminalStatus,
  REQUEST_TRANSITIONS,
  STATUS_META,
} from './requestLifecycle'

const NOW = new Date('2026-09-05T12:00:00')
const iso = (date: string) => new Date(date).toISOString()

function request(overrides: Partial<BorrowRequest>): BorrowRequest {
  return {
    id: 'r1',
    itemId: 'i1',
    borrowerId: 'u-borrower',
    period: { start: '2026-09-01T00:00:00', end: '2026-09-04T00:00:00' },
    note: '',
    status: 'pending',
    createdAt: iso('2026-08-30'),
    respondedAt: null,
    dueAt: null,
    returnedAt: null,
    issue: null,
    ...overrides,
  }
}

describe('REQUEST_TRANSITIONS (the machine)', () => {
  it('follows the happy path pending → approved → active → returned → reviewed', () => {
    expect(canTransition('pending', 'approved')).toBe(true)
    expect(canTransition('approved', 'active')).toBe(true)
    expect(canTransition('active', 'returned')).toBe(true)
    expect(canTransition('returned', 'reviewed')).toBe(true)
  })

  it('allows pending → declined and pending/approved → cancelled', () => {
    expect(canTransition('pending', 'declined')).toBe(true)
    expect(canTransition('pending', 'cancelled')).toBe(true)
    expect(canTransition('approved', 'cancelled')).toBe(true)
  })

  it('rejects every illegal jump', () => {
    expect(canTransition('pending', 'active')).toBe(false) // must be approved first
    expect(canTransition('pending', 'returned')).toBe(false)
    expect(canTransition('approved', 'returned')).toBe(false) // must be active first
    expect(canTransition('active', 'reviewed')).toBe(false) // must be returned first
    expect(canTransition('declined', 'approved')).toBe(false)
    expect(canTransition('reviewed', 'active')).toBe(false)
    expect(canTransition('returned', 'active')).toBe(false)
  })

  it('marks declined, cancelled, reviewed as terminal', () => {
    expect(isTerminalStatus('declined')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('reviewed')).toBe(true)
    expect(isTerminalStatus('pending')).toBe(false)
  })

  it('every stored status has a transition list defined', () => {
    const statuses: RequestStatus[] = [
      'pending',
      'approved',
      'active',
      'returned',
      'reviewed',
      'declined',
      'cancelled',
    ]
    for (const status of statuses) {
      expect(Array.isArray(REQUEST_TRANSITIONS[status])).toBe(true)
    }
  })
})

describe('assertTransition', () => {
  it('returns ok for legal moves and errors for illegal ones', () => {
    expect(assertTransition('pending', 'approved')).toEqual({ ok: true })
    const result = assertTransition('pending', 'returned')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/can't become/)
  })
})

describe('effectiveStatus (derived overdue)', () => {
  it('an active request due in the future is just active', () => {
    const active = request({ status: 'active', dueAt: '2026-09-06T00:00:00' })
    expect(effectiveStatus(active, NOW)).toBe('active')
  })

  it('an active request past its due day is overdue — derived, not stored', () => {
    const overdue = request({ status: 'active', dueAt: '2026-09-02T00:00:00' })
    expect(effectiveStatus(overdue, NOW)).toBe('overdue')
    // The stored status never changed:
    expect(overdue.status).toBe('active')
  })

  it('returns within the due day are NOT overdue (on-time until end of due day)', () => {
    const sameDay = request({ status: 'active', dueAt: '2026-09-05T00:00:00' })
    expect(effectiveStatus(sameDay, new Date('2026-09-05T23:00:00'))).toBe('active')
    expect(effectiveStatus(sameDay, new Date('2026-09-06T00:00:01'))).toBe('overdue')
  })

  it('returned/reviewed/declined pass through unchanged', () => {
    expect(effectiveStatus(request({ status: 'returned' }), NOW)).toBe('returned')
    expect(effectiveStatus(request({ status: 'reviewed' }), NOW)).toBe('reviewed')
    expect(effectiveStatus(request({ status: 'declined' }), NOW)).toBe('declined')
  })
})

describe('isOverdue / isDueSoon', () => {
  it('overdue only applies to active requests with a due date', () => {
    expect(isOverdue(request({ status: 'returned', dueAt: '2026-09-01T00:00:00' }), NOW)).toBe(
      false,
    )
    expect(isOverdue(request({ status: 'active', dueAt: null }), NOW)).toBe(false)
    expect(isOverdue(request({ status: 'active', dueAt: '2026-09-01T00:00:00' }), NOW)).toBe(true)
  })

  it('due-soon fires within the window but not when overdue or far away', () => {
    expect(isDueSoon(request({ status: 'active', dueAt: '2026-09-06T00:00:00' }), NOW)).toBe(true)
    expect(isDueSoon(request({ status: 'active', dueAt: '2026-09-09T00:00:00' }), NOW)).toBe(false)
    expect(isDueSoon(request({ status: 'active', dueAt: '2026-09-01T00:00:00' }), NOW)).toBe(false)
    expect(isDueSoon(request({ status: 'returned', dueAt: '2026-09-06T00:00:00' }), NOW)).toBe(
      false,
    )
  })
})

describe('getReviewProgress (pending-review sub-state)', () => {
  const lenderId = 'u-lender'
  const borrowerId = 'u-borrower'

  it('no reviews yet → both awaiting', () => {
    const progress = getReviewProgress([], lenderId, borrowerId)
    expect(progress).toEqual({
      lenderReviewed: false,
      borrowerReviewed: false,
      allReviewed: false,
      awaitingReviewFrom: 'both',
    })
  })

  it('one review in → exactly one party awaiting', () => {
    const progress = getReviewProgress([{ reviewerId: borrowerId }], lenderId, borrowerId)
    expect(progress.borrowerReviewed).toBe(true)
    expect(progress.lenderReviewed).toBe(false)
    expect(progress.awaitingReviewFrom).toBe('lender')
  })

  it('both reviews in → allReviewed', () => {
    const progress = getReviewProgress(
      [{ reviewerId: borrowerId }, { reviewerId: lenderId }],
      lenderId,
      borrowerId,
    )
    expect(progress.allReviewed).toBe(true)
    expect(progress.awaitingReviewFrom).toBe(null)
  })
})

describe('findScheduleConflicts (overlapping pending requests)', () => {
  const requests = [
    request({
      id: 'a',
      itemId: 'i-pasta',
      status: 'pending',
      period: { start: '2026-09-07T00:00:00', end: '2026-09-09T00:00:00' },
    }),
    request({
      id: 'b',
      itemId: 'i-pasta',
      status: 'pending',
      period: { start: '2026-09-08T00:00:00', end: '2026-09-10T00:00:00' },
    }),
    request({
      id: 'c',
      itemId: 'i-pasta',
      status: 'pending',
      period: { start: '2026-09-20T00:00:00', end: '2026-09-22T00:00:00' },
    }),
    request({
      id: 'd',
      itemId: 'i-other',
      status: 'pending',
      period: { start: '2026-09-08T00:00:00', end: '2026-09-10T00:00:00' },
    }),
    request({
      id: 'e',
      itemId: 'i-pasta',
      status: 'declined',
      period: { start: '2026-09-07T00:00:00', end: '2026-09-09T00:00:00' },
    }),
  ]

  it('flags the request that overlaps another pending one on the same item', () => {
    const conflicts = findScheduleConflicts(requests[0], requests)
    expect(conflicts.map((c) => c.id)).toEqual(['b'])
  })

  it('does not flag non-overlapping, other-item, or non-pending requests', () => {
    expect(findScheduleConflicts(requests[2], requests)).toEqual([])
    expect(findScheduleConflicts(requests[3], requests)).toEqual([])
    // 'e' is declined — as a CANDIDATE it still sees pending overlaps, but
    // it never appears in anyone else's conflicts (only pending ones do).
    expect(findScheduleConflicts(requests[0], requests).map((c) => c.id)).not.toContain('e')
    expect(findScheduleConflicts(requests[4], requests).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('is symmetric — both overlapping requests see the conflict', () => {
    expect(findScheduleConflicts(requests[1], requests).map((c) => c.id)).toEqual(['a'])
  })
})

describe('STATUS_META', () => {
  it('covers every effective status with a label and tone', () => {
    const statuses = [
      'pending',
      'approved',
      'active',
      'overdue',
      'returned',
      'reviewed',
      'declined',
      'cancelled',
    ] as const
    for (const status of statuses) {
      expect(STATUS_META[status].label).toBeTruthy()
      expect(STATUS_META[status].tone).toBeTruthy()
      expect(STATUS_META[status].hint).toBeTruthy()
    }
  })
})
