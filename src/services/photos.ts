import { ApiError } from './errors'
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  isCloudinaryConfigured,
  validatePhotoFileMeta,
} from '@/utils/cloudinary'

/**
 * Photo upload service (Phase 4) — Cloudinary unsigned uploads.
 *
 * Pipeline per photo: validate (JPG/PNG/WebP, ≤5 MB — the preset cannot
 * enforce size, so the client must) → compress on a canvas to ~1600px
 * (WebP where the browser supports it, else JPEG) → XHR POST to
 * Cloudinary with real progress events → the returned secure_url is the
 * ONLY thing that ever lands in a listing's photos array. Deleting a
 * photo removes it from the listing; destroying the asset itself needs
 * a signed call and stays an admin-side cleanup (documented in
 * docs/cloudinary-setup.md).
 */

export { isCloudinaryConfigured }

const MAX_DIMENSION = 1600

/** Load a file into an image element for canvas drawing. */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new ApiError('invalid', 'That file could not be read as an image.'))
    }
    img.src = url
  })
}

/**
 * Compress/resize to ~1600px on the longest side. Small, already-web
 * images pass through untouched; the output is WebP when the canvas
 * can produce it, JPEG otherwise.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const img = await loadImage(file)
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  if (longest <= MAX_DIMENSION && file.size <= 1_500_000 && file.type !== 'image/png') {
    return file
  }
  const scale = Math.min(1, MAX_DIMENSION / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const webp = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  )
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  return jpeg ?? file
}

/**
 * Upload one photo to Cloudinary. `onProgress` receives 0–1 as the
 * compressed bytes go up. Resolves with the secure delivery URL.
 */
export async function uploadListingPhoto(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const metaError = validatePhotoFileMeta(file)
  if (metaError) throw new ApiError('invalid', metaError)
  if (!isCloudinaryConfigured) {
    throw new ApiError(
      'unknown',
      'Photo uploads are not configured in this build — add VITE_CLOUDINARY_CLOUD_NAME to .env.local.',
    )
  }
  const blob = await compressPhoto(file)
  const form = new FormData()
  form.append(
    'file',
    blob,
    file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.jpg'),
  )
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as {
          secure_url?: string
          error?: { message?: string }
        }
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve(data.secure_url)
        } else {
          reject(
            new ApiError(
              'unknown',
              data.error?.message
                ? `Upload failed: ${data.error.message}`
                : 'Upload failed — please retry.',
            ),
          )
        }
      } catch {
        reject(new ApiError('unknown', 'Upload failed — please retry.'))
      }
    }
    xhr.onerror = () =>
      reject(new ApiError('unknown', 'Upload failed — check your connection and retry.'))
    xhr.onabort = () => reject(new ApiError('unknown', 'Upload was cancelled.'))
    xhr.send(form)
  })
}
