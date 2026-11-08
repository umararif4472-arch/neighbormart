import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore/lite'
import type { AdminStats, AuditAction, AuditEntry, Listing, ListingStatus, User } from '@/types'
import { ApiError } from '../errors'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs } from './firestoreData'
import { createNotification } from './notifications'

/**
 * Admin service (Phase 9) — LIVE Firestore implementation. Mirrors the
 * mock signatures in services/admin.ts. The Firestore rules enforce
 * every check here server-side (isAdmin(), suspended-write blocks,
 * audit log append-only), so a tampered client cannot bypass them.
 */

const usersCol = () => collection(getDb(), COLLECTIONS.users)
const listingsCol = () => collection(getDb(), COLLECTIONS.listings)
const auditCol = () => collection(getDb(), 'auditLog')

async function requireAdmin(actorId: string): Promise<User> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, actorId))
  const actor = fromDoc<User>(snap)
  if (!actor || actor.role !== 'admin') {
    throw new ApiError('forbidden', 'Admin access required.')
  }
  return actor
}

async function audit(
  adminId: string,
  action: AuditAction,
  targetType: AuditEntry['targetType'],
  targetId: string,
  detail: string,
): Promise<void> {
  const entry: Omit<AuditEntry, 'id'> = {
    adminId,
    action,
    targetType,
    targetId,
    detail,
    createdAt: new Date().toISOString(),
  }
  await addDoc(auditCol(), entry)
}

async function userOrThrow(userId: string): Promise<User> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, userId))
  const user = fromDoc<User>(snap)
  if (!user) throw new ApiError('not-found', 'That user no longer exists.')
  return user
}

export async function getStats(actorId: string): Promise<AdminStats> {
  await requireAdmin(actorId)
  const [usersSnap, listingsSnap, requestsSnap, reportsSnap] = await Promise.all([
    getDocs(usersCol()),
    getDocs(listingsCol()),
    getDocs(collection(getDb(), COLLECTIONS.requests)),
    getDocs(query(collection(getDb(), COLLECTIONS.reports), where('status', '==', 'open'))),
  ])
  const users = fromDocs<User>(usersSnap.docs)
  const listings = fromDocs<Listing>(listingsSnap.docs)
  const requests = fromDocs<{ status: string }>(requestsSnap.docs)
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 3600 * 1000
  const bySection = { items: 0, vehicles: 0, properties: 0, arenas: 0 }
  for (const l of listings) bySection[l.section] += 1
  const signupsByDay = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(now - (6 - i) * 24 * 3600 * 1000)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = dayStart.getTime() + 24 * 3600 * 1000
    return users.filter((u) => {
      const t = new Date(u.joinedAt).getTime()
      return t >= dayStart.getTime() && t < dayEnd
    }).length
  })
  return {
    totalUsers: users.length,
    totalListings: listings.length,
    activeListings: listings.filter((l) => l.status === 'active').length,
    listingsBySection: bySection,
    activeDeals: requests.filter((r) => r.status === 'approved' || r.status === 'active').length,
    signupsThisWeek: users.filter((u) => new Date(u.joinedAt).getTime() >= weekAgo).length,
    signupsByDay,
    openReports: reportsSnap.size,
    totalAdmins: users.filter((u) => u.role === 'admin').length,
  }
}

export async function listAudit(actorId: string, max = 100): Promise<AuditEntry[]> {
  await requireAdmin(actorId)
  const snap = await getDocs(query(auditCol(), orderBy('createdAt', 'desc'), limit(max)))
  return fromDocs<AuditEntry>(snap.docs)
}

export async function warnUser(actorId: string, userId: string, message: string): Promise<void> {
  await requireAdmin(actorId)
  await userOrThrow(userId)
  await updateDoc(doc(getDb(), COLLECTIONS.users, userId), { warnings: increment(1) })
  await createNotification(
    userId,
    'admin-warning',
    'A warning from the NeighborMart team',
    message.trim() || 'Please review our community rules and keep deals respectful.',
  )
  await audit(actorId, 'user-warned', 'user', userId, 'Warning sent.')
}

