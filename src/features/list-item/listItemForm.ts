import type {
  ItemCategory,
  Listing,
  ListingSection,
  ListingType,
  PickupPreference,
  PriceUnit,
  PropertyAreaUnit,
  PropertyType,
  User,
  VehicleFuelType,
  VehicleTransmission,
} from '@/types'
import { ITEM_CATEGORIES, LISTING_SECTIONS, PROPERTY_TYPES } from '@/types'
import type { CreateListingInput } from '@/services/listingValidation'
import { validateCreateListingInput } from '@/services/listingValidation'
import { dateInputToIso } from '@/utils/dates'

/**
 * The 5-step listing wizard (Phase 5): one reducer owns ALL form state
 * for every section — draft values, current step, validation errors,
 * dirty/restored flags — no per-field useState in the component. Pure
 * validators + the CreateListingInput builder live here too, unit
 * tested without React. Drafts persist to localStorage (see
 * useListItemDraft) so leaving mid-form never loses progress.
 */

export const LIST_ITEM_STEPS = [
  'Section & type',
  'Details',
  'Photos',
  'Price & place',
  'Preview',
] as const
export const LIST_ITEM_STEP_COUNT = LIST_ITEM_STEPS.length

/** Per-section photo caps (Phase 4 spec, enforced already in the wizard). */
export const PHOTO_LIMITS: Record<ListingSection, number> = {
  items: 10,
  vehicles: 15,
  properties: 20,
  arenas: 10,
}

/** Vehicles & properties must show at least this many photos to publish. */
export const PHOTO_MINIMUM: Partial<Record<ListingSection, number>> = {
  vehicles: 3,
  properties: 3,
}

export interface ListItemDraft {
  section: ListingSection
  listingType: ListingType
  title: string
  description: string
  photos: string[]
  price: number | ''
  priceUnit: PriceUnit
  negotiable: boolean
  // items
  category: ItemCategory | ''
  condition: string
  maxDurationDays: number | ''
  depositAmount: number | ''
  pickupPreference: PickupPreference
  pickupInstructions: string
  // vehicles
  make: string
  model: string
  year: number | ''
  mileageKm: number | ''
  fuelType: VehicleFuelType
  transmission: VehicleTransmission
  registrationCity: string
  withDriver: boolean
  // properties
  propertyType: PropertyType | ''
  areaSize: number | ''
  areaUnit: PropertyAreaUnit
  bedrooms: number | ''
  bathrooms: number | ''
  furnished: boolean
  availableFrom: string // YYYY-MM-DD
  amenities: string // comma-separated
  // arenas
  sportTypes: string // comma-separated
  surface: string
  capacity: number | ''
  opens: string // HH:mm
  closes: string // HH:mm
  slotMinutes: number
  floodlights: boolean
  parking: boolean
  washrooms: boolean
  changingRooms: boolean
  minAdvanceHours: number | ''
  maxAdvanceDays: number | ''
}

export type DraftField = keyof ListItemDraft

export interface ListItemFormState {
  draft: ListItemDraft
  stepIndex: number
  errors: Partial<Record<DraftField | 'photos', string>>
  showErrors: boolean
  dirty: boolean
  restored: boolean
}

export type FormErrors = Partial<Record<DraftField | 'photos', string>>

export const EMPTY_DRAFT: ListItemDraft = {
  section: 'items',
  listingType: 'borrow',
  title: '',
  description: '',
  photos: [],
  price: '',
  priceUnit: 'day',
  negotiable: false,
  category: '',
  condition: '',
  maxDurationDays: '',
  depositAmount: '',
  pickupPreference: 'either',
  pickupInstructions: '',
  make: '',
  model: '',
  year: '',
  mileageKm: '',
  fuelType: 'petrol',
  transmission: 'manual',
  registrationCity: '',
  withDriver: false,
  propertyType: '',
  areaSize: '',
  areaUnit: 'marla',
  bedrooms: '',
  bathrooms: '',
  furnished: false,
  availableFrom: '',
  amenities: '',
  sportTypes: '',
  surface: '',
  capacity: '',
  opens: '08:00',
  closes: '23:00',
  slotMinutes: 60,
  floodlights: false,
  parking: false,
  washrooms: false,
  changingRooms: false,
  minAdvanceHours: '',
  maxAdvanceDays: '',
}

