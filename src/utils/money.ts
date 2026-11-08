import type { Listing, PriceUnit } from '@/types'

/**
 * Price formatting in one place, so cards, detail pages, and the map all
 * render money identically. Amounts are whole major units (rupees) —
 * Intl grouping gives "Rs 8,000" style output for PKR.
 */

const PRICE_UNIT_SUFFIX: Record<PriceUnit, string> = {
  hour: '/hour',
  day: '/day',
  week: '/week',
  month: '/month',
  fixed: '',
}

/** Grouped amount with its currency label, e.g. "Rs 6,850,000". */
export function formatMoney(amount: number, currency: string): string {
  const grouped = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 }).format(amount)
  // PKR reads naturally as "Rs"; other currencies show their code.
  return currency === 'PKR' ? `Rs ${grouped}` : `${currency} ${grouped}`
}

/**
 * The price line for a listing:
 *   borrow            → "Free"
 *   rent, per day     → "Rs 8,000/day"
 *   sell              → "Rs 6,850,000"
 */
export function formatPrice(
  listing: Pick<Listing, 'listingType' | 'price' | 'currency' | 'priceUnit'>,
): string {
  if (listing.listingType === 'borrow' || listing.price === 0) return 'Free'
  return formatMoney(listing.price, listing.currency) + PRICE_UNIT_SUFFIX[listing.priceUnit]
}
