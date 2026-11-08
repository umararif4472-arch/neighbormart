import { describe, expect, it, vi } from 'vitest'
import { listingsApi, safetyApi, usersApi } from './index'
import { getStore } from './store'
import type { CreateListingInput } from './listingValidation'

/**
 * Report / block / delete + moderation tests (Phase 8), against the
 * mock backend. The store is arranged directly where a state has no
 * public API yet (promoting a moderator).
 */

describe('reports + moderation', () => {
  it('files a listing report and refuses self-reports', async () => {
    const report = await safetyApi.createReport('u-maya', {
      targetType: 'listing',
      targetId: 'a-padel', // owned by u-marcus
      reason: 'scam',
      details: 'Asking for advance payment.',
    })
    expect(report.status).toBe('open')
    expect(report.targetOwnerId).toBe('u-marcus')
    expect(report.reportedBy).toBe('u-maya')

    await expect(
      safetyApi.createReport('u-marcus', {
        targetType: 'listing',
        targetId: 'a-padel',
        reason: 'spam',
      }),
    ).rejects.toThrow(/your own listing/)
  })

  it('non-admins cannot read the queue; an admin can dismiss and remove', async () => {
    await expect(safetyApi.listOpenReports('u-maya')).rejects.toThrow(/moderators/)

    // Arrange: promote Maya in the mock store (admin is granted
    // out-of-band in production too — Firestore console / this array).
    const maya = getStore().users.find((u) => u.id === 'u-maya')
    if (!maya) throw new Error('seed user missing')
    maya.role = 'admin'

    const open = await safetyApi.listOpenReports('u-maya')
    const mine = open.find((r) => r.targetId === 'a-padel')
    expect(mine).toBeTruthy()

    const resolved = await safetyApi.resolveReport('u-maya', mine!.id, 'remove-listing')
    expect(resolved.status).toBe('actioned')
    const listing = getStore().listings.find((l) => l.id === 'a-padel')
    expect(listing?.status).toBe('removed')

    const report2 = await safetyApi.createReport('u-tom', {
      targetType: 'user',
      targetId: 'u-marcus',
      reason: 'spam',
    })
    const dismissed = await safetyApi.resolveReport('u-maya', report2.id, 'dismiss')
    expect(dismissed.status).toBe('dismissed')
    await expect(safetyApi.resolveReport('u-maya', report2.id, 'dismiss')).rejects.toThrow(
      /already resolved/,
    )
  })
})

describe('blocking', () => {
  it('block hides and unblock restores (profile field round-trip)', async () => {
    const blocked = await usersApi.setBlocked('u-maya', 'u-maya', 'u-marcus', true)
    expect(blocked.blockedUserIds).toContain('u-marcus')
    await expect(usersApi.setBlocked('u-maya', 'u-tom', 'u-marcus', true)).rejects.toThrow(
      /account owner/,
    )
    const unblocked = await usersApi.setBlocked('u-maya', 'u-maya', 'u-marcus', false)
    expect(unblocked.blockedUserIds ?? []).not.toContain('u-marcus')
  })
})

describe('delete my account', () => {
  it('removes the profile and their listings', async () => {
    const before = getStore().listings.filter((l) => l.ownerId === 'u-leo').length
    expect(before).toBeGreaterThan(0)
    await safetyApi.deleteMyAccount('u-leo')
    expect(getStore().users.find((u) => u.id === 'u-leo')).toBeUndefined()
    expect(getStore().listings.filter((l) => l.ownerId === 'u-leo')).toHaveLength(0)
    await expect(safetyApi.deleteMyAccount('u-leo')).rejects.toThrow(/not found/)
  })
})

describe('listing rate limit (mock parity)', () => {
  it('allows 10 listings in 24h and blocks the 11th', async () => {
    vi.useFakeTimers()
    try {
      const input = (n: number): CreateListingInput => ({
        section: 'items',
        listingType: 'borrow',
        ownerId: 'u-tom',
        title: `Rate limit probe ${n}`,
        description: 'A perfectly ordinary probe listing for quota tests.',
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
      for (let i = 1; i <= 10; i++) {
        const pending = listingsApi.createListing(input(i))
        await vi.advanceTimersByTimeAsync(700)
        await pending
      }
      const eleventh = listingsApi.createListing(input(11))
      const assertion = expect(eleventh).rejects.toThrow(/10 listings/)
      await vi.advanceTimersByTimeAsync(700)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