export const initialListItemFormState: ListItemFormState = {
  draft: EMPTY_DRAFT,
  stepIndex: 0,
  errors: {},
  showErrors: false,
  dirty: false,
  restored: false,
}

/** Deal types a section supports (arenas are rent-only by definition). */
export function dealTypesFor(section: ListingSection): ListingType[] {
  if (section === 'items') return ['borrow', 'rent', 'sell']
  if (section === 'arenas') return ['rent']
  return ['rent', 'sell']
}

const DEFAULT_PRICE_UNIT: Record<ListingSection, PriceUnit> = {
  items: 'day',
  vehicles: 'day',
  properties: 'month',
  arenas: 'hour',
}

// ---------------------------------------------------------------------------
// Pure per-step validators
// ---------------------------------------------------------------------------

function validateTitle(title: string): string | undefined {
  const trimmed = title.trim()
  if (trimmed.length < 3) return 'Give it a title of at least 3 characters.'
  if (trimmed.length > 80) return 'Keep the title under 80 characters.'
  return undefined
}

/** Step 0: section + deal type + title. */
export function validateSectionStep(draft: ListItemDraft): FormErrors {
  const errors: FormErrors = {}
  if (!dealTypesFor(draft.section).includes(draft.listingType)) {
    errors.listingType =
      draft.section === 'arenas'
        ? 'Arenas are rented by the slot.'
        : 'This section doesn’t support borrowing — pick rent or sell.'
  }
  const titleError = validateTitle(draft.title)
  if (titleError) errors.title = titleError
  return errors
}