export async function suspendUser(actorId: string, userId: string): Promise<void> {
  await requireAdmin(actorId)
  const user = await userOrThrow(userId)
  await updateDoc(doc(getDb(), COLLECTIONS.users, userId), { suspended: true })
  await audit(actorId, 'user-suspended', 'user', userId, `${user.name} suspended.`)
}

export async function unsuspendUser(actorId: string, userId: string): Promise<void> {
  await requireAdmin(actorId)
  const user = await userOrThrow(userId)
  await updateDoc(doc(getDb(), COLLECTIONS.users, userId), { suspended: false })
  await audit(actorId, 'user-unsuspended', 'user', userId, `${user.name} reinstated.`)
}

export async function deleteUser(actorId: string, userId: string): Promise<void> {
  await requireAdmin(actorId)
  if (actorId === userId) {
    throw new ApiError('invalid', 'Use Delete my account on your own profile instead.')
  }
  const user = await userOrThrow(userId)
  const owned = await getDocs(query(listingsCol(), where('ownerId', '==', userId)))
  const batch = writeBatch(getDb())
  owned.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(getDb(), COLLECTIONS.users, userId))
  await batch.commit()
  await audit(actorId, 'user-deleted', 'user', userId, `${user.name} and their listings deleted.`)
}

export async function setListingStatusAdmin(
  actorId: string,
  listingId: string,
  status: Extract<ListingStatus, 'active' | 'paused' | 'removed'>,
): Promise<void> {
  await requireAdmin(actorId)
  await updateDoc(doc(getDb(), COLLECTIONS.listings, listingId), {
    status,
    updatedAt: new Date().toISOString(),
  })
  await audit(actorId, 'listing-status', 'listing', listingId, `Status → ${status}.`)
}

export async function setFeatured(
  actorId: string,
  listingId: string,
  featured: boolean,
): Promise<void> {
  await requireAdmin(actorId)
  await updateDoc(doc(getDb(), COLLECTIONS.listings, listingId), { featured })
  await audit(
    actorId,
    featured ? 'listing-featured' : 'listing-unfeatured',
    'listing',
    listingId,
    featured ? 'Featured on the landing page.' : 'Removed from featured.',
  )
}

export async function listAdmins(actorId: string): Promise<User[]> {
  await requireAdmin(actorId)
  const snap = await getDocs(query(usersCol(), where('role', '==', 'admin')))
  return fromDocs<User>(snap.docs)
}

export async function addAdmin(actorId: string, email: string): Promise<User> {
  await requireAdmin(actorId)
  const snap = await getDocs(query(usersCol(), where('email', '==', email.trim().toLowerCase())))
  const user = fromDocs<User>(snap.docs)[0]
  if (!user) {
    throw new ApiError('not-found', `No NeighborMart account uses ${email.trim()}.`)
  }
  await updateDoc(doc(getDb(), COLLECTIONS.users, user.id), { role: 'admin' })
  await audit(actorId, 'admin-added', 'user', user.id, `${user.email} made admin.`)
  return { ...user, role: 'admin' }
}

export async function removeAdmin(actorId: string, userId: string): Promise<void> {
  await requireAdmin(actorId)
  const admins = await listAdmins(actorId)
  const user = await userOrThrow(userId)
  if (user.role !== 'admin') throw new ApiError('invalid', 'That user is not an admin.')
  if (admins.length <= 1) {
    throw new ApiError('invalid', 'You cannot remove the last admin.')
  }
  await updateDoc(doc(getDb(), COLLECTIONS.users, userId), { role: 'member' })
  await audit(actorId, 'admin-removed', 'user', userId, `${user.email} is no longer an admin.`)
}
