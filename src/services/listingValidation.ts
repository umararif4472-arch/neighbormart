import type {
  ArenaDetails,
  ItemListing,
  ListingSection,
  ListingType,
  PriceUnit,
  PropertyDetails,
  VehicleDetails,
} from '@/types'
import { ITEM_CATEGORIES, PROPERTY_TYPES } from '@/types'

/**
 * Shared create-listing validation — used by BOTH service backends (mock
 * store and Firestore) so the rules can never drift between dev and
 * production data. The items-only input below predates the unified
 * model; the generic Phase 5 input covers every section.
 */

export interface CreateItemListingInput {
  ownerId: string
  title: string
  description: string
  category: ItemListing['details']['category']
  condition: string
  photos: string[]
  maxDurationDays: number
  depositAmount: number | null
  /** null = free borrow; a number makes it a per-day rent listing. */
  dailyFee: number | null
  pickupPreference: ItemListing['details']['pickupPreference']
  pickupInstructions: string
}

export function validateCreateItemListingInput(
  input: CreateItemListingInput,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (input.title.trim().length < 3 || input.title.trim().length > 80) {
    errors.title = 'Title must be 3–80 characters.'
  }
  if (input.description.trim().length < 10 || input.description.trim().length > 1000) {
    errors.description = 'Description must be 10–1000 characters.'
  }
  if (!ITEM_CATEGORIES.includes(input.category)) {
    errors.category = 'Pick one of the categories.'
  }
  if (input.condition.trim().length < 3) {
    errors.condition = 'Add a short condition note (e.g. "Good — works great").'
  }
  if (
    !Number.isInteger(input.maxDurationDays) ||
    input.maxDurationDays < 1 ||
    input.maxDurationDays > 60
  ) {
    errors.maxDurationDays = 'Max borrow duration must be 1–60 days.'
  }
  if (input.depositAmount != null && (input.depositAmount < 0 || input.depositAmount > 200_000)) {
    errors.depositAmount = 'Deposit must be between Rs 0 and Rs 200,000.'
  }
  if (input.dailyFee != null && (input.dailyFee < 0 || input.dailyFee > 50_000)) {
    errors.dailyFee = 'Daily fee must be between Rs 0 and Rs 50,000.'
  }
  if (input.pickupInstructions.trim().length < 5) {
    errors.pickupInstructions = 'Tell neighbors where/how to pick up (5+ characters).'
  }
  return errors
}

// ---------------------------------------------------------------------------
// Phase 5: create a listing in ANY section (the 5-step wizard's input)
// ---------------------------------------------------------------------------

export interface CreateListingInput {
  ownerId: string
  section: ListingSection
  listingType: ListingType
  title: string
  description: string
  /** 0 for borrow; required > 0 for rent/sell. */
  price: number
  priceUnit: PriceUnit
  negotiable: boolean
  photos: string[]
  details: ItemListing['details'] | VehicleDetails | PropertyDetails | ArenaDetails
}

const MAX_PRICE = 500_000_000
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** Editable basics from the owner dashboard (title, description, price…). */
export interface UpdateListingBasicsInput {
  title?: string
  description?: string
  price?: number
  negotiable?: boolean
}

export function validateCreateListingInput(input: CreateListingInput): Record<string, string> {
  const errors: Record<string, string> = {}
  if (input.title.trim().length < 3 || input.title.trim().length > 80) {
    errors.title = 'Title must be 3–80 characters.'
  }
  if (input.description.trim().length < 10 || input.description.trim().length > 1000) {
    errors.description = 'Description must be 10–1000 characters.'
  }
  if (input.section === 'arenas' && input.listingType !== 'rent') {
    errors.listingType = 'Arenas are always rented by the slot.'
  }
  if (input.listingType === 'borrow' && input.price !== 0) {
    errors.price = 'Borrow listings are free — set the price to 0.'
  }
  if (input.listingType !== 'borrow' && (!Number.isFinite(input.price) || input.price <= 0)) {
    errors.price = 'Set a price above Rs 0.'
  }
  if (Number.isFinite(input.price) && input.price > MAX_PRICE) {
    errors.price = `Price must be Rs ${MAX_PRICE.toLocaleString('en-PK')} or less.`
  }

  switch (input.section) {
    case 'items': {
      const d = input.details as ItemListing['details']
      if (!ITEM_CATEGORIES.includes(d.category)) errors.category = 'Pick one of the categories.'
      if (!d.condition || d.condition.trim().length < 3) {
        errors.condition = 'Add a short condition note (e.g. "Good — works great").'
      }
      if (!Number.isInteger(d.maxDurationDays) || d.maxDurationDays < 1 || d.maxDurationDays > 60) {
        errors.maxDurationDays = 'Max borrow duration must be 1–60 days.'
      }
      if (d.depositAmount != null && (d.depositAmount < 0 || d.depositAmount > 200_000)) {
        errors.depositAmount = 'Deposit must be between Rs 0 and Rs 200,000.'
      }
      if (!d.pickupInstructions || d.pickupInstructions.trim().length < 5) {
        errors.pickupInstructions = 'Tell neighbors where/how to pick up (5+ characters).'
      }
      break
    }
    case 'vehicles': {
      const d = input.details as VehicleDetails
      if (!d.make?.trim()) errors.make = 'Add the make (e.g. Toyota).'
      if (!d.model?.trim()) errors.model = 'Add the model (e.g. Corolla GLi).'
      const maxYear = new Date().getFullYear() + 1
      if (!Number.isInteger(d.year) || d.year < 1950 || d.year > maxYear) {
        errors.year = `Year must be between 1950 and ${maxYear}.`
      }
      if (!Number.isFinite(d.mileageKm) || d.mileageKm < 0) {
        errors.mileageKm = 'Mileage can’t be negative.'
      }
      if (!d.condition || d.condition.trim().length < 3) {
        errors.condition = 'Add a short condition note.'
      }
      break
    }
    case 'properties': {
      const d = input.details as PropertyDetails
      if (!PROPERTY_TYPES.includes(d.propertyType)) errors.propertyType = 'Pick a property type.'
      if (!Number.isFinite(d.areaSize) || d.areaSize <= 0) {
        errors.areaSize = 'Area size must be above 0.'
      }
      if (d.bedrooms != null && (d.bedrooms < 0 || d.bedrooms > 30)) {
        errors.bedrooms = 'Bedrooms must be 0–30.'
      }
      if (d.bathrooms != null && (d.bathrooms < 0 || d.bathrooms > 30)) {
        errors.bathrooms = 'Bathrooms must be 0–30.'
      }
      break
    }
    case 'arenas': {
      const d = input.details as ArenaDetails
      if (!d.sportTypes?.length) errors.sportTypes = 'Pick at least one sport.'
      if (!Number.isInteger(d.capacity) || d.capacity < 1) {
        errors.capacity = 'Capacity must be at least 1.'
      }
      if (
        !TIME_RE.test(d.openingHours?.opens ?? '') ||
        !TIME_RE.test(d.openingHours?.closes ?? '')
      ) {
        errors.openingHours = 'Opening hours must be HH:mm times.'
      } else if (d.openingHours.opens >= d.openingHours.closes) {
        errors.openingHours = 'The arena must open before it closes.'
      }
      if (![30, 60, 90, 120].includes(d.slotMinutes)) {
        errors.slotMinutes = 'Slots are 30, 60, 90, or 120 minutes.'
      }
      break
    }
  }
  return errors
}
