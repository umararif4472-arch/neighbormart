import { beforeAll, describe, expect, it } from 'vitest'
import {
  DRAFT_STORAGE_KEY,
  EMPTY_DRAFT,
  buildCreateInput,
  initialListItemFormState,
  isDraftWorthSaving,
  listItemFormReducer,
  readDraftFromStorage,
  validateDetailsStep,
  validatePhotosStep,
  validatePriceStep,
  validateSectionStep,
  type ListItemDraft,
} from './listItemForm'

/**
 * The wizard form is pure logic — validators, the section coercion in
 * the reducer, the CreateListingInput builder, and draft persistence
 * are all tested without rendering React.
 */

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  clear(): void {
    this.map.clear()
  }
}

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    ;(globalThis as Record<string, unknown>).localStorage = new MemoryStorage()
  }
  localStorage.clear()
})

const draft = (patch: Partial<ListItemDraft>): ListItemDraft => ({ ...EMPTY_DRAFT, ...patch })

const validVehicle = draft({
  section: 'vehicles',
  listingType: 'sell',
  title: 'Toyota Corolla GLi 2021',
  description: 'Total genuine car, new tyres, token paid, family used.',
  make: 'Toyota',
  model: 'Corolla GLi',
  year: 2021,
  mileageKm: 45000,
  condition: 'Excellent',
  registrationCity: 'Lahore',
  price: 4850000,
  photos: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
})

describe('step validators', () => {
  it('section step: title rules + deal types per section', () => {
    expect(validateSectionStep(draft({ title: 'ab' })).title).toBeTruthy()
    expect(validateSectionStep(draft({ title: 'Good title' }))).toEqual({})
    expect(
      validateSectionStep(draft({ section: 'vehicles', listingType: 'borrow', title: 'Car' }))
        .listingType,
    ).toBeTruthy()
    expect(
      validateSectionStep(draft({ section: 'arenas', listingType: 'rent', title: 'Turf' })),
    ).toEqual({})
  })

  it('details step: per-section required fields', () => {
    expect(validateDetailsStep(draft({})).description).toBeTruthy()
    expect(validateDetailsStep(validVehicle)).toEqual({})
    const arena = draft({
      section: 'arenas',
      listingType: 'rent',
      description: 'Floodlit turf in Johar Town, open late.',
      sportTypes: 'Futsal',
      surface: 'Astro turf',
      capacity: 40,
    })
    expect(validateDetailsStep(arena)).toEqual({})
    expect(validateDetailsStep({ ...arena, opens: '23:00', closes: '08:00' }).opens).toBeTruthy()
  })

  it('photos step: vehicles/properties need at least 3', () => {
    expect(validatePhotosStep(draft({ photos: [] }))).toEqual({})
    expect(validatePhotosStep({ ...validVehicle, photos: ['a'] }).photos).toBeTruthy()
    expect(validatePhotosStep(validVehicle)).toEqual({})
  })

  it('price step: borrow is free, rent/sell need a positive price', () => {
    expect(validatePriceStep(draft({ listingType: 'borrow' }))).toEqual({})
    expect(validatePriceStep(draft({ listingType: 'rent', price: '' })).price).toBeTruthy()
    expect(validatePriceStep(draft({ listingType: 'sell', price: 100 }))).toEqual({})
  })
})