/** Step 1: description + the section's own detail fields. */
export function validateDetailsStep(draft: ListItemDraft): FormErrors {
  const errors: FormErrors = {}
  const description = draft.description.trim()
  if (description.length < 10) {
    errors.description = 'Write at least 10 characters — what is it, and what’s included?'
  } else if (description.length > 1000) {
    errors.description = 'Descriptions max out at 1000 characters.'
  }

  if (draft.section === 'items') {
    if (!draft.category || !ITEM_CATEGORIES.includes(draft.category)) {
      errors.category = 'Pick the category that fits best.'
    }
    if (draft.condition.trim().length < 3) {
      errors.condition = 'Add a short condition note (e.g. "Good — works great").'
    }
    if (draft.listingType !== 'sell') {
      if (
        draft.maxDurationDays === '' ||
        !Number.isInteger(Number(draft.maxDurationDays)) ||
        Number(draft.maxDurationDays) < 1 ||
        Number(draft.maxDurationDays) > 60
      ) {
        errors.maxDurationDays = 'Max duration must be a whole number of days (1–60).'
      }
      if (draft.pickupInstructions.trim().length < 5) {
        errors.pickupInstructions = 'Tell neighbors where and how to pick it up (5+ characters).'
      }
    }
    if (
      draft.depositAmount !== '' &&
      (Number(draft.depositAmount) < 0 || Number(draft.depositAmount) > 200_000)
    ) {
      errors.depositAmount = 'Deposit must be between Rs 0 and Rs 200,000.'
    }
  }

  if (draft.section === 'vehicles') {
    if (!draft.make.trim()) errors.make = 'Add the make (e.g. Toyota).'
    if (!draft.model.trim()) errors.model = 'Add the model (e.g. Corolla GLi).'
    const maxYear = new Date().getFullYear() + 1
    if (
      draft.year === '' ||
      !Number.isInteger(Number(draft.year)) ||
      Number(draft.year) < 1950 ||
      Number(draft.year) > maxYear
    ) {
      errors.year = `Year must be between 1950 and ${maxYear}.`
    }
    if (draft.mileageKm === '' || Number(draft.mileageKm) < 0) {
      errors.mileageKm = 'Add the mileage in km (0 or more).'
    }
    if (draft.condition.trim().length < 3) {
      errors.condition = 'Add a short condition note.'
    }
    if (!draft.registrationCity.trim()) {
      errors.registrationCity = 'Add the registration city.'
    }
  }

  if (draft.section === 'properties') {
    if (!draft.propertyType || !PROPERTY_TYPES.includes(draft.propertyType)) {
      errors.propertyType = 'Pick a property type.'
    }
    if (draft.areaSize === '' || Number(draft.areaSize) <= 0) {
      errors.areaSize = 'Area size must be above 0.'
    }
    for (const field of ['bedrooms', 'bathrooms'] as const) {
      const value = draft[field]
      if (value !== '' && (Number(value) < 0 || Number(value) > 30)) {
        errors[field] = 'Must be 0–30 (leave empty when it doesn’t apply).'
      }
    }
  }

  if (draft.section === 'arenas') {
    if (splitList(draft.sportTypes).length === 0) {
      errors.sportTypes = 'Name at least one sport (e.g. Futsal, Cricket).'
    }
    if (!draft.surface.trim()) errors.surface = 'Add the surface (e.g. Astro turf).'
    if (
      draft.capacity === '' ||
      !Number.isInteger(Number(draft.capacity)) ||
      Number(draft.capacity) < 1
    ) {
      errors.capacity = 'Capacity must be at least 1.'
    }
    if (!/^\d{2}:\d{2}$/.test(draft.opens) || !/^\d{2}:\d{2}$/.test(draft.closes)) {
      errors.opens = 'Use HH:mm times for opening hours.'
    } else if (draft.opens >= draft.closes) {
      errors.opens = 'The arena must open before it closes.'
    }
    if (![30, 60, 90, 120].includes(draft.slotMinutes)) {
      errors.slotMinutes = 'Slots are 30, 60, 90, or 120 minutes.'
    }
  }
  return errors
}

/** Step 2: photos — required minimum for vehicles/properties only. */
export function validatePhotosStep(draft: ListItemDraft): FormErrors {
  const errors: FormErrors = {}
  const minimum = PHOTO_MINIMUM[draft.section] ?? 0
  if (draft.photos.length < minimum) {
    errors.photos = `Add at least ${minimum} photo links to publish a ${draft.section === 'vehicles' ? 'vehicle' : 'property'} — buyers need to see it.`
  }
  if (draft.photos.length > PHOTO_LIMITS[draft.section]) {
    errors.photos = `At most ${PHOTO_LIMITS[draft.section]} photos for this section.`
  }
  return errors
}

/** Step 3: price (+ negotiable only makes sense for sell). */
export function validatePriceStep(draft: ListItemDraft): FormErrors {
  const errors: FormErrors = {}
  if (draft.listingType !== 'borrow') {
    if (draft.price === '' || !Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0) {
      errors.price = 'Set a price above Rs 0.'
    } else if (Number(draft.price) > 500_000_000) {
      errors.price = 'Price must be Rs 500,000,000 or less.'
    }
  }
  return errors
}

