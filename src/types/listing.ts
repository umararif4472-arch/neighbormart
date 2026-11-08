import type { ISODateString, LatLng } from './common'

/**
 * The unified Listing model (Phase 2) — one type for everything posted on
 * NeighborMart, replacing the old borrow-only `Item`.
 *
 * A Listing is a discriminated union on `section`: the common fields live
 * on ListingBase, and each section carries its own `details` shape, so a
 * vehicle can never accidentally grow bedrooms and a property can never
 * grow a fuel type. Components narrow on `listing.section` to read details.
 *
 * Deal kinds (`listingType`) are orthogonal to sections:
 *   borrow — free, the original NeighborMart flow
 *   rent   — paid per priceUnit (hour/day/week/month)
 *   sell   — one fixed price
 * Arenas are always rent (booked by slot); the section experiences and
 * booking rules arrive in Phase 5 — this phase defines the data.
 */

export const LISTING_SECTIONS = ['items', 'vehicles', 'properties', 'arenas'] as const
export type ListingSection = (typeof LISTING_SECTIONS)[number]

export type ListingType = 'borrow' | 'rent' | 'sell'

export type ListingStatus = 'active' | 'reserved' | 'rented' | 'sold' | 'paused' | 'removed'

/** What `price` is charged per. 'fixed' = one-off price (sell listings, free borrows). */
export type PriceUnit = 'hour' | 'day' | 'week' | 'month' | 'fixed'

/** Where a listing is: map coordinate plus human labels for cards/filters. */
export interface ListingLocation extends LatLng {
  city: string
  area: string
}

interface ListingBase {
  id: string
  ownerId: string
  listingType: ListingType
  title: string
  description: string
  /** Amount in `currency` major units (e.g. rupees). 0 for free borrows. */
  price: number
  /** ISO-style currency code; configurable per deployment, default PKR. */
  currency: string
  priceUnit: PriceUnit
  negotiable: boolean
  /** Photo URLs. May be empty — UI renders a section/category tile instead. */
  photos: string[]
  location: ListingLocation
  status: ListingStatus
  createdAt: ISODateString
  updatedAt: ISODateString
  /** Lifetime view counter (owner dashboard stats). */
  views: number
}

// --- Items & Tools ---------------------------------------------------------

/**
 * Canonical item category list — a runtime constant AND the ItemCategory
 * type, so filters, forms, and validation share one source of truth.
 */
export const ITEM_CATEGORIES = [
  'Tools',
  'Outdoor & Camping',
  'Party & Events',
  'Kitchen',
  'Electronics',
  'Sports',
  'Kids & Baby',
  'Other',
] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export type PickupPreference = 'pickup' | 'drop-off' | 'either'

export interface ItemListingDetails {
  category: ItemCategory
  /** Free-text condition notes ("Well loved but runs great"). */
  condition: string
  /** Optional refundable deposit in the listing currency. null = none. */
  depositAmount: number | null
  /** Borrow/rent terms — only meaningful for borrow & rent item listings. */
  maxDurationDays: number
  pickupPreference: PickupPreference
  pickupInstructions: string
}

// --- Vehicles ----------------------------------------------------------------

export type VehicleFuelType = 'petrol' | 'diesel' | 'cng' | 'hybrid' | 'electric'
export type VehicleTransmission = 'manual' | 'automatic'

export interface VehicleDetails {
  make: string
  model: string
  year: number
  mileageKm: number
  fuelType: VehicleFuelType
  transmission: VehicleTransmission
  /** Free-text condition notes. */
  condition: string
  /** Rent listings: the owner (or their driver) drives. */
  withDriver: boolean
  registrationCity: string
}

// --- Properties --------------------------------------------------------------

