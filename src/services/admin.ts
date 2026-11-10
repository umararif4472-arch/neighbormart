import type { AdminStats, AuditAction, AuditEntry, ListingStatus, User } from '@/types'
import { ApiError } from './errors'
import { clone, getStore, nextId, simulateLatency } from './store'
import { invalidateListingsCache } from './listings'
import { invalidateUsersCache } from './users'

/**
 * Admin service (Phase 9) — MOCK implementation over the shared store.
 * Every function requires the actor to be an admin; the live
 * implementation mirrors these signatures against Firestore, where the
 * security rules enforce the same checks server-side.
 *
 * Every mutating action writes an audit entry: who did what to whom,
 * when. The audit log is append-only in the live backend (rules deny
 * updates and deletes).
 */

type Store = ReturnType<typeof getStore>

function requireAdmin(store: Store, actorId: string): User {
  const actor = store.users.find((u) => u.id === actorId)
  if (!actor || actor.role !== 'admin') {
    throw new ApiError('forbidden', 'Admin access required.')
  }
  return actor
}

function audit(
  store: Store,
  adminId: string,
  action: AuditAction,
  targetType: AuditEntry['targetType'],
  targetId: string,
  detail: string,
): void {
  store.audit.push({
    id: nextId('audit'),
    adminId,
    action,
    targetType,
    targetId,
    detail,
    createdAt: new Date().toISOString(),
  })
}

function userOrThrow(store: Store, userId: string): User {
  const user = store.users.find((u) => u.id === userId)
  if (!user) throw new ApiError('not-found', 'That user no longer exists.')
  return user
}

export async function getStats(actorId: string): Promise<AdminStats> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 3600 * 1000
  const bySection = { items: 0, vehicles: 0, properties: 0, arenas: 0 }
  for (const l of store.listings) bySection[l.section] += 1
  const signupsByDay = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(now - (6 - i) * 24 * 3600 * 1000)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = dayStart.getTime() + 24 * 3600 * 1000
    return store.users.filter((u) => {
      const t = new Date(u.joinedAt).getTime()
      return t >= dayStart.getTime() && t < dayEnd
    }).length
  })
  return {
    totalUsers: store.users.length,
    totalListings: store.listings.length,
    activeListings: store.listings.filter((l) => l.status === 'active').length,
    listingsBySection: bySection,
    activeDeals: store.requests.filter((r) => r.status === 'approved' || r.status === 'active')
      .length,
    signupsThisWeek: store.users.filter((u) => new Date(u.joinedAt).getTime() >= weekAgo).length,
    signupsByDay,
    openReports: store.reports.filter((r) => r.status === 'open').length,
    totalAdmins: store.users.filter((u) => u.role === 'admin').length,
  }
}

export async function listAudit(actorId: string, limit = 100): Promise<AuditEntry[]> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  return clone(
    [...store.audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit),
  )
}

export async function warnUser(actorId: string, userId: string, message: string): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const user = userOrThrow(store, userId)
  user.warnings = (user.warnings ?? 0) + 1
  store.notifications.push({
    id: nextId('notif'),
    userId,
    type: 'admin-warning',
    title: 'A warning from the NeighborMart team',
    body: message.trim() || 'Please review our community rules and keep deals respectful.',
    read: false,
    createdAt: new Date().toISOString(),
  })
  audit(store, actorId, 'user-warned', 'user', userId, `Warning #${user.warnings} sent.`)
}

export async function suspendUser(actorId: string, userId: string): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const user = userOrThrow(store, userId)
  user.suspended = true
  audit(store, actorId, 'user-suspended', 'user', userId, `${user.name} suspended.`)
}

export async function unsuspendUser(actorId: string, userId: string): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const user = userOrThrow(store, userId)
  user.suspended = false
  audit(store, actorId, 'user-unsuspended', 'user', userId, `${user.name} reinstated.`)
}

export async function deleteUser(actorId: string, userId: string): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  if (actorId === userId) {
    throw new ApiError('invalid', 'Use Delete my account on your own profile instead.')
  }
  const user = userOrThrow(store, userId)
  const ownedListingIds = new Set(
    store.listings.filter((l) => l.ownerId === userId).map((l) => l.id),
  )
  store.listings = store.listings.filter((l) => l.ownerId !== userId)
  store.requests = store.requests.filter(
    (r) => r.borrowerId !== userId && !ownedListingIds.has(r.listingId),
  )
  store.users = store.users.filter((u) => u.id !== userId)
  invalidateListingsCache()
  invalidateUsersCache([userId])
  audit(store, actorId, 'user-deleted', 'user', userId, `${user.name} and their data deleted.`)
}

export async function setListingStatusAdmin(
  actorId: string,
  listingId: string,
  status: Extract<ListingStatus, 'active' | 'paused' | 'removed'>,
): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const listing = store.listings.find((l) => l.id === listingId)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  listing.status = status
  listing.updatedAt = new Date().toISOString()
  invalidateListingsCache()
  audit(store, actorId, 'listing-status', 'listing', listingId, `Status → ${status}.`)
}

export async function setFeatured(
  actorId: string,
  listingId: string,
  featured: boolean,
): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const listing = store.listings.find((l) => l.id === listingId)
  if (!listing) throw new ApiError('not-found', 'That listing no longer exists.')
  listing.featured = featured
  invalidateListingsCache()
  audit(
    store,
    actorId,
    featured ? 'listing-featured' : 'listing-unfeatured',
    'listing',
    listingId,
    featured ? 'Featured on the landing page.' : 'Removed from featured.',
  )
}

export async function listAdmins(actorId: string): Promise<User[]> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  return clone(store.users.filter((u) => u.role === 'admin'))
}

export async function addAdmin(actorId: string, email: string): Promise<User> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const user = store.users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase())
  if (!user) {
    throw new ApiError('not-found', `No NeighborMart account uses ${email.trim()}.`)
  }
  user.role = 'admin'
  audit(store, actorId, 'admin-added', 'user', user.id, `${user.email} made admin.`)
  return clone(user)
}

export async function removeAdmin(actorId: string, userId: string): Promise<void> {
  await simulateLatency()
  const store = getStore()
  requireAdmin(store, actorId)
  const admins = store.users.filter((u) => u.role === 'admin')
  const user = userOrThrow(store, userId)
  if (user.role !== 'admin') throw new ApiError('invalid', 'That user is not an admin.')
  if (admins.length <= 1) {
    throw new ApiError('invalid', 'You cannot remove the last admin.')
  }
  user.role = 'member'
  audit(store, actorId, 'admin-removed', 'user', userId, `${user.email} is no longer an admin.`)
}
