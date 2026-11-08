import { beforeAll, describe, expect, it } from 'vitest'
import type { CreateListingInput } from './listingValidation'
import { adminApi, listingsApi, messagesApi, requestsApi } from './index'
import { getStore } from './store'

/**
 * Phase 9 admin panel — service-level tests (mock backend). The admin
 * guard, moderation actions, suspension enforcement, featured flag,
 * admin management (incl. the last-admin guard) and the audit log.
 * Firestore rules enforce the same checks server-side and were
 * probe-tested live (suspension, audit access, self-promotion).
 */

const ADMIN = 'u-maya'
const MEMBER = 'u-leo'

beforeAll(() => {
  // Grant Maya admin directly in the store (the test-only equivalent of
  // scripts/grant-admin.mjs — clients can never do this in the app).
  const maya = getStore().users.find((u) => u.id === ADMIN)
  if (maya) maya.role = 'admin'
})

describe('admin guard', () => {
  it('rejects non-admins from every admin function', async () => {
    await expect(adminApi.getStats(MEMBER)).rejects.toThrow(/Admin access/)
    await expect(adminApi.listAudit(MEMBER)).rejects.toThrow(/Admin access/)
    await expect(adminApi.listAdmins(MEMBER)).rejects.toThrow(/Admin access/)
    await expect(adminApi.warnUser(MEMBER, 'u-tom', 'hi')).rejects.toThrow(/Admin access/)
    await expect(adminApi.suspendUser(MEMBER, 'u-tom')).rejects.toThrow(/Admin access/)
    await expect(adminApi.setFeatured(MEMBER, 'i-drill', true)).rejects.toThrow(/Admin access/)
    await expect(adminApi.addAdmin(MEMBER, 'tom.alvarez@example.com')).rejects.toThrow(
      /Admin access/,
    )
  })

  it('rejects unknown actors too', async () => {
    await expect(adminApi.getStats('u-ghost')).rejects.toThrow(/Admin access/)
  })
})

describe('stats', () => {
  it('counts users, listings by section, deals and reports', async () => {
    const stats = await adminApi.getStats(ADMIN)
    expect(stats.totalUsers).toBe(getStore().users.length)
    expect(stats.totalListings).toBe(getStore().listings.length)
    const bySectionTotal = Object.values(stats.listingsBySection).reduce((a, b) => a + b, 0)
    expect(bySectionTotal).toBe(stats.totalListings)
    expect(stats.signupsByDay).toHaveLength(7)
    expect(stats.totalAdmins).toBe(1)
  })
})

describe('warn + audit', () => {
  it('warnUser counts the warning, notifies the user and writes audit', async () => {
    await adminApi.warnUser(ADMIN, 'u-tom', 'Please keep deals respectful.')
    const tom = getStore().users.find((u) => u.id === 'u-tom')
    expect(tom?.warnings).toBe(1)
    const notif = getStore().notifications.find(
      (n) => n.userId === 'u-tom' && n.type === 'admin-warning',
    )
    expect(notif?.body).toContain('respectful')
    const audit = await adminApi.listAudit(ADMIN)
    expect(audit.some((a) => a.action === 'user-warned' && a.targetId === 'u-tom')).toBe(true)
  })
})

