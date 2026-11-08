/** Pure collection helpers shared by the reducer and pages. */

/** Find an entity by id (returns undefined when missing — callers handle it). */
export function findById<T extends { id: string }>(
  list: readonly T[],
  id: string | undefined | null,
): T | undefined {
  if (!id) return undefined
  return list.find((entry) => entry.id === id)
}

/**
 * Merge `incoming` into `list` by id — later entries win, new ids append.
 * Returns a NEW array (safe for reducer state), preserving list order for
 * existing items.
 */
export function upsertById<T extends { id: string }>(
  list: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return [...list]
  const map = new Map(list.map((entry) => [entry.id, entry]))
  for (const entry of incoming) map.set(entry.id, entry)
  return [...map.values()]
}
