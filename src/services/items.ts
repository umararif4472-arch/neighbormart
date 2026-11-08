import type { Item, ItemFilters, LatLng, User } from '@/types'
import { ITEM_CATEGORIES } from '@/types'
import { filterItems } from '@/utils/filters'
import { ApiError } from './errors'
import { clone, findUser, getStore, nextId, simulateLatency } from './store'

/**
 * Item service. All writes validate here (the mock "server" is the source
 * of truth), so client-side validation can drift without data corruption.
 */

export interface CreateItemInput {
  ownerId: string
  title: string
  description: string
  category: Item['category']
  condition: string
  photos: string[]
  maxDurationDays: number
  depositAmount: number | null
  dailyFee: number | null
  pickupPreference: Item['borrowTerms']['pickupPreference']
  pickupInstructions: string
}

export function validateCreateItemInput(input: CreateItemInput): Record<string, string> {
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
  if (input.depositAmount != null && (input.depositAmount < 0 || input.depositAmount > 500)) {
    errors.depositAmount = 'Deposit must be between $0 and $500.'
  }
  if (input.dailyFee != null && (input.dailyFee < 0 || input.dailyFee > 100)) {
    errors.dailyFee = 'Daily fee must be between $0 and $100.'
  }
  if (input.pickupInstructions.trim().length < 5) {
    errors.pickupInstructions = 'Tell neighbors where/how to pick up (5+ characters).'
  }
  return errors
}

/** Optional server-side filtering — mirrors the pure client util exactly. */
export async function getItems(
  filters?: Partial<ItemFilters>,
  origin?: LatLng | null,
): Promise<Item[]> {
  await simulateLatency()
  const items = getStore().items
  if (!filters) return clone(items)
  const applied: ItemFilters = {
    query: filters.query ?? '',
    categories: filters.categories ?? [],
    maxDistanceKm: filters.maxDistanceKm ?? null,
    availability: filters.availability ?? 'all',
  }
  return clone(filterItems(items, applied, origin ?? null))
}

export async function getItemById(itemId: string): Promise<Item | null> {
  await simulateLatency()
  const item = getStore().items.find((i) => i.id === itemId)
  return item ? clone(item) : null
}

/**
 * Publish a new listing. The item is stored in the shared mock DB — every
 * part of the app reading through services/context sees it immediately.
 */
export async function createItem(input: CreateItemInput): Promise<Item> {
  await simulateLatency(300, 600)

  const errors = validateCreateItemInput(input)
  if (Object.keys(errors).length > 0) {
    // Surface the first field error as the ApiError message.
    throw new ApiError('invalid', Object.values(errors)[0])
  }

  const owner: User = findUser(input.ownerId)
  // New listings live near the owner (mock geolocation).
  const location = { ...owner.homeLocation }

  const item: Item = {
    id: nextId('item'),
    ownerId: input.ownerId,
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    condition: input.condition.trim(),
    photos: input.photos.filter((url) => url.trim().length > 0),
    location,
    availability: 'available',
    borrowTerms: {
      maxDurationDays: input.maxDurationDays,
      depositAmount: input.depositAmount,
      dailyFee: input.dailyFee,
      pickupPreference: input.pickupPreference,
      pickupInstructions: input.pickupInstructions.trim(),
    },
    createdAt: new Date().toISOString(),
  }

  getStore().items.push(item)
  return clone(item)
}
