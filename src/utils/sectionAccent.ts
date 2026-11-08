import type { ListingSection } from '@/types/listing'

/**
 * Per-section accent styling (Phase 7). One warm palette, a hue per
 * section; the accent tokens are CSS variables that lighten in dark
 * mode, so these classes stay AA-readable in both themes. Soft chips =
 * accent at 12% + accent text; solid = accent background + white text.
 */
export interface SectionAccent {
  /** Accent text on the page canvas. */
  text: string
  /** Soft tinted chip: tint background + accent text. */
  chip: string
  /** Solid accent background (tiles, active states). */
  solid: string
  /** Accent ring for focus/selected states. */
  ring: string
}

const ACCENTS: Record<ListingSection, SectionAccent> = {
  items: {
    text: 'text-accent-items',
    chip: 'bg-accent-items/12 text-accent-items',
    solid: 'bg-accent-items text-white',
    ring: 'ring-accent-items',
  },
  vehicles: {
    text: 'text-accent-vehicles',
    chip: 'bg-accent-vehicles/12 text-accent-vehicles',
    solid: 'bg-accent-vehicles text-white',
    ring: 'ring-accent-vehicles',
  },
  properties: {
    text: 'text-accent-properties',
    chip: 'bg-accent-properties/12 text-accent-properties',
    solid: 'bg-accent-properties text-white',
    ring: 'ring-accent-properties',
  },
  arenas: {
    text: 'text-accent-arenas',
    chip: 'bg-accent-arenas/12 text-accent-arenas',
    solid: 'bg-accent-arenas text-white',
    ring: 'ring-accent-arenas',
  },
}

export function sectionAccent(section: ListingSection): SectionAccent {
  return ACCENTS[section]
}
