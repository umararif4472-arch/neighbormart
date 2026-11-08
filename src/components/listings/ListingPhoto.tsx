import { useState } from 'react'
import { cn } from '@/utils/cn'

export interface ListingPhotoProps {
  src: string | undefined
  alt: string
  /** Emoji shown on the fallback tile when there is no usable photo. */
  emoji: string
  className?: string
  /** Size class for the fallback emoji. */
  emojiClassName?: string
}

/**
 * Listing photo with a warm emoji fallback tile when the photo is missing
 * or fails to load (zero-photo listings are a real state — Leo's camp
 * stove ships with none).
 */
export function ListingPhoto({ src, alt, emoji, className, emojiClassName }: ListingPhotoProps) {
  const [failed, setFailed] = useState(false)

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

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('bg-terracotta-50 object-cover', className)}
    />
  )
}
