import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore/lite'

/**
 * Firestore <-> model mapping helpers for the live service layer.
 *
 * The app's models are plain JSON (ISO date strings, nested detail
 * objects), so a Firestore document body IS the model minus its `id`
 * (which becomes the document id). The one mismatch: Firestore rejects
 * `undefined` values, while the models use optional fields (e.g. a
 * notification without a listingId) — `stripUndefined` bridges that on
 * every write.
 */

export const COLLECTIONS = {
  users: 'users',
  listings: 'listings',
  requests: 'requests',
  reviews: 'reviews',
  messages: 'messages',
  notifications: 'notifications',
  reports: 'reports',
} as const

/** Recursively drop `undefined` values from plain objects/arrays. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) out[key] = stripUndefined(entry)
    }
    return out as T
  }
  return value
}

/** Document snapshot → model (id merged in). Null when the doc is missing. */
export function fromDoc<T>(snap: DocumentSnapshot): T | null {
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) } as T
}

/** Query snapshots → models, in result order. */
export function fromDocs<T>(snaps: QueryDocumentSnapshot[]): T[] {
  return snaps.map((snap) => ({ id: snap.id, ...(snap.data() as Record<string, unknown>) }) as T)
}
