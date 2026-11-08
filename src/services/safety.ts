import type { Report, ReportReason, ReportTargetType } from '@/types'
import { ApiError } from './errors'
import { clone, getStore, nextId, simulateLatency } from './store'
import { sanitizeMultiline } from '@/utils/sanitize'

/**
 * Safety service (Phase 8, mock backend): reports, moderation, and
 * account deletion. The live backend mirrors these signatures against
 * Firestore; Firestore rules enforce the same permissions server-side.
 */

export interface CreateReportInput {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details?: string
}

const REPORT_REASONS: ReadonlyArray<ReportReason> = [
  'scam',
  'fake',
  'inappropriate',
  'spam',
  'safety',
  'other',
]

function findActor(actorId: string) {
  const actor = getStore().users.find((u) => u.id === actorId)
  if (!actor) throw new ApiError('unauthenticated', 'Sign in to continue.')
  return actor
}

function requireAdmin(actorId: string) {
  const actor = findActor(actorId)
  if (actor.role !== 'admin') {
    throw new ApiError('forbidden', 'Only moderators can access the reports queue.')
  }
  return actor
}

/** File a report about a listing or a user. */
export async function createReport(actorId: string, input: CreateReportInput): Promise<Report> {
  await simulateLatency(150, 300)
  findActor(actorId)
  if (!REPORT_REASONS.includes(input.reason)) {
    throw new ApiError('invalid', 'Pick a reason for the report.')
  }
  const store = getStore()
  let targetOwnerId: string
  if (input.targetType === 'listing') {
    const listing = store.listings.find((l) => l.id === input.targetId)
    if (!listing) throw new ApiError('not-found', 'Listing not found.')
    if (listing.ownerId === actorId) {
      throw new ApiError('invalid', 'You cannot report your own listing.')
    }
    targetOwnerId = listing.ownerId
  } else {
    const user = store.users.find((u) => u.id === input.targetId)
    if (!user) throw new ApiError('not-found', 'User not found.')
    if (user.id === actorId) throw new ApiError('invalid', 'You cannot report yourself.')
    targetOwnerId = user.id
  }
  const report: Report = {
    id: nextId('rep'),
    kind: input.targetType,
    targetId: input.targetId,
    targetOwnerId,
    reportedBy: actorId,
    reason: input.reason,
    details: sanitizeMultiline(input.details ?? '', 500),
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  store.reports.push(report)
  return clone(report)
}

/** Moderation queue — admins only, newest first, open reports only. */
export async function listOpenReports(actorId: string): Promise<Report[]> {
  await simulateLatency()
  requireAdmin(actorId)
  return clone(
    getStore()
      .reports.filter((r) => r.status === 'open')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
  )
}

/**
 * Resolve a report: dismiss it, or take the reported listing down
 * (status → 'removed', which hides it everywhere). Admins only.
 */
export async function resolveReport(
  actorId: string,
  reportId: string,
  action: 'dismiss' | 'remove-listing',
): Promise<Report> {
  await simulateLatency(150, 300)
  requireAdmin(actorId)
  const store = getStore()
  const report = store.reports.find((r) => r.id === reportId)
  if (!report) throw new ApiError('not-found', 'Report not found.')
  if (report.status !== 'open') throw new ApiError('conflict', 'Report already resolved.')
  if (action === 'remove-listing') {
    if (report.kind !== 'listing') {
      throw new ApiError('invalid', 'Only a listing report can remove a listing.')
    }
    const listing = store.listings.find((l) => l.id === report.targetId)
    if (listing) listing.status = 'removed'
    report.status = 'actioned'
  } else {
    report.status = 'dismissed'
  }
  return clone(report)
}

/**
 * Delete the signed-in user's account: profile, their listings, and
 * their requests/messages go with it. Reviews they received stay
 * attached to past deals in anonymized form (the reviewer names
 * resolve to "former neighbor" once the profile is gone).
 */
export async function deleteMyAccount(actorId: string): Promise<void> {
  await simulateLatency(200, 400)
  const store = getStore()
  const user = store.users.find((u) => u.id === actorId)
  if (!user) throw new ApiError('not-found', 'Account not found.')
  const myListingIds = new Set(store.listings.filter((l) => l.ownerId === actorId).map((l) => l.id))
  store.listings = store.listings.filter((l) => l.ownerId !== actorId)
  store.requests = store.requests.filter(
    (r) => r.borrowerId !== actorId && !myListingIds.has(r.listingId),
  )
  const myRequestIds = new Set(store.requests.map((r) => r.id))
  store.messages = store.messages.filter(
    (m) => m.senderId !== actorId && myRequestIds.has(m.requestId),
  )
  store.notifications = store.notifications.filter((n) => n.userId !== actorId)
  store.reports = store.reports.filter((r) => r.reportedBy !== actorId)
  store.users = store.users.filter((u) => u.id !== actorId)
}
