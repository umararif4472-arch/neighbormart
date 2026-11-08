import { describe, expect, it } from 'vitest'
import {
  MAX_PHOTO_BYTES,
  PHOTO_LIMITS_BY_SECTION,
  blurPhotoUrl,
  cardPhotoUrl,
  fullPhotoUrl,
  isCloudinaryUrl,
  thumbPhotoUrl,
  validatePhotoFileMeta,
  withCloudinaryTransform,
} from './cloudinary'

const CLOUD_URL =
  'https://res.cloudinary.com/sgwcguwo/image/upload/v1794127997/anuaiytq8mqnrkkne8na.png'
const SEED_URL = 'https://picsum.photos/seed/drill/800/600'

describe('validatePhotoFileMeta', () => {
  it('accepts jpg/png/webp at or under 5 MB', () => {
    expect(validatePhotoFileMeta({ name: 'a.jpg', type: 'image/jpeg', size: 1024 })).toBeNull()
    expect(
      validatePhotoFileMeta({ name: 'a.png', type: 'image/png', size: MAX_PHOTO_BYTES }),
    ).toBeNull()
    expect(validatePhotoFileMeta({ name: 'a.webp', type: 'image/webp', size: 2048 })).toBeNull()
  })

  it('rejects non-images with a clear message', () => {
    expect(validatePhotoFileMeta({ name: 'clip.mp4', type: 'video/mp4', size: 1024 })).toMatch(
      /isn't a JPG/,
    )
    expect(
      validatePhotoFileMeta({ name: 'doc.pdf', type: 'application/pdf', size: 1024 }),
    ).toBeTruthy()
    expect(validatePhotoFileMeta({ name: 'anim.gif', type: 'image/gif', size: 1024 })).toBeTruthy()
  })

  it('rejects files over 5 MB and names the actual size', () => {
    const err = validatePhotoFileMeta({
      name: 'big.jpg',
      type: 'image/jpeg',
      size: 7.5 * 1024 * 1024,
    })
    expect(err).toMatch(/7\.5 MB/)
    expect(err).toMatch(/5 MB or smaller/)
  })

  it('falls back to the extension when the browser gives no MIME type', () => {
    expect(validatePhotoFileMeta({ name: 'photo.JPG', type: '', size: 100 })).toBeNull()
    expect(validatePhotoFileMeta({ name: 'photo.tiff', type: '', size: 100 })).toBeTruthy()
  })
})

describe('PHOTO_LIMITS_BY_SECTION', () => {
  it('matches the Phase 4 caps', () => {
    expect(PHOTO_LIMITS_BY_SECTION).toEqual({ items: 10, vehicles: 15, properties: 20, arenas: 10 })
  })
})

describe('isCloudinaryUrl', () => {
  it('matches only our cloud', () => {
    expect(isCloudinaryUrl(CLOUD_URL, 'sgwcguwo')).toBe(true)
    expect(isCloudinaryUrl(CLOUD_URL, 'someone-else')).toBe(false)
    expect(isCloudinaryUrl(SEED_URL, 'sgwcguwo')).toBe(false)
  })
})

describe('withCloudinaryTransform', () => {
  it('inserts the transform before the version segment', () => {
    expect(cardPhotoUrl(CLOUD_URL)).toBe(
      'https://res.cloudinary.com/sgwcguwo/image/upload/w_600,h_450,c_fill,q_auto,f_auto/v1794127997/anuaiytq8mqnrkkne8na.png',
    )
    expect(thumbPhotoUrl(CLOUD_URL)).toContain('/upload/w_240,h_180,c_fill,q_auto,f_auto/v1794')
    expect(fullPhotoUrl(CLOUD_URL)).toContain('/upload/w_1600,q_auto,f_auto/v1794')
    expect(blurPhotoUrl(CLOUD_URL)).toContain('e_blur:300')
  })

  it('leaves non-Cloudinary URLs untouched', () => {
    expect(cardPhotoUrl(SEED_URL)).toBe(SEED_URL)
    expect(fullPhotoUrl(SEED_URL)).toBe(SEED_URL)
  })

  it('does not stack a second transform', () => {
    const once = cardPhotoUrl(CLOUD_URL)
    expect(withCloudinaryTransform(once, 'w_100')).toBe(once)
  })
})
