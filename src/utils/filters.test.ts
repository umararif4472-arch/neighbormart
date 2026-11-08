import { describe, expect, it } from 'vitest'
import type { ItemListing, Listing, VehicleListing } from '@/types'
import { EMPTY_LISTING_FILTERS } from '@/types'
import { countByCategory, filterListings } from './filters'

function makeItemListing(overrides: Partial<ItemListing> = {}): ItemListing {
  const base: ItemListing = {
    id: 'i-test',
    ownerId: 'u-maya',
    section: 'items',
    listingType: 'borrow',
    title: 'Cordless Drill',
    description: 'A drill.',
    price: 0,
    currency: 'PKR',
    priceUnit: 'fixed',
    negotiable: false,
    photos: [],
    location: { lat: 31.5, lng: 74.35, city: 'Lahore', area: 'DHA Phase 5' },
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    views: 0,
    details: {
      category: 'Tools',
      condition: 'Good',
      depositAmount: null,
      maxDurationDays: 7,
      pickupPreference: 'either',
      pickupInstructions: 'Porch pickup',
    },
  }
  return { ...base, ...overrides }
}

function makeVehicle(overrides: Partial<VehicleListing> = {}): VehicleListing {
  const base: VehicleListing = {
    id: 'v-test',
    ownerId: 'u-tom',
    section: 'vehicles',
    listingType: 'rent',
    title: 'Toyota Corolla 2020',
    description: 'Clean family sedan.',
    price: 8000,
    currency: 'PKR',
    priceUnit: 'day',
    negotiable: false,
    photos: [],
    location: { lat: 31.5, lng: 74.35, city: 'Lahore', area: 'Gulberg' },
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    views: 0,
    details: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      mileageKm: 62000,
      fuelType: 'petrol',
      transmission: 'automatic',
      condition: 'Good',
      withDriver: false,
      registrationCity: 'Lahore',
    },
  }
  return { ...base, ...overrides }
}

const ORIGIN = { lat: 31.5, lng: 74.35 }

// ~1.1 km north and ~4.4 km south of ORIGIN
const nearItem = makeItemListing({
  id: 'near',
  location: { ...ORIGIN, lat: 31.51, city: 'Lahore', area: 'DHA' },
})
const farItem = makeItemListing({
  id: 'far',
  location: { ...ORIGIN, lat: 31.46, city: 'Lahore', area: 'DHA' },
})
const tent = makeItemListing({
  id: 'tent',
  title: '6-Person Tent',
  description: 'Camping tent.',
  details: {
    category: 'Outdoor & Camping',
    condition: 'Good',
    depositAmount: null,
    maxDurationDays: 14,
    pickupPreference: 'pickup',
    pickupInstructions: 'Garage pickup',
  },
})
const rentedDrill = makeItemListing({ id: 'rented', status: 'rented' })
const corolla = makeVehicle({ id: 'corolla' })

const listings: Listing[] = [nearItem, farItem, tent, rentedDrill, corolla]

describe('filterListings', () => {
  it('returns everything with default filters', () => {
    expect(filterListings(listings, EMPTY_LISTING_FILTERS, ORIGIN)).toHaveLength(5)
  })

  it('filters by section', () => {
    const result = filterListings(
      listings,
      { ...EMPTY_LISTING_FILTERS, section: 'vehicles' },
      ORIGIN,
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('corolla')
  })

  it('filters by listing type', () => {
    const result = filterListings(
      listings,
      { ...EMPTY_LISTING_FILTERS, listingType: 'rent' },
      ORIGIN,
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('corolla')
  })

  it('filters by category within the items section', () => {
    const result = filterListings(
      listings,
      { ...EMPTY_LISTING_FILTERS, categories: ['Tools'] },
      ORIGIN,
    )
    expect(result).toHaveLength(3)
    expect(result.every((l) => l.section === 'items')).toBe(true)
  })

  it('filters by status', () => {
    const result = filterListings(listings, { ...EMPTY_LISTING_FILTERS, status: 'rented' }, ORIGIN)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rented')
  })

  it('filters by radius around the origin', () => {
    const result = filterListings(listings, { ...EMPTY_LISTING_FILTERS, maxDistanceKm: 2 }, ORIGIN)
    expect(result.some((l) => l.id === 'near')).toBe(true)
    expect(result.some((l) => l.id === 'far')).toBe(false)
  })

  it('ignores radius when origin is null (no location yet)', () => {
    const result = filterListings(listings, { ...EMPTY_LISTING_FILTERS, maxDistanceKm: 2 }, null)
    expect(result).toHaveLength(5)
  })

  it('matches query against title, description, category, and vehicle make', () => {
    expect(
      filterListings(listings, { ...EMPTY_LISTING_FILTERS, query: 'tent' }, ORIGIN),
    ).toHaveLength(1)
    expect(
      filterListings(listings, { ...EMPTY_LISTING_FILTERS, query: 'DRILL' }, ORIGIN),
    ).toHaveLength(3)
    expect(
      filterListings(listings, { ...EMPTY_LISTING_FILTERS, query: 'camping' }, ORIGIN),
    ).toHaveLength(1)
    expect(
      filterListings(listings, { ...EMPTY_LISTING_FILTERS, query: 'toyota' }, ORIGIN),
    ).toHaveLength(1)
    expect(
      filterListings(listings, { ...EMPTY_LISTING_FILTERS, query: 'unicycle' }, ORIGIN),
    ).toHaveLength(0)
  })
})

describe('countByCategory', () => {
  it('counts item listings per category', () => {
    const itemListings = listings.filter((l): l is ItemListing => l.section === 'items')
    const counts = countByCategory(itemListings)
    expect(counts.find((c) => c.category === 'Tools')?.count).toBe(3)
    expect(counts.find((c) => c.category === 'Outdoor & Camping')?.count).toBe(1)
  })
})