describe('buildCreateInput', () => {
  it('builds a valid vehicle sell input', () => {
    const built = buildCreateInput(validVehicle, 'u-maya')
    expect('input' in built && built.input.section).toBe('vehicles')
    expect('input' in built && built.input.priceUnit).toBe('fixed')
    expect('input' in built && built.input.price).toBe(4850000)
  })

  it('arenas default the advance-booking window and charge per hour', () => {
    const built = buildCreateInput(
      draft({
        section: 'arenas',
        listingType: 'rent',
        title: 'Padel Court',
        description: 'Indoor padel court with coaching on request.',
        sportTypes: 'Padel, Squash',
        surface: 'Indoor wooden',
        capacity: 12,
        price: 3000,
      }),
      'u-marcus',
    )
    if (!('input' in built)) throw new Error(JSON.stringify(built))
    expect(built.input.priceUnit).toBe('hour')
    const details = built.input.details as {
      sportTypes: string[]
      advanceBooking: { maxAdvanceDays: number }
    }
    expect(details.sportTypes).toEqual(['Padel', 'Squash'])
    expect(details.advanceBooking.maxAdvanceDays).toBe(14)
  })

  it('items borrow forces price 0', () => {
    const built = buildCreateInput(
      draft({
        title: 'Cordless drill',
        description: 'Bosch drill with a full bit set and two batteries.',
        category: 'Tools',
        condition: 'Good',
        maxDurationDays: 7,
        pickupInstructions: 'Porch pickup after 5pm.',
        price: 999,
      }),
      'u-maya',
    )
    expect('input' in built && built.input.price).toBe(0)
  })
})

describe('listItemFormReducer', () => {
  it('blocks "next" on an invalid step and surfaces errors', () => {
    const next = listItemFormReducer(initialListItemFormState, { type: 'next' })
    expect(next.stepIndex).toBe(0)
    expect(next.showErrors).toBe(true)
    expect(next.errors.title).toBeTruthy()
  })

  it('switching section coerces the deal type (vehicles/arenas → rent)', () => {
    const withVehicle = listItemFormReducer(initialListItemFormState, {
      type: 'field',
      field: 'section',
      value: 'vehicles',
    })
    expect(withVehicle.draft.listingType).toBe('rent')
    const arena = listItemFormReducer(withVehicle, {
      type: 'field',
      field: 'section',
      value: 'arenas',
    })
    expect(arena.draft.listingType).toBe('rent')
    expect(arena.draft.priceUnit).toBe('hour')
  })

  it('photo cover promotes to front; remove drops it', () => {
    let s = listItemFormReducer(initialListItemFormState, {
      type: 'photos_add',
      urls: ['a', 'b', 'c'],
    })
    s = listItemFormReducer(s, { type: 'photo_cover', index: 2 })
    expect(s.draft.photos).toEqual(['c', 'a', 'b'])
    s = listItemFormReducer(s, { type: 'photo_remove', index: 0 })
    expect(s.draft.photos).toEqual(['a', 'b'])
  })

  it('reset returns to the pristine initial state', () => {
    const dirty = listItemFormReducer(initialListItemFormState, {
      type: 'field',
      field: 'title',
      value: 'Something',
    })
    expect(listItemFormReducer(dirty, { type: 'reset' })).toEqual(initialListItemFormState)
  })
})

describe('draft persistence helpers', () => {
  it('only saves drafts worth saving', () => {
    expect(isDraftWorthSaving(EMPTY_DRAFT)).toBe(false)
    expect(isDraftWorthSaving(draft({ title: 'Drill' }))).toBe(true)
  })

  it('returns null for missing/garbage storage instead of throwing', () => {
    localStorage.clear()
    expect(readDraftFromStorage()).toBeNull()
    localStorage.setItem(DRAFT_STORAGE_KEY, '{not json')
    expect(readDraftFromStorage()).toBeNull()
  })

  it('sanitizes a stored draft, dropping invalid fields', () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        draft: {
          ...EMPTY_DRAFT,
          section: 'vehicles',
          title: 'Car',
          year: 'not-a-number',
          photos: [42, 'ok'],
        },
        stepIndex: 1,
        savedAt: Date.now(),
      }),
    )
    const restored = readDraftFromStorage()
    expect(restored?.draft.title).toBe('Car')
    expect(restored?.draft.year).toBe('')
    expect(restored?.draft.photos).toEqual(['ok'])
    expect(restored?.draft.listingType).toBe('rent') // coerced from borrow
  })
})