describe('suspension enforcement', () => {
  const input = (ownerId: string): CreateListingInput => ({
    section: 'items',
    listingType: 'borrow',
    ownerId,
    title: 'Suspension probe listing',
    description: 'A perfectly ordinary probe listing.',
    price: 0,
    priceUnit: 'fixed',
    negotiable: false,
    photos: [],
    details: {
      category: 'Tools',
      condition: 'Good',
      depositAmount: 500,
      maxDurationDays: 3,
      pickupPreference: 'either',
      pickupInstructions: 'Pick up from my porch.',
    },
  })

  it('a suspended user cannot post, request or message — and recovers on unsuspend', async () => {
    await adminApi.suspendUser(ADMIN, 'u-tom')
    await expect(listingsApi.createListing(input('u-tom'))).rejects.toThrow(/suspended/)

    const someListing = getStore().listings.find(
      (l) => l.ownerId !== 'u-tom' && l.status === 'active',
    )
    await expect(
      requestsApi.createRequest({
        listingId: someListing!.id,
        borrowerId: 'u-tom',
        period: {
          start: new Date().toISOString(),
          end: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
        },
        note: 'hi',
      }),
    ).rejects.toThrow(/suspended/)

    const anyRequest = getStore().requests[0]
    await expect(messagesApi.sendMessage(anyRequest!.id, 'u-tom', 'hello')).rejects.toThrow(
      /suspended/,
    )

    const audit = await adminApi.listAudit(ADMIN)
    expect(audit.some((a) => a.action === 'user-suspended' && a.targetId === 'u-tom')).toBe(true)

    await adminApi.unsuspendUser(ADMIN, 'u-tom')
    const created = await listingsApi.createListing(input('u-tom'))
    expect(created.ownerId).toBe('u-tom')
  })
})

describe('listing moderation', () => {
  it('admins can pause, remove and restore any listing, and feature it', async () => {
    const target = getStore().listings.find((l) => l.ownerId !== ADMIN && l.status === 'active')!
    await adminApi.setListingStatusAdmin(ADMIN, target.id, 'paused')
    expect(getStore().listings.find((l) => l.id === target.id)?.status).toBe('paused')
    await adminApi.setListingStatusAdmin(ADMIN, target.id, 'removed')
    expect(getStore().listings.find((l) => l.id === target.id)?.status).toBe('removed')
    // Restore from removed is an admin-only transition (not in the owner machine).
    await adminApi.setListingStatusAdmin(ADMIN, target.id, 'active')
    expect(getStore().listings.find((l) => l.id === target.id)?.status).toBe('active')

    await adminApi.setFeatured(ADMIN, target.id, true)
    const listings = await listingsApi.getListings()
    expect(listings.find((l) => l.id === target.id)?.featured).toBe(true)
    await adminApi.setFeatured(ADMIN, target.id, false)

    const audit = await adminApi.listAudit(ADMIN)
    expect(audit.filter((a) => a.targetId === target.id).length).toBeGreaterThanOrEqual(4)
  })
})

describe('admin management', () => {
  it('adds by email, and the last admin cannot be removed', async () => {
    const added = await adminApi.addAdmin(ADMIN, 'leo.park@example.com')
    expect(added.role).toBe('admin')
    expect((await adminApi.listAdmins(ADMIN)).map((u) => u.id)).toContain(MEMBER)

    await adminApi.removeAdmin(ADMIN, MEMBER)
    expect(getStore().users.find((u) => u.id === MEMBER)?.role).toBe('member')

    // Maya is now the only admin again.
    await expect(adminApi.removeAdmin(ADMIN, ADMIN)).rejects.toThrow(/last admin/)
  })

  it('addAdmin rejects unknown emails', async () => {
    await expect(adminApi.addAdmin(ADMIN, 'nobody@nowhere.test')).rejects.toThrow(
      /No NeighborMart account/,
    )
  })
})

describe('user deletion', () => {
  it('deleteUser purges the user and their listings, with audit', async () => {
    const before = getStore().listings.filter((l) => l.ownerId === 'u-nina').length
    expect(before).toBeGreaterThan(0)
    await adminApi.deleteUser(ADMIN, 'u-nina')
    expect(getStore().users.find((u) => u.id === 'u-nina')).toBeUndefined()
    expect(getStore().listings.filter((l) => l.ownerId === 'u-nina')).toHaveLength(0)
    const audit = await adminApi.listAudit(ADMIN)
    expect(audit.some((a) => a.action === 'user-deleted' && a.targetId === 'u-nina')).toBe(true)
  })

  it('an admin cannot delete themself through the panel', async () => {
    await expect(adminApi.deleteUser(ADMIN, ADMIN)).rejects.toThrow(/Delete my account/)
  })
})
