import { describe, expect, it } from 'vitest'
import { stripUndefined } from './firestoreData'

describe('stripUndefined', () => {
  it('removes undefined fields but keeps nulls and falsy values', () => {
    const input = {
      id: 'n1',
      listingId: undefined,
      requestId: 'r1',
      note: null,
      read: false,
      views: 0,
      body: '',
    }
    expect(stripUndefined(input)).toEqual({
      id: 'n1',
      requestId: 'r1',
      note: null,
      read: false,
      views: 0,
      body: '',
    })
  })

  it('recurses into nested objects and arrays', () => {
    const input = {
      details: { category: 'Tools', depositAmount: undefined, maxDurationDays: 7 },
      photos: ['a.jpg', undefined, 'b.jpg'],
      location: { lat: 31.5, lng: 74.3, area: undefined },
    }
    const out = stripUndefined(input) as typeof input
    expect(out.details).toEqual({ category: 'Tools', maxDurationDays: 7 })
    expect(out.location).toEqual({ lat: 31.5, lng: 74.3 })
    // Arrays keep their length; object entries inside them are stripped too.
    expect(out.photos).toHaveLength(3)
  })

  it('passes primitives through untouched', () => {
    expect(stripUndefined(42)).toBe(42)
    expect(stripUndefined('x')).toBe('x')
    expect(stripUndefined(null)).toBe(null)
    expect(stripUndefined(true)).toBe(true)
  })
})
