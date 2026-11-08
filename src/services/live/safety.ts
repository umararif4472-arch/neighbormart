import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore/lite'
import { deleteUser } from 'firebase/auth'
import type { Report, ReportReason, ReportTargetType } from '@/types'
import { ApiError } from '../errors'
import { getDb, getFirebaseAuth } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs, stripUndefined } from './firestoreData'
import { sanitizeMultiline } from '@/utils/sanitize'

/**
 * Safety service (Phase 8, live backend): reports + moderation +
 * account deletion against Firestore. Rules enforce: reports are
 * create-by-reporter, readable/resolvable only by profiles whose
 * `role` is 'admin'; users can delete only their own documents.
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

async function fetchProfile(userId: string) {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, userId))
  return fromDoc<{ id: string; role?: string }>(snap)
}

async function requireAdmin(actorId: string) {
  const actor = await fetchProfile(actorId)
  if (!actor) throw new ApiError('unauthenticated', 'Sign in to continue.')
  if (actor.role !== 'admin') {
    throw new ApiError('forbidden', 'Only moderators can access the reports queue.')
  }
}

export async function createReport(actorId: string, input: CreateReportInput): Promise<Report> {
  if (!REPORT_REASONS.includes(input.reason)) {
    throw new ApiError('invalid', 'Pick a reason for the report.')
  }
  const db = getDb()
  let targetOwnerId: string
  if (input.targetType === 'listing') {
    const snap = await getDoc(doc(db, COLLECTIONS.listings, input.targetId))
    const listing = fromDoc<{ id: string; ownerId: string }>(snap)
    if (!listing) throw new ApiError('not-found', 'Listing not found.')
    if (listing.ownerId === actorId) {
      throw new ApiError('invalid', 'You cannot report your own listing.')
    }
    targetOwnerId = listing.ownerId
  } else {
    const profile = await fetchProfile(input.targetId)
    if (!profile) throw new ApiError('not-found', 'User not found.')
    if (profile.id === actorId) throw new ApiError('invalid', 'You cannot report yourself.')
    targetOwnerId = profile.id
  }
  const ref = doc(collection(db, COLLECTIONS.reports))
  const report: Report = {
    id: ref.id,
    kind: input.targetType,
    targetId: input.targetId,
    targetOwnerId,
    reportedBy: actorId,
    reason: input.reason,
    details: sanitizeMultiline(input.details ?? '', 500),
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  const batch = writeBatch(db)
  batch.set(ref, stripUndefined({ ...report }))
  await batch.commit()
  return report
}

export async function listOpenReports(actorId: string): Promise<Report[]> {
  await requireAdmin(actorId)
  const snap = await getDocs(
    query(collection(getDb(), COLLECTIONS.reports), where('status', '==', 'open')),
  )
  return fromDocs<Report>(snap.docs).sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
}

export async function resolveReport(
  actorId: string,
  reportId: string,
  action: 'dismiss' | 'remove-listing',
): Promise<Report> {
  await requireAdmin(actorId)
  const db = getDb()
  const ref = doc(db, COLLECTIONS.reports, reportId)
  const snap = await getDoc(ref)
  const report = fromDoc<Report>(snap)
  if (!report) throw new ApiError('not-found', 'Report not found.')
  if (report.status !== 'open') throw new ApiError('conflict', 'Report already resolved.')
  const batch = writeBatch(db)
  if (action === 'remove-listing') {
    if (report.kind !== 'listing') {
      throw new ApiError('invalid', 'Only a listing report can remove a listing.')
    }
    batch.update(doc(db, COLLECTIONS.listings, report.targetId), { status: 'removed' })
    batch.update(ref, { status: 'actioned' })
    await batch.commit()
    return { ...report, status: 'actioned' }
  }
  batch.update(ref, { status: 'dismissed' })
  await batch.commit()
  return { ...report, status: 'dismissed' }
}

/**
 * Delete the account end-to-end (live): their listings, requests they
 * take part in, their profile doc, and finally the Firebase Auth user.
 * Auth deletion can demand a recent login — when it does, the data is
 * already gone and we say so plainly so the user can sign in fresh and
 * finish the last step.
 */
export async function deleteMyAccount(actorId: string): Promise<void> {
  const db = getDb()
  const listingsSnap = await getDocs(
    query(collection(db, COLLECTIONS.listings), where('ownerId', '==', actorId)),
  )
  const requestsSnap = await getDocs(
    query(collection(db, COLLECTIONS.requests), where('borrowerId', '==', actorId)),
  )
  const ownerRequestsSnap = await getDocs(
    query(collection(db, COLLECTIONS.requests), where('ownerId', '==', actorId)),
  )
  const batch = writeBatch(db)
  for (const d of listingsSnap.docs) batch.delete(d.ref)
  for (const d of requestsSnap.docs) batch.delete(d.ref)
  for (const d of ownerRequestsSnap.docs) batch.delete(d.ref)
  batch.delete(doc(db, COLLECTIONS.users, actorId))
  await batch.commit()

  const auth = getFirebaseAuth()
  if (auth.currentUser && auth.currentUser.uid === actorId) {
    try {
      await deleteUser(auth.currentUser)
    } catch {
      throw new ApiError(
        'auth/requires-recent-login',
        'Your listings and profile are deleted. For security, sign in once more and delete the account again to remove the login itself.',
      )
    }
  }
}
