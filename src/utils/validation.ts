import { dateInputToIso, daysBetween, toLocalDateIso } from './dates'

/**
 * Validation for the "Request to borrow" form. Pure functions — the modal
 * calls them for instant field-level feedback, and the request service
 * calls the same ones again so client and mock-server rules can't drift.
 */
export interface BorrowPeriodErrors {
  start?: string
  end?: string
  duration?: string
  note?: string
}

export interface BorrowPeriodValidation {
  valid: boolean
  errors: BorrowPeriodErrors
}

export function validateBorrowPeriod(
  startInput: string,
  endInput: string,
  maxDurationDays: number,
  now: Date = new Date(),
): BorrowPeriodValidation {
  const errors: BorrowPeriodErrors = {}

  const startIso = dateInputToIso(startInput)
  const endIso = dateInputToIso(endInput)
  const todayIso = toLocalDateIso(now)

  if (!startIso) errors.start = 'Pick a start date.'
  if (!endIso) errors.end = 'Pick an end date.'

  if (startIso && startIso < todayIso) {
    errors.start = "Start date can't be in the past."
  }

  if (startIso && endIso) {
    if (endIso <= startIso) {
      errors.end = 'End date must be after the start date.'
    } else {
      const days = borrowDurationDays(startIso, endIso)
      if (days != null && days > maxDurationDays) {
        errors.duration = `That's ${days} days — this item can be borrowed for up to ${maxDurationDays}.`
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/** Note is optional, but keep it short: max 500 characters. */
export function validateNote(note: string): string | undefined {
  if (note.length > 500) return 'Keep your note under 500 characters.'
  return undefined
}

/** Inclusive day count between two calendar stamps ("Sep 6–Sep 8" = 3 days). */
export function borrowDurationDays(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return daysBetween(startIso, endIso) + 1
}

/** Same count, straight from <input type="date"> values. */
export function borrowDurationFromInputs(startInput: string, endInput: string): number | null {
  const startIso = dateInputToIso(startInput)
  const endIso = dateInputToIso(endInput)
  if (!startIso || !endIso) return null
  return borrowDurationDays(startIso, endIso)
}
