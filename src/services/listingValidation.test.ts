import { describe, expect, it } from 'vitest'
import { validatePhotos } from './listingValidation'

/**
 * Phase 4 photo rules in the shared validator. These tests run with
 * VITE_CLOUDINARY_CLOUD_NAME blanked (see vite.config test.env), so the
 * Cloudinary-host branch is covered separately via isCloudinaryUrl's
 * own tests in utils/cloudinary.test.ts.
 */
describe('validatePhotos', () => {
  it('accepts https photo URLs within the section cap', () => {
    expect(validatePhotos(['https://example.com/a.jpg'], 'items')).toEqual({})
    expect(validatePhotos([], 'arenas')).toEqual({})
  })

  it('enforces the per-section caps (10/15/20/10)', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `https://x/${i}.jpg`)
    expect(validatePhotos(many(10), 'items')).toEqual({})
    expect(validatePhotos(many(11), 'items').photos).toMatch(/At most 10/)
    expect(validatePhotos(many(15), 'vehicles')).toEqual({})
    expect(validatePhotos(many(16), 'vehicles').photos).toMatch(/At most 15/)
    expect(validatePhotos(many(20), 'properties')).toEqual({})
    expect(validatePhotos(many(21), 'properties').photos).toMatch(/At most 20/)
    expect(validatePhotos(many(11), 'arenas').photos).toMatch(/At most 10/)
  })

  it('rejects temporary previews and non-https entries', () => {
    expect(validatePhotos(['blob:http://localhost/abc'], 'items').photos).toMatch(
      /finished uploads/,
    )
    expect(validatePhotos(['http://example.com/a.jpg'], 'items').photos).toBeTruthy()
    expect(validatePhotos(['/local/path.jpg'], 'items').photos).toBeTruthy()
  })
})
