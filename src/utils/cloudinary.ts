import type { ListingSection } from '@/types'

/**
 * Cloudinary (Phase 4) — pure helpers shared by the upload service, the
 * wizard, the shared listing validator and the photo components.
 *
 * Photo storage lives on Cloudinary's free tier with UNSIGNED uploads
 * through the restricted `neighbormart_listings` preset (images only,
 * folder neighbormart/listings, 2000px width cap applied server-side).
 * The cloud name + preset name are public by design (they ship in the
 * browser bundle); the API key/secret are never used by the frontend.
 * The preset cannot enforce a max file size, so the 5 MB limit is
 * enforced HERE, client-side, before any upload starts.
 */

export const CLOUDINARY_CLOUD_NAME =
  (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined) ?? ''
export const CLOUDINARY_UPLOAD_PRESET =
  (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined) ?? 'neighbormart_listings'

export const isCloudinaryConfigured = Boolean(CLOUDINARY_CLOUD_NAME)

/** 5 MB — enforced client-side (the unsigned preset has no size field). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

/** Per-section photo caps (Phase 4 spec). */
export const PHOTO_LIMITS_BY_SECTION: Record<ListingSection, number> = {
  items: 10,
  vehicles: 15,
  properties: 20,
  arenas: 10,
}

/** Validate a file's type + size before upload. Returns an error or null. */
export function validatePhotoFileMeta(meta: {
  name: string
  type: string
  size: number
}): string | null {
  const lowerName = meta.name.toLowerCase()
  const typeOk =
    (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(meta.type) ||
    (meta.type === '' && ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext)))
  if (!typeOk) {
    return `"${meta.name}" isn't a JPG, PNG or WebP image — other files can't be uploaded.`
  }
  if (meta.size <= 0) {
    return `"${meta.name}" looks empty — pick a different photo.`
  }
  if (meta.size > MAX_PHOTO_BYTES) {
    const mb = (meta.size / (1024 * 1024)).toFixed(1)
    return `"${meta.name}" is ${mb} MB — photos must be 5 MB or smaller. Try a smaller version.`
  }
  return null
}

/** Is this URL a Cloudinary delivery URL for the given cloud (ours by default)? */
export function isCloudinaryUrl(url: string, cloudName: string = CLOUDINARY_CLOUD_NAME): boolean {
  if (!cloudName) return false
  return url.startsWith(`https://res.cloudinary.com/${cloudName}/`)
}

/**
 * Insert a transform into a Cloudinary delivery URL
 * (…/image/upload/<transform>/v<version>/<publicId>). Non-Cloudinary
 * URLs (seed photos etc.) and already-transformed URLs pass through
 * unchanged.
 */
export function withCloudinaryTransform(url: string, transform: string): string {
  const marker = '/image/upload/'
  const at = url.indexOf(marker)
  if (at === -1 || !url.includes('res.cloudinary.com')) return url
  const rest = url.slice(at + marker.length)
  const firstSegment = rest.split('/')[0] ?? ''
  // Versioned original (v123/…) → insert. Anything else means a transform
  // is already present — don't stack another one.
  if (!/^v\d+$/.test(firstSegment)) return url
  return `${url.slice(0, at + marker.length)}${transform}/${rest}`
}

export const CARD_TRANSFORM = 'w_600,h_450,c_fill,q_auto,f_auto'
export const THUMB_TRANSFORM = 'w_240,h_180,c_fill,q_auto,f_auto'
export const FULL_TRANSFORM = 'w_1600,q_auto,f_auto'
export const BLUR_TRANSFORM = 'w_48,h_36,c_fill,e_blur:300,q_auto,f_auto'

export const cardPhotoUrl = (url: string): string => withCloudinaryTransform(url, CARD_TRANSFORM)
export const thumbPhotoUrl = (url: string): string => withCloudinaryTransform(url, THUMB_TRANSFORM)
export const fullPhotoUrl = (url: string): string => withCloudinaryTransform(url, FULL_TRANSFORM)
export const blurPhotoUrl = (url: string): string => withCloudinaryTransform(url, BLUR_TRANSFORM)
