import { describe, expect, it } from 'vitest'
import { requestsApi } from './index'
import { slotsOverlap, validateArenaSlot } from '@/utils/requestLifecycle'
import { getStore } from './store'
import type { ArenaListing } from '@/types'

/**
 * Booking-conflict tests (Phase 8): pure slot math + the service-level
 * overlap guard that stops two neighbors booking the same arena slot.
 */

const padel = () => {
  const listing = getStore().listings.find((l) => l.id === 'a-padel')
  if (!listing || listing.section !== 'arenas') throw new Error('seed arena missing')
  return listing as ArenaListing
}

/** A date `days` ahead as YYYY-MM-DD (local). */
function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('slotsOverlap', () => {
  const base = { date: '2026-11-10', startTime: '10:00', endTime: '11:00' }
  it('detects overlapping and contained slots', () => {
    expect(slotsOverlap(base, { date: '2026-11-10', startTime: '10:30', endTime: '11:30' })).toBe(
      true,
    )
    expect(slotsOverlap(base, { date: '2026-11-10', startTime: '10:00', endTime: '11:00' })).toBe(
      true,
    )
  })
  it('allows back-to-back slots and different days', () => {
    expect(slotsOverlap(base, { date: '2026-11-10', startTime: '11:00', endTime: '12:00' })).toBe(
      false,
    )
    expect(slotsOverlap(base, { date: '2026-11-11', startTime: '10:00', endTime: '11:00' })).toBe(
      false,
    )
  })
})

describe('validateArenaSlot', () => {
  it('accepts an on-grid future slot and rejects off-grid / past / too-far ones', () => {
    const listing = padel()
    expect(
      validateArenaSlot(listing, { date: futureDate(3), startTime: '10:00', endTime: '11:00' }),
    ).toBeNull()
    expect(
      validateArenaSlot(listing, { date: futureDate(3), startTime: '10:30', endTime: '11:30' }),
    ).toMatch(/grid/)
    expect(
      validateArenaSlot(listing, { date: futureDate(30), startTime: '10:00', endTime: '11:00' }),
    ).toMatch(/days ahead/)
  })
})

describe('createRequest arena conflicts (service level)', () => {
  it('books a slot, rejects an overlapping second booking, allows the adjacent slot', async () => {
    const date = futureDate(4)
    const first = await requestsApi.createRequest({
      listingId: 'a-padel',
      borrowerId: 'u-maya',
      period: { start: date, end: date },
      slot: { date, startTime: '10:00', endTime: '11:00' },
    })
    expect(first.request.status).toBe('pending')

    await expect(
      requestsApi.createRequest({
        listingId: 'a-padel',
        borrowerId: 'u-tom',
        period: { start: date, end: date },
        slot: { date, startTime: '10:00', endTime: '12:00' },
      }),
    ).rejects.toThrow(/already booked/)

    const adjacent = await requestsApi.createRequest({
      listingId: 'a-padel',
      borrowerId: 'u-tom',
      period: { start: date, end: date },
      slot: { date, startTime: '11:00', endTime: '12:00' },
    })
    expect(adjacent.request.status).toBe('pending')
  })

  it('rejects booking your own arena and off-grid slots', async () => {
    const date = futureDate(5)
    await expect(
      requestsApi.createRequest({
        listingId: 'a-padel',
        borrowerId: 'u-marcus', // the owner
        period: { start: date, end: date },
        slot: { date, startTime: '12:00', endTime: '13:00' },
      }),
    ).rejects.toThrow(/your own listing/)
    await expect(
      requestsApi.createRequest({
        listingId: 'a-padel',
        borrowerId: 'u-maya',
        period: { start: date, end: date },
        slot: { date, startTime: '12:15', endTime: '13:15' },
      }),
    ).rejects.toThrow(/grid/)
  })
})