export const PROPERTY_TYPES = ['house', 'apartment', 'room', 'plot', 'shop', 'office'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export type PropertyAreaUnit = 'marla' | 'kanal' | 'sqft' | 'sqyd'

export interface PropertyDetails {
  propertyType: PropertyType
  /** null for plots/shops where bedrooms don't apply. */
  bedrooms: number | null
  bathrooms: number | null
  areaSize: number
  areaUnit: PropertyAreaUnit
  furnished: boolean
  /** null for houses/plots (ground) — 0 means ground floor. */
  floor: number | null
  amenities: string[]
  availableFrom: ISODateString
}

// --- Sports Arenas & Venues ----------------------------------------------------

export interface ArenaFacilities {
  floodlights: boolean
  parking: boolean
  washrooms: boolean
  changingRooms: boolean
}

export interface ArenaAdvanceBooking {
  /** How far ahead a slot may be booked, in days. */
  maxAdvanceDays: number
  /** Minimum notice before a slot starts, in hours. */
  minAdvanceHours: number
}

export interface ArenaDetails {
  sportTypes: string[]
  /** e.g. 'Natural grass', 'Astro turf', 'Hard court', 'Indoor wooden'. */
  surface: string
  /** Players/spectators the venue holds. */
  capacity: number
  /** Local 'HH:mm' strings. */
  openingHours: { opens: string; closes: string }
  /** Bookable slot length in minutes (e.g. 60). */
  slotMinutes: number
  facilities: ArenaFacilities
  advanceBooking: ArenaAdvanceBooking
}

// --- The union -----------------------------------------------------------------

export type Listing =
  | (ListingBase & { section: 'items'; details: ItemListingDetails })
  | (ListingBase & { section: 'vehicles'; details: VehicleDetails })
  | (ListingBase & { section: 'properties'; details: PropertyDetails })
  | (ListingBase & { section: 'arenas'; details: ArenaDetails })

/** Narrowed helpers for code that only deals with one section. */
export type ItemListing = Extract<Listing, { section: 'items' }>
export type VehicleListing = Extract<Listing, { section: 'vehicles' }>
export type PropertyListing = Extract<Listing, { section: 'properties' }>
export type ArenaListing = Extract<Listing, { section: 'arenas' }>

/**
 * Filter shape shared by the browse UI (client-side filtering through
 * useFilteredListings) and the listing service (mock "server-side"
 * filtering). The first block is cross-section; the Phase 5 fields are
 * section-specific and optional — when one is set, listings outside its
 * section are excluded (same rule the category filter has always used).
 */
export interface ListingFilters {
  query: string
  section: ListingSection | 'all'
  listingType: ListingType | 'all'
  /** Items-section categories. Empty array means "all categories". */
  categories: ItemCategory[]
  /** null means "any distance". */
  maxDistanceKm: number | null
  /** 'all', or a single status (the browse UI mostly wants 'active'). */
  status: ListingStatus | 'all'

  // --- Phase 5: location + price (all sections) -------------------------
  /** '' means any city. */
  city?: string
  /** '' means any area/neighborhood. */
  area?: string
  priceMin?: number | null
  priceMax?: number | null

  // --- Phase 5: vehicles --------------------------------------------------
  makes?: string[]
  fuelTypes?: VehicleFuelType[]
  transmissions?: VehicleTransmission[]
  yearMin?: number | null
  yearMax?: number | null
  withDriverOnly?: boolean

  // --- Phase 5: properties --------------------------------------------------
  propertyTypes?: PropertyType[]
  minBedrooms?: number | null
  furnished?: 'any' | 'furnished' | 'unfurnished'

  // --- Phase 5: arenas ------------------------------------------------------
  sports?: string[]
  minCapacity?: number | null
  /** Every selected facility must be present on the arena. */
  facilities?: Array<keyof ArenaFacilities>
}

export const EMPTY_LISTING_FILTERS: ListingFilters = {
  query: '',
  section: 'all',
  listingType: 'all',
  categories: [],
  maxDistanceKm: null,
  status: 'all',
}
