import { useState } from 'react'
import { cn } from '@/utils/cn'
import {
  blurPhotoUrl,
  cardPhotoUrl,
  fullPhotoUrl,
  isCloudinaryUrl,
  thumbPhotoUrl,
} from '@/utils/cloudinary'

export interface ListingPhotoProps {
  src: string | undefined
  alt: string
  /** Emoji shown on the fallback tile when there is no usable photo. */
  emoji: string
  className?: string
  /** Size class for the fallback emoji. */
  emojiClassName?: string
  /**
   * Cloudinary delivery size (Phase 4): card = the w_600 grid transform,
   * thumb = small strip transform, full = the w_1600 detail transform,
   * raw = the stored URL as-is. Non-Cloudinary URLs ignore the variant.
   * Cloudinary variants also get a blur-up placeholder while loading.
   */
  variant?: 'card' | 'thumb' | 'full' | 'raw'
  onClick?: () => void
}

const VARIANT_URL = {
  card: cardPhotoUrl,
  thumb: thumbPhotoUrl,
  full: fullPhotoUrl,
  raw: (url: string) => url,
} as const

/**
 * Listing photo with a warm emoji fallback tile when the photo is missing
 * or fails to load (zero-photo listings are a real state — Leo's camp
 * stove ships with none). Images lazy-load; Cloudinary photos fade in
 * over a tiny blurred placeholder (blur-up).
 */
export function ListingPhoto({
  src,
  alt,
  emoji,
  className,
  emojiClassName,
  variant = 'raw',
  onClick,
}: ListingPhotoProps) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (!src || failed) {
    return (
      <div
        aria-label={`${alt} — no photo available`}
        role="img"
        className={cn(
          'flex items-center justify-center bg-gradient-to-br from-terracotta-50 to-moss-100',
          className,
        )}
      >
        <span aria-hidden className={cn('text-4xl', emojiClassName)}>
          {emoji}
        </span>
      </div>
    )
  }

  const displaySrc = VARIANT_URL[variant](src)
  const blurSrc = variant === 'raw' ? undefined : blurPhotoUrl(src)
  const showBlur = blurSrc && blurSrc !== displaySrc && isCloudinaryUrl(src)

  return (
    <span className={cn('relative block overflow-hidden bg-terracotta-50', className)}>
      {showBlur && (
        <img
          src={blurSrc}
          alt=""
          aria-hidden
          className={cn(
            'absolute inset-0 h-full w-full scale-110 object-cover blur-md transition-opacity duration-500',
            loaded ? 'opacity-0' : 'opacity-100',
          )}
        />
      )}
      <img
        src={displaySrc}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        onClick={onClick}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
          showBlur && !loaded ? 'opacity-0' : 'opacity-100',
          onClick && 'cursor-pointer',
        )}
      />
    </span>
  )
}
