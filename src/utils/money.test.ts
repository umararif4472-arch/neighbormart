import { describe, expect, it } from 'vitest'
import { formatMoney, formatPrice } from './money'

describe('formatMoney', () => {
  it('groups PKR amounts with the Rs label', () => {
    expect(formatMoney(8000, 'PKR')).toBe('Rs 8,000')
    expect(formatMoney(6850000, 'PKR')).toBe('Rs 6,850,000')
    expect(formatMoney(0, 'PKR')).toBe('Rs 0')
  })

  it('shows the code for other currencies', () => {
    expect(formatMoney(1500, 'USD')).toBe('USD 1,500')
  })
})

describe('formatPrice', () => {
  it('renders borrow listings as Free regardless of price fields', () => {
    expect(
      formatPrice({ listingType: 'borrow', price: 0, currency: 'PKR', priceUnit: 'fixed' }),
    ).toBe('Free')
  })

  it('appends the rent unit suffix', () => {
    expect(
      formatPrice({ listingType: 'rent', price: 8000, currency: 'PKR', priceUnit: 'day' }),
    ).toBe('Rs 8,000/day')
    expect(
      formatPrice({ listingType: 'rent', price: 4000, currency: 'PKR', priceUnit: 'hour' }),
    ).toBe('Rs 4,000/hour')
    expect(
      formatPrice({ listingType: 'rent', price: 250000, currency: 'PKR', priceUnit: 'month' }),
    ).toBe('Rs 250,000/month')
  })

  it('renders sell listings as a bare fixed price', () => {
    expect(
      formatPrice({ listingType: 'sell', price: 1150000, currency: 'PKR', priceUnit: 'fixed' }),
    ).toBe('Rs 1,150,000')
  })
})
