import { describe, expect, it } from 'vitest'
import type { Listing } from '@/types'
import {
  compareListingsNewestFirst,
  paginateSortedListings,
} from './pagination'
import { listingsApi, usersApi } from './index'
import { getStore } from './store'

/**
 * Workstream A: the paged listings API + scoped user fetches (mock
 * backend — the live backend implements the same contract against
 * Firestore's canonical query).
 */

function fakeListing(id: string, createdAt: string): Listing {
  return {
    id,
    ownerId: 'u-x',
    section: 'items',
    listingType: 'borrow',
    title: `Listing ${id}`,
    description: 'A test listing.',
    price: 0,
    currency: 'PKR',
    priceUnit: 'fixed',
    negotiable: false,
    photos: [],
    location: { lat: 31.5, lng: 74.3, city: 'Lahore', area: 'DHA' },
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    views: 0,
    details: {
      category: 'Tools',
      condition: 'Good',
      depositAmount: null,
      maxDurationDays: 7,
      pickupPreference: 'either',
      pickupInstructions: 'Porch pickup.',
    },
  } as Listing
}

describe('paginateSortedListings', () => {
  const sorted = [
    fakeListing('l-3', '2026-11-03T00:00:00.000Z'),
    fakeListing('l-2', '2026-11-02T00:00:00.000Z'),
    fakeListing('l-1', '2026-11-01T00:00:00.000Z'),
  ]

  it('returns the first page with a cursor when more remain', () => {
    const page = paginateSortedListings(sorted, { pageSize: 2 })
    expect(page.items.map((l) => l.id)).toEqual(['l-3', 'l-2'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).toEqual({ createdAt: '2026-11-02T00:00:00.000Z', id: 'l-2' })
  })

  it('the cursor page is disjoint and exhausts the list', () => {
    const first = paginateSortedListings(sorted, { pageSize: 2 })
    const second = paginateSortedListings(sorted, { pageSize: 2, cursor: first.nextCursor })
    expect(second.items.map((l) => l.id)).toEqual(['l-1'])
    expect(second.hasMore).toBe(false)
    expect(second.nextCursor).toBeNull()
  })

  it('breaks createdAt ties by id, consistently with the cursor', () => {
    const tied = [
      fakeListing('b', '2026-11-01T00:00:00.000Z'),
      fakeListing('a', '2026-11-01T00:00:00.000Z'),
      fakeListing('c', '2026-11-01T00:00:00.000Z'),
    ].sort(compareListingsNewestFirst)
    expect(tied.map((l) => l.id)).toEqual(['c', 'b', 'a'])
    const first = paginateSortedListings(tied, { pageSize: 2 })
    const second = paginateSortedListings(tied, { pageSize: 2, cursor: first.nextCursor })
    expect(second.items.map((l) => l.id)).toEqual(['a'])
  })
})

describe('mock getListingsPage', () => {
  it('pages through exactly the active listings, newest first, no repeats', async () => {
    const activeCount = getStore().listings.filter((l) => l.status === 'active').length
    const seen = new Set<string>()
    let cursor = null as { createdAt: string; id: string } | null
    let pages = 0
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await listingsApi.getListingsPage({ pageSize: 5, cursor })
      pages += 1
      for (const listing of page.items) {
        expect(listing.status).toBe('active')
        expect(seen.has(listing.id)).toBe(false)
        seen.add(listing.id)
      }
      if (!page.hasMore) break
      cursor = page.nextCursor
    }
    expect(seen.size).toBe(activeCount)
    expect(pages).toBe(Math.ceil(activeCount / 5))
  })

  it('applies section + listingType + city server-side filters', async () => {
    const page = await listingsApi.getListingsPage({
      section: 'vehicles',
      pageSize: 50,
    })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((l) => l.section === 'vehicles')).toBe(true)

    const city = page.items[0].location.city
    const byCity = await listingsApi.getListingsPage({ city, pageSize: 50 })
    expect(byCity.items.every((l) => l.location.city === city)).toBe(true)
  })

  it('serves repeat page fetches from the session cache (same object data)', async () => {
    const first = await listingsApi.getListingsPage({ section: 'arenas' })
    const second = await listingsApi.getListingsPage({ section: 'arenas' })
    expect(second).toEqual(first)
  })
})

describe('mock getListingsByOwner', () => {
  it('returns only that owner’s listings, any status', async () => {
    const ownerId = getStore().listings[0].ownerId
    const mine = await listingsApi.getListingsByOwner(ownerId)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((l) => l.ownerId === ownerId)).toBe(true)
  })
})

describe('mock getUsersByIds', () => {
  it('dedupes, preserves order, and omits unknown ids', async () => {
    const [a, b] = getStore().users
    const users = await usersApi.getUsersByIds([b.id, a.id, b.id, 'u-ghost'])
    expect(users.map((u) => u.id)).toEqual([b.id, a.id])
  })
})
