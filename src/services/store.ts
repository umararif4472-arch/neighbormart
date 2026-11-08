import type { AppNotification, BorrowRequest, Item, Message, Review, User } from '@/types'
import { ApiError } from './errors'
import {
  seedItems,
  seedMessages,
  seedNotifications,
  seedRequests,
  seedReviews,
  seedUsers,
} from '@/data/seed'

/**
 * The in-memory "database". PRIVATE to the /services folder — components
 * must never import this module directly; they go through the service API.
 *
 * Reads deep-clone results (exactly like an HTTP boundary would), so no
 * caller can accidentally mutate shared state. Swapping this file for a
 * real backend later requires no component changes.
 */
interface Database {
  users: User[]
  items: Item[]
  requests: BorrowRequest[]
  reviews: Review[]
  notifications: AppNotification[]
  messages: Message[]
}

function createDatabase(): Database {
  const users = seedUsers()
  return {
    users,
    items: seedItems(users),
    requests: seedRequests(),
    reviews: seedReviews(),
    notifications: seedNotifications(),
    messages: seedMessages(),
  }
}

// Built once per app session. Seed builders use relative dates, so the demo
// flows ("due tomorrow", "sent 6h ago") are alive whenever the app runs.
const db: Database = createDatabase()

let idCounter = 0

/** Unique-ish mock id: "req-lx3k1a2". */
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}`
}

/** Simulated network latency for every service call. */
export function simulateLatency(minMs = 120, maxMs = 350): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Deep-clone values crossing the "network" boundary. */
export function clone<T>(value: T): T {
  return structuredClone(value)
}

// --- Internal lookup helpers (throw typed errors) ------------------------

export function findItem(itemId: string): Item {
  const item = db.items.find((i) => i.id === itemId)
  if (!item)
    throw new ApiError('not-found', 'That item doesn\u2019t exist — it may have been removed.')
  return item
}

export function findRequest(requestId: string): BorrowRequest {
  const request = db.requests.find((r) => r.id === requestId)
  if (!request) throw new ApiError('not-found', 'That borrow request no longer exists.')
  return request
}

export function findUser(userId: string): User {
  const user = db.users.find((u) => u.id === userId)
  if (!user) throw new ApiError('not-found', 'That neighbor no longer has an account.')
  return user
}

/** The raw store — ONLY for use by sibling service modules. */
export function getStore(): Database {
  return db
}
