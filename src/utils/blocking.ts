/**
 * Blocking filter (Phase 8): listings owned by someone the viewer has
 * blocked never render in browse, section pages, or the landing feed.
 */
export function excludeBlockedOwners<T extends { ownerId: string }>(
  listings: readonly T[],
  blockedUserIds: readonly string[] | undefined,
): T[] {
  if (!blockedUserIds || blockedUserIds.length === 0) return [...listings]
  const blocked = new Set(blockedUserIds)
  return listings.filter((l) => !blocked.has(l.ownerId))
}
