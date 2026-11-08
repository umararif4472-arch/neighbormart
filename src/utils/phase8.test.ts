import { describe, expect, it } from 'vitest'
import { sanitizeMultiline, sanitizeText } from './sanitize'
import { checkWindow, LISTING_RATE_LIMIT, MESSAGE_RATE_LIMIT } from './rateLimit'
import { excludeBlockedOwners } from './blocking'

describe('sanitizeText', () => {
  it('strips control and zero-width characters and collapses spaces', () => {
    expect(sanitizeText('  Power drill​  for   rent ', 120)).toBe('Power drill for rent')
  })

  it('truncates to the max length', () => {
    expect(sanitizeText('x'.repeat(200), 120)).toHaveLength(120)
  })

  it('multiline keeps line breaks but caps blank runs', () => {
    expect(sanitizeMultiline('line1\n\n\n\nline2', 2000)).toBe('line1\n\nline2')
  })
})

describe('checkWindow (rate limiting)', () => {
  const t0 = '2026-11-08T10:00:00.000Z'

  it('starts a fresh window at count 1', () => {
    const d = checkWindow(
      { windowStart: null, count: 0 },
      t0,
      LISTING_RATE_LIMIT.limit,
      LISTING_RATE_LIMIT.windowMs,
    )
    expect(d).toEqual({ allowed: true, windowStart: t0, count: 1 })
  })

  it('blocks the 11th listing inside 24h and allows after the window', () => {
    const atLimit = checkWindow(
      { windowStart: t0, count: 10 },
      '2026-11-08T20:00:00.000Z',
      LISTING_RATE_LIMIT.limit,
      LISTING_RATE_LIMIT.windowMs,
    )
    expect(atLimit.allowed).toBe(false)
    const nextDay = checkWindow(
      { windowStart: t0, count: 10 },
      '2026-11-09T10:00:01.000Z',
      LISTING_RATE_LIMIT.limit,
      LISTING_RATE_LIMIT.windowMs,
    )
    expect(nextDay).toEqual({
      allowed: true,
      windowStart: '2026-11-09T10:00:01.000Z',
      count: 1,
    })
  })

  it('message window is 30 per minute', () => {
    const d = checkWindow(
      { windowStart: t0, count: 30 },
      '2026-11-08T10:00:30.000Z',
      MESSAGE_RATE_LIMIT.limit,
      MESSAGE_RATE_LIMIT.windowMs,
    )
    expect(d.allowed).toBe(false)
  })
})

describe('excludeBlockedOwners', () => {
  const listings = [
    { id: '1', ownerId: 'u-a' },
    { id: '2', ownerId: 'u-b' },
    { id: '3', ownerId: 'u-a' },
  ]

  it('removes blocked owners and keeps everyone else', () => {
    expect(excludeBlockedOwners(listings, ['u-a']).map((l) => l.id)).toEqual(['2'])
  })

  it('is a no-op without a block list', () => {
    expect(excludeBlockedOwners(listings, undefined)).toHaveLength(3)
    expect(excludeBlockedOwners(listings, [])).toHaveLength(3)
  })
})