function validateStep(stepIndex: number, draft: ListItemDraft): FormErrors {
  switch (stepIndex) {
    case 0:
      return validateSectionStep(draft)
    case 1:
      return validateDetailsStep(draft)
    case 2:
      return validatePhotosStep(draft)
    case 3:
      return validatePriceStep(draft)
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Draft → service input + preview listing
// ---------------------------------------------------------------------------

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Convert the draft into the shared CreateListingInput and run the SAME
 * validator both backends use — if this returns input, publish cannot
 * fail validation downstream.
 */
export function buildCreateInput(
  draft: ListItemDraft,
  ownerId: string,
): { input: CreateListingInput } | { errors: FormErrors } {
  const isSell = draft.listingType === 'sell'
  const price = draft.listingType === 'borrow' ? 0 : Number(draft.price || 0)
  const priceUnit: PriceUnit = isSell
    ? 'fixed'
    : draft.section === 'arenas'
      ? 'hour'
      : draft.priceUnit

  let details: CreateListingInput['details']
  if (draft.section === 'items') {
    details = {
      category: (draft.category || 'Other') as ItemCategory,
      condition: draft.condition,
      depositAmount: draft.depositAmount === '' ? null : Number(draft.depositAmount),
      maxDurationDays: isSell ? 7 : Number(draft.maxDurationDays || 7),
      pickupPreference: draft.pickupPreference,
      pickupInstructions: isSell
        ? draft.pickupInstructions.trim() || 'Pickup arranged over chat after the sale.'
        : draft.pickupInstructions,
    }
  } else if (draft.section === 'vehicles') {
    details = {
      make: draft.make.trim(),
      model: draft.model.trim(),
      year: Number(draft.year),
      mileageKm: Number(draft.mileageKm),
      fuelType: draft.fuelType,
      transmission: draft.transmission,
      condition: draft.condition,
      withDriver: draft.withDriver,
      registrationCity: draft.registrationCity.trim(),
    }
  } else if (draft.section === 'properties') {
    details = {
      propertyType: (draft.propertyType || 'apartment') as PropertyType,
      bedrooms: draft.bedrooms === '' ? null : Number(draft.bedrooms),
      bathrooms: draft.bathrooms === '' ? null : Number(draft.bathrooms),
      areaSize: Number(draft.areaSize),
      areaUnit: draft.areaUnit,
      furnished: draft.furnished,
      floor: null,
      amenities: splitList(draft.amenities),
      availableFrom: dateInputToIso(draft.availableFrom) ?? new Date().toISOString(),
    }
  } else {
    details = {
      sportTypes: splitList(draft.sportTypes),
      surface: draft.surface.trim(),
      capacity: Number(draft.capacity),
      openingHours: { opens: draft.opens, closes: draft.closes },
      slotMinutes: draft.slotMinutes,
      facilities: {
        floodlights: draft.floodlights,
        parking: draft.parking,
        washrooms: draft.washrooms,
        changingRooms: draft.changingRooms,
      },
      advanceBooking: {
        maxAdvanceDays: draft.maxAdvanceDays === '' ? 14 : Number(draft.maxAdvanceDays),
        minAdvanceHours: draft.minAdvanceHours === '' ? 2 : Number(draft.minAdvanceHours),
      },
    }
  }

  const input: CreateListingInput = {
    ownerId,
    section: draft.section,
    listingType: draft.listingType,
    title: draft.title.trim(),
    description: draft.description.trim(),
    price,
    priceUnit,
    negotiable: isSell ? draft.negotiable : false,
    photos: draft.photos,
    details,
  }
  const errors = validateCreateListingInput(input)
  return Object.keys(errors).length > 0 ? { errors: errors as FormErrors } : { input }
}

/** A real Listing built from the draft, for the preview step's card. */
export function buildPreviewListing(draft: ListItemDraft, owner: User): Listing | null {
  const built = buildCreateInput(draft, owner.id)
  if ('errors' in built) return null
  const { input } = built
  const now = new Date().toISOString()
  // The section/details pairing was just validated by buildCreateInput;
  // the cast only bridges TS's inability to narrow the pair together.
  return {
    id: 'preview',
    ownerId: owner.id,
    section: input.section,
    listingType: input.listingType,
    title: input.title || 'Untitled listing',
    description: input.description,
    price: input.price,
    currency: 'PKR',
    priceUnit: input.priceUnit,
    negotiable: input.negotiable,
    photos: input.photos,
    location: {
      lat: owner.homeLocation.lat,
      lng: owner.homeLocation.lng,
      city: owner.city,
      area: owner.neighborhood,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
    views: 0,
    details: input.details,
  } as Listing
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type ListItemFormAction =
  | { type: 'field'; field: DraftField; value: ListItemDraft[DraftField] }
  | { type: 'photos_add'; urls: string[] }
  | { type: 'photo_remove'; index: number }
  | { type: 'photo_cover'; index: number }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goto'; stepIndex: number }
  | { type: 'restored'; draft: ListItemDraft; stepIndex: number }
  | { type: 'reset' }

function clampStep(index: number): number {
  return Math.max(0, Math.min(LIST_ITEM_STEP_COUNT - 1, index))
}

/** Changing section coerces the deal type + price unit to valid defaults. */
function coerceForSection(draft: ListItemDraft): ListItemDraft {
  const types = dealTypesFor(draft.section)
  return {
    ...draft,
    listingType: types.includes(draft.listingType) ? draft.listingType : types[0],
    priceUnit: DEFAULT_PRICE_UNIT[draft.section],
    photos: draft.photos.slice(0, PHOTO_LIMITS[draft.section]),
  }
}

export function listItemFormReducer(
  state: ListItemFormState,
  action: ListItemFormAction,
): ListItemFormState {
  switch (action.type) {
    case 'field': {
      let draft = { ...state.draft, [action.field]: action.value }
      if (action.field === 'section') draft = coerceForSection(draft)
      const errors = state.showErrors ? validateStep(state.stepIndex, draft) : state.errors
      return { ...state, draft, errors, dirty: true }
    }
    case 'photos_add': {
      if (action.urls.length === 0) return state
      const photos = [...state.draft.photos, ...action.urls].slice(
        0,
        PHOTO_LIMITS[state.draft.section],
      )
      const draft = { ...state.draft, photos }
      const errors = state.showErrors ? validateStep(state.stepIndex, draft) : state.errors
      return { ...state, draft, errors, dirty: true }
    }
    case 'photo_remove': {
      const photos = state.draft.photos.filter((_, i) => i !== action.index)
      return { ...state, draft: { ...state.draft, photos }, dirty: true }
    }
    case 'photo_cover': {
      if (action.index <= 0 || action.index >= state.draft.photos.length) return state
      const photos = [...state.draft.photos]
      const [cover] = photos.splice(action.index, 1)
      photos.unshift(cover)
      return { ...state, draft: { ...state.draft, photos }, dirty: true }
    }
    case 'next': {
      const errors = validateStep(state.stepIndex, state.draft)
      if (Object.keys(errors).length > 0) {
        return { ...state, errors, showErrors: true }
      }
      return { ...state, stepIndex: clampStep(state.stepIndex + 1), errors: {}, showErrors: false }
    }
    case 'back':
      return { ...state, stepIndex: clampStep(state.stepIndex - 1), errors: {}, showErrors: false }
    case 'goto':
      return { ...state, stepIndex: clampStep(action.stepIndex), errors: {}, showErrors: false }
    case 'restored':
      return {
        ...state,
        draft: action.draft,
        stepIndex: clampStep(action.stepIndex),
        dirty: true,
        restored: true,
      }
    case 'reset':
      return { ...initialListItemFormState }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}

// ---------------------------------------------------------------------------
// Draft persistence (localStorage) — defensive: storage may be missing/full
// ---------------------------------------------------------------------------

export const DRAFT_STORAGE_KEY = 'neighbormart:list-listing-draft:v2'

interface StoredDraft {
  draft: ListItemDraft
  stepIndex: number
  savedAt: number
}

export function isDraftWorthSaving(draft: ListItemDraft): boolean {
  return (
    draft.title.trim() !== '' ||
    draft.description.trim() !== '' ||
    draft.photos.length > 0 ||
    draft.condition.trim() !== '' ||
    draft.make.trim() !== '' ||
    draft.sportTypes.trim() !== ''
  )
}

export function saveDraftToStorage(state: ListItemFormState): void {
  if (!isDraftWorthSaving(state.draft)) return
  const payload: StoredDraft = {
    draft: state.draft,
    stepIndex: state.stepIndex,
    savedAt: Date.now(),
  }
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Private-browsing/quota issues: drafts just won't persist, no crash.
  }
}

export function clearDraftStorage(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // Ignore — nothing to clean up.
  }
}

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const asNumber = (v: unknown): number | '' => (typeof v === 'number' && Number.isFinite(v) ? v : '')
const asBool = (v: unknown): boolean => v === true
const asOneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

/** Parse + sanitize a stored draft. Returns null for garbage/missing data. */
export function readDraftFromStorage(): { draft: ListItemDraft; stepIndex: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const candidate = parsed as Partial<StoredDraft>
    const d = candidate.draft
    if (typeof d !== 'object' || d === null) return null
    const rec = d as unknown as Record<string, unknown>

    const section = asOneOf(rec.section, LISTING_SECTIONS, 'items')
    const photos = Array.isArray(rec.photos)
      ? rec.photos.filter((p): p is string => typeof p === 'string').slice(0, PHOTO_LIMITS[section])
      : []

    const draft: ListItemDraft = {
      ...EMPTY_DRAFT,
      section,
      listingType: asOneOf(rec.listingType, ['borrow', 'rent', 'sell'] as const, 'borrow'),
      title: asString(rec.title),
      description: asString(rec.description),
      photos,
      price: asNumber(rec.price),
      priceUnit: asOneOf(rec.priceUnit, ['hour', 'day', 'week', 'month', 'fixed'] as const, 'day'),
      negotiable: asBool(rec.negotiable),
      category: asOneOf(rec.category, [...ITEM_CATEGORIES, ''] as const, ''),
      condition: asString(rec.condition),
      maxDurationDays: asNumber(rec.maxDurationDays),
      depositAmount: asNumber(rec.depositAmount),
      pickupPreference: asOneOf(
        rec.pickupPreference,
        ['pickup', 'drop-off', 'either'] as const,
        'either',
      ),
      pickupInstructions: asString(rec.pickupInstructions),
      make: asString(rec.make),
      model: asString(rec.model),
      year: asNumber(rec.year),
      mileageKm: asNumber(rec.mileageKm),
      fuelType: asOneOf(
        rec.fuelType,
        ['petrol', 'diesel', 'cng', 'hybrid', 'electric'] as const,
        'petrol',
      ),
      transmission: asOneOf(rec.transmission, ['manual', 'automatic'] as const, 'manual'),
      registrationCity: asString(rec.registrationCity),
      withDriver: asBool(rec.withDriver),
      propertyType: asOneOf(rec.propertyType, [...PROPERTY_TYPES, ''] as const, ''),
      areaSize: asNumber(rec.areaSize),
      areaUnit: asOneOf(rec.areaUnit, ['marla', 'kanal', 'sqft', 'sqyd'] as const, 'marla'),
      bedrooms: asNumber(rec.bedrooms),
      bathrooms: asNumber(rec.bathrooms),
      furnished: asBool(rec.furnished),
      availableFrom: asString(rec.availableFrom),
      amenities: asString(rec.amenities),
      sportTypes: asString(rec.sportTypes),
      surface: asString(rec.surface),
      capacity: asNumber(rec.capacity),
      opens: asString(rec.opens, '08:00'),
      closes: asString(rec.closes, '23:00'),
      slotMinutes: typeof rec.slotMinutes === 'number' ? rec.slotMinutes : 60,
      floodlights: asBool(rec.floodlights),
      parking: asBool(rec.parking),
      washrooms: asBool(rec.washrooms),
      changingRooms: asBool(rec.changingRooms),
      minAdvanceHours: asNumber(rec.minAdvanceHours),
      maxAdvanceDays: asNumber(rec.maxAdvanceDays),
    }

    return {
      draft: coerceForSection(draft),
      stepIndex:
        typeof candidate.stepIndex === 'number' && Number.isInteger(candidate.stepIndex)
          ? clampStep(candidate.stepIndex)
          : 0,
    }
  } catch {
    return null
  }
}
