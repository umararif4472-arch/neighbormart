import type { ItemListing } from '@/types'
import { ITEM_CATEGORIES } from '@/types'

/**
 * Shared create-listing validation for the items section — used by BOTH
 * service backends (mock store and Firestore) so the rules can never
 * drift between dev and production data.
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
