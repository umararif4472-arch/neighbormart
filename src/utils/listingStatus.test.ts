import { describe, expect, it } from 'vitest'
import { canTransitionListingStatus, isListingVisible } from './listingStatus'

describe('canTransitionListingStatus', () => {
  it('allows the happy paths out of active', () => {
    expect(canTransitionListingStatus('active', 'reserved')).toBe(true)
    expect(canTransitionListingStatus('active', 'rented')).toBe(true)
    expect(canTransitionListingStatus('active', 'sold')).toBe(true)
    expect(canTransitionListingStatus('active', 'paused')).toBe(true)
  })

  it('a rented listing can only come back or be removed', () => {
    expect(canTransitionListingStatus('rented', 'active')).toBe(true)
    expect(canTransitionListingStatus('rented', 'sold')).toBe(false)
    expect(canTransitionListingStatus('rented', 'paused')).toBe(false)
  })

  it('sold and removed are (near-)terminal', () => {
    expect(canTransitionListingStatus('sold', 'active')).toBe(false)
    expect(canTransitionListingStatus('sold', 'removed')).toBe(true)
    expect(canTransitionListingStatus('removed', 'active')).toBe(false)
  })

  it('a paused listing can be reactivated', () => {
    expect(canTransitionListingStatus('paused', 'active')).toBe(true)
  })

  it('no-op transitions are not transitions', () => {
    expect(canTransitionListingStatus('active', 'active')).toBe(false)
  })
})

describe('isListingVisible', () => {
  it('hides paused and removed listings from browse', () => {
    expect(isListingVisible('active')).toBe(true)
    expect(isListingVisible('reserved')).toBe(true)
    expect(isListingVisible('paused')).toBe(false)
    expect(isListingVisible('removed')).toBe(false)
  })
})
