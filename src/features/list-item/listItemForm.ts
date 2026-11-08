import type { ItemCategory, PickupPreference } from '@/types'
import { ITEM_CATEGORIES } from '@/types'

/**
 * List-an-item form: one reducer owns ALL form state (draft values, current
 * step, validation errors, dirty/restored flags) — no per-field useState
 * scattered around the component. Pure validators live here too, so they can
 * be reasoned about (and unit tested) without React.
 *
 * Draft persistence: the reducer is wrapped by localStorage (see
 * useListItemDraft) so navigating away mid-form never loses progress
 * silently — coming back restores the draft.
 */

export const LIST_ITEM_STEPS = ['The basics', 'Details', 'Borrowing terms', 'Preview'] as const
export const LIST_ITEM_STEP_COUNT = LIST_ITEM_STEPS.length

export const MAX_PHOTOS = 3

export interface ListItemDraft {
  category: ItemCategory | ''
  title: string
  photos: string[]
  description: string
  condition: string
  maxDurationDays: number | '' // '' = not filled in yet
  depositAmount: number | '' // '' = no deposit
  dailyFee: number | '' // '' = free
  pickupPreference: PickupPreference
  pickupInstructions: string
}

export type DraftField = keyof ListItemDraft

export interface ListItemFormState {
  draft: ListItemDraft
  /** 0-based index into LIST_ITEM_STEPS. */
  stepIndex: number
  /** Field errors for the CURRENT step (only shown once the user tries). */
  errors: Partial<Record<DraftField, string>>
  /** True after a failed "Next" — errors become visible, and clear as fixed. */
  showErrors: boolean
  /** Any change since the last reset/publish → draft is worth saving. */
  dirty: boolean
  /** True when state came from localStorage on mount. */
  restored: boolean
}

export const EMPTY_DRAFT: ListItemDraft = {
  category: '',
  title: '',
  photos: [],
  description: '',
  condition: '',
  maxDurationDays: '',
  depositAmount: '',
  dailyFee: '',
  pickupPreference: 'either',
  pickupInstructions: '',
}

export const initialListItemFormState: ListItemFormState = {
  draft: EMPTY_DRAFT,
  stepIndex: 0,
  errors: {},
  showErrors: false,
  dirty: false,
  restored: false,
}

// ---------------------------------------------------------------------------
// Pure per-step validators (used by the reducer AND by tests)
// ---------------------------------------------------------------------------

function validateTitle(title: string): string | undefined {
  const trimmed = title.trim()
  if (trimmed.length < 3) return 'Give it a title of at least 3 characters.'
  if (trimmed.length > 80) return 'Keep the title under 80 characters.'
  return undefined
}

function validateOptionalMoney(value: number | '', label: string, max: number): string | undefined {
  if (value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) return `${label} must be a number.`
  if (n < 0) return `${label} can't be negative — leave it empty to skip.`
  if (n > max) return `${label} must be Rs ${max.toLocaleString('en-PK')} or less.`
  return undefined
}

/** Step 0: category + title (photos are optional but encouraged). */
export function validateBasicsStep(draft: ListItemDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {}
  if (!draft.category || !ITEM_CATEGORIES.includes(draft.category)) {
    errors.category = 'Pick the category that fits best.'
  }
  const titleError = validateTitle(draft.title)
  if (titleError) errors.title = titleError
  return errors
}

/** Step 1: description + condition. */
export function validateDetailsStep(draft: ListItemDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {}
  const description = draft.description.trim()
  if (description.length < 10) {
    errors.description = 'Write at least 10 characters — what is it, and what shape is it in?'
  } else if (description.length > 1000) {
    errors.description = 'Descriptions max out at 1000 characters.'
  }
  if (draft.condition.trim().length < 3) {
    errors.condition = 'Add a short condition note (e.g. "Good — works great").'
  } else if (draft.condition.trim().length > 200) {
    errors.condition = 'Keep the condition note under 200 characters.'
  }
  return errors
}

/** Step 2: terms. Deposit/fee are optional; duration + instructions are not. */
export function validateTermsStep(draft: ListItemDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {}
  if (
    draft.maxDurationDays === '' ||
    !Number.isInteger(Number(draft.maxDurationDays)) ||
    Number(draft.maxDurationDays) < 1 ||
    Number(draft.maxDurationDays) > 60
  ) {
    errors.maxDurationDays = 'Max borrow duration must be a whole number of days (1–60).'
  }
  const depositError = validateOptionalMoney(draft.depositAmount, 'Deposit', 200_000)
  if (depositError) errors.depositAmount = depositError
  const feeError = validateOptionalMoney(draft.dailyFee, 'Daily fee', 50_000)
  if (feeError) errors.dailyFee = feeError
  const instructions = draft.pickupInstructions.trim()
  if (instructions.length < 5) {
    errors.pickupInstructions = 'Tell neighbors where and how to pick it up (5+ characters).'
  } else if (instructions.length > 300) {
    errors.pickupInstructions = 'Keep pickup instructions under 300 characters.'
  }
  return errors
}

