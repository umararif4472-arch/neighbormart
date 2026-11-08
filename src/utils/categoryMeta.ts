import { ITEM_CATEGORIES } from '@/types'
import type { ItemCategory, Listing, ListingSection } from '@/types'

/**
 * Friendly emoji + one-line blurb per category. One source of truth for
 * cards, map pins, filter chips, and the list-item form.
 */
export const CATEGORY_META: Record<ItemCategory, { emoji: string; blurb: string }> = {
  Tools: { emoji: '🔧', blurb: 'Drills, saws, washers — the loud-but-useful kind' },
  'Outdoor & Camping': { emoji: '⛺', blurb: 'Tents, kayaks, stoves for the fresh-air weekends' },
  'Party & Events': { emoji: '🎉', blurb: 'Karaoke, lights, and other block-party weapons' },
  Kitchen: { emoji: '🍳', blurb: 'Mixers, canners, pasta rollers for ambitious cooking' },
  Electronics: { emoji: '🔌', blurb: 'Projectors, drones, and other once-a-year tech' },
  Sports: { emoji: '🎾', blurb: 'Rackets, boards, and gear that deserves more outings' },
  'Kids & Baby': { emoji: '🧸', blurb: 'Strollers and kid haulers, gently outgrown' },
  Other: { emoji: '📦', blurb: 'The wonderful miscellany of neighbor garages' },
}

/** Emoji for a category (safe for unknown values — returns 📦). */
export function categoryEmoji(category: string): string {
  const meta = CATEGORY_META[category as ItemCategory]
  return meta ? meta.emoji : '📦'
}

/** Ordered dropdown/chip options. */
export const CATEGORY_OPTIONS = ITEM_CATEGORIES.map((category) => ({
  value: category,
  label: `${CATEGORY_META[category].emoji} ${category}`,
}))

/** Emoji + blurb per marketplace section (home tiles, fallbacks, filters). */
export const SECTION_META: Record<ListingSection, { emoji: string; label: string; blurb: string }> =
  {
    items: { emoji: '🧰', label: 'Items & Tools', blurb: 'Borrow, rent, or buy tools and gear' },
    vehicles: { emoji: '🚗', label: 'Vehicles', blurb: 'Cars, bikes, and vans — rent or buy' },
    properties: { emoji: '🏠', label: 'Properties', blurb: 'Homes, rooms, plots, and shops' },
    arenas: {
      emoji: '🏟️',
      label: 'Sports Arenas & Venues',
      blurb: 'Courts, turfs, grounds, and halls',
    },
  }

/** The fallback-tile emoji for any listing (category-aware for items). */
export function listingEmoji(listing: Listing): string {
  return listing.section === 'items'
    ? categoryEmoji(listing.details.category)
    : SECTION_META[listing.section].emoji
}
