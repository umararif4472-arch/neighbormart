import { beforeAll, describe, expect, it } from 'vitest'
import {
  DRAFT_STORAGE_KEY,
  EMPTY_DRAFT,
  LIST_ITEM_STEPS,
  initialListItemFormState,
  isDraftWorthSaving,
  listItemFormReducer,
  readDraftFromStorage,
  validateBasicsStep,
  validateDetailsStep,
  validateTermsStep,
  type ListItemDraft,
} from './listItemForm'

const VALID_DRAFT: ListItemDraft = {
  ...EMPTY_DRAFT,
  category: 'Tools',
  title: 'Cordless Drill',
  description: 'Reliable drill with two batteries.',
  condition: 'Good — works great',
  maxDurationDays: 7,
  pickupPreference: 'either',
  pickupInstructions: 'Porch pickup after 5pm.',
}

/** Minimal localStorage shim (vitest runs in the node environment). */
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

describe('step validators', () => {
  it('basics: requires a category and a 3–80 char title', () => {
    const errors = validateBasicsStep(EMPTY_DRAFT)
    expect(errors.category).toBeDefined()
    expect(errors.title).toBeDefined()
    expect(validateBasicsStep({ ...VALID_DRAFT, title: 'ab' }).title).toBeDefined()
    expect(validateBasicsStep({ ...VALID_DRAFT, title: 'x'.repeat(81) }).title).toBeDefined()
    expect(Object.keys(validateBasicsStep(VALID_DRAFT))).toHaveLength(0)
  })

  it('details: requires 10+ char description and 3+ char condition', () => {
    const errors = validateDetailsStep({ ...VALID_DRAFT, description: 'short', condition: 'ok' })
    expect(errors.description).toBeDefined()
    expect(errors.condition).toBeDefined()
    expect(Object.keys(validateDetailsStep(VALID_DRAFT))).toHaveLength(0)
  })

  it('terms: requires duration 1–60, sane money, 5+ char instructions', () => {
    const bad = validateTermsStep({
      ...VALID_DRAFT,
      maxDurationDays: 0,
      depositAmount: -5,
      dailyFee: 50001,
      pickupInstructions: 'hi',
    })
    expect(bad.maxDurationDays).toBeDefined()
    expect(bad.depositAmount).toBeDefined()
    expect(bad.dailyFee).toBeDefined()
    expect(bad.pickupInstructions).toBeDefined()
    expect(Object.keys(validateTermsStep(VALID_DRAFT))).toHaveLength(0)
    // Empty deposit/fee are fine (optional).
    expect(
      Object.keys(validateTermsStep({ ...VALID_DRAFT, depositAmount: '', dailyFee: '' })),
    ).toHaveLength(0)
  })
})

describe('listItemFormReducer', () => {
  it('blocks "next" on an invalid step and surfaces field errors', () => {
    const blocked = listItemFormReducer(initialListItemFormState, { type: 'next' })
    expect(blocked.stepIndex).toBe(0)
    expect(blocked.showErrors).toBe(true)
    expect(blocked.errors.category).toBeDefined()
    expect(blocked.errors.title).toBeDefined()
  })

  it('advances when the step is valid', () => {
    let state = initialListItemFormState
    state = listItemFormReducer(state, { type: 'field', field: 'category', value: 'Tools' })
    state = listItemFormReducer(state, { type: 'field', field: 'title', value: 'Cordless Drill' })
    state = listItemFormReducer(state, { type: 'next' })
    expect(state.stepIndex).toBe(1)
  })

  it('clears a field error as soon as the field is fixed', () => {
    let state = listItemFormReducer(initialListItemFormState, { type: 'next' })
    expect(state.errors.title).toBeDefined()
    state = listItemFormReducer(state, { type: 'field', field: 'title', value: 'Cordless Drill' })
    expect(state.errors.title).toBeUndefined()
    expect(state.errors.category).toBeDefined() // still missing
  })

  it('round-trips steps with back/goto without skipping validation on next', () => {
    let state = { ...initialListItemFormState, draft: VALID_DRAFT, dirty: true }
    state = listItemFormReducer(state, { type: 'next' }) // → details
    state = listItemFormReducer(state, { type: 'next' }) // → terms
    state = listItemFormReducer(state, { type: 'next' }) // → preview
    expect(state.stepIndex).toBe(3)
    expect(LIST_ITEM_STEPS[state.stepIndex]).toBe('Preview')
    state = listItemFormReducer(state, { type: 'goto', stepIndex: 0 })
    expect(state.stepIndex).toBe(0)
    // Going next from step 0 re-validates basics even though we came back.
    state = listItemFormReducer(state, { type: 'field', field: 'title', value: 'x' })
    state = listItemFormReducer(state, { type: 'next' })
    expect(state.stepIndex).toBe(0)
  })

  it('adds and removes photos with a cap', () => {
    let state = initialListItemFormState
    state = listItemFormReducer(state, {
      type: 'photos_add',
      urls: ['a.png', 'b.png', 'c.png', 'd.png'],
    })
    expect(state.draft.photos).toEqual(['a.png', 'b.png', 'c.png'])
    state = listItemFormReducer(state, { type: 'photo_remove', index: 1 })
    expect(state.draft.photos).toEqual(['a.png', 'c.png'])
  })

  it('reset returns to the pristine initial state', () => {
    let state = { ...initialListItemFormState, draft: VALID_DRAFT, stepIndex: 2, dirty: true }
    state = listItemFormReducer(state, { type: 'reset' })
    expect(state).toEqual(initialListItemFormState)
  })
})

describe('draft persistence helpers', () => {
  it('only saves drafts worth saving', () => {
    expect(isDraftWorthSaving(EMPTY_DRAFT)).toBe(false)
    expect(isDraftWorthSaving({ ...EMPTY_DRAFT, title: 'Drill' })).toBe(true)
  })

  it('returns null for missing/garbage storage instead of throwing', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{not json')
    expect(readDraftFromStorage()).toBeNull()
    localStorage.removeItem(DRAFT_STORAGE_KEY)
    expect(readDraftFromStorage()).toBeNull()
  })

  it('sanitizes a stored draft, dropping invalid fields', () => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        draft: { category: 'Nonsense', title: 42, photos: ['a.png', 7], maxDurationDays: 'x' },
        stepIndex: 99,
      }),
    )
    const restored = readDraftFromStorage()
    expect(restored).not.toBeNull()
    expect(restored!.draft.category).toBe('')
    expect(restored!.draft.title).toBe('')
    expect(restored!.draft.photos).toEqual(['a.png'])
    expect(restored!.draft.maxDurationDays).toBe('')
    expect(restored!.stepIndex).toBe(LIST_ITEM_STEPS.length - 1) // clamped
    localStorage.clear()
  })
})