function validateStep(
  stepIndex: number,
  draft: ListItemDraft,
): Partial<Record<DraftField, string>> {
  switch (stepIndex) {
    case 0:
      return validateBasicsStep(draft)
    case 1:
      return validateDetailsStep(draft)
    case 2:
      return validateTermsStep(draft)
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type ListItemFormAction =
  | { type: 'field'; field: DraftField; value: ListItemDraft[DraftField] }
  | { type: 'photos_add'; urls: string[] }
  | { type: 'photo_remove'; index: number }
  | { type: 'next' } // validates the current step first
  | { type: 'back' }
  | { type: 'goto'; stepIndex: number } // free navigation to earlier steps
  | { type: 'restored'; draft: ListItemDraft; stepIndex: number }
  | { type: 'reset' }

function clampStep(index: number): number {
  return Math.max(0, Math.min(LIST_ITEM_STEP_COUNT - 1, index))
}

export function listItemFormReducer(
  state: ListItemFormState,
  action: ListItemFormAction,
): ListItemFormState {
  switch (action.type) {
    case 'field': {
      const draft = { ...state.draft, [action.field]: action.value }
      // Re-validate the current step so errors clear as soon as they're fixed.
      const errors = state.showErrors ? validateStep(state.stepIndex, draft) : state.errors
      return { ...state, draft, errors, dirty: true }
    }
    case 'photos_add': {
      if (action.urls.length === 0) return state
      const photos = [...state.draft.photos, ...action.urls].slice(0, MAX_PHOTOS)
      return { ...state, draft: { ...state.draft, photos }, dirty: true }
    }
    case 'photo_remove': {
      const photos = state.draft.photos.filter((_, i) => i !== action.index)
      return { ...state, draft: { ...state.draft, photos }, dirty: true }
    }
    case 'next': {
      const errors = validateStep(state.stepIndex, state.draft)
      if (Object.keys(errors).length > 0) {
        return { ...state, errors, showErrors: true }
      }
      return {
        ...state,
        stepIndex: clampStep(state.stepIndex + 1),
        errors: {},
        showErrors: false,
      }
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

export const DRAFT_STORAGE_KEY = 'neighbormart:list-item-draft:v1'

interface StoredDraft {
  draft: ListItemDraft
  stepIndex: number
  savedAt: number
}

/** Only persist drafts that actually say something. */
export function isDraftWorthSaving(draft: ListItemDraft): boolean {
  return (
    draft.category !== '' ||
    draft.title.trim() !== '' ||
    draft.photos.length > 0 ||
    draft.description.trim() !== '' ||
    draft.condition.trim() !== '' ||
    draft.pickupInstructions.trim() !== ''
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

/** Parse + sanitize a stored draft. Returns null for garbage/missing data. */
export function readDraftFromStorage(): { draft: ListItemDraft; stepIndex: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const candidate = parsed as Partial<StoredDraft>
    const draft = candidate.draft
    if (typeof draft !== 'object' || draft === null) return null

    const d = draft as Partial<ListItemDraft>
    const category =
      typeof d.category === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(d.category)
        ? (d.category as ItemCategory)
        : ''
    const photos = Array.isArray(d.photos)
      ? d.photos.filter((p): p is string => typeof p === 'string').slice(0, MAX_PHOTOS)
      : []

    return {
      draft: {
        category,
        title: typeof d.title === 'string' ? d.title : '',
        photos,
        description: typeof d.description === 'string' ? d.description : '',
        condition: typeof d.condition === 'string' ? d.condition : '',
        maxDurationDays:
          typeof d.maxDurationDays === 'number' && Number.isFinite(d.maxDurationDays)
            ? d.maxDurationDays
            : '',
        depositAmount:
          typeof d.depositAmount === 'number' && Number.isFinite(d.depositAmount)
            ? d.depositAmount
            : '',
        dailyFee: typeof d.dailyFee === 'number' && Number.isFinite(d.dailyFee) ? d.dailyFee : '',
        pickupPreference:
          d.pickupPreference === 'pickup' ||
          d.pickupPreference === 'drop-off' ||
          d.pickupPreference === 'either'
            ? d.pickupPreference
            : 'either',
        pickupInstructions: typeof d.pickupInstructions === 'string' ? d.pickupInstructions : '',
      },
      stepIndex:
        typeof candidate.stepIndex === 'number' && Number.isInteger(candidate.stepIndex)
          ? clampStep(candidate.stepIndex)
          : 0,
    }
  } catch {
    return null
  }
}
