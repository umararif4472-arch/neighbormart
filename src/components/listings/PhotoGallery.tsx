import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { fullPhotoUrl } from '@/utils/cloudinary'
import { ListingPhoto } from './ListingPhoto'

export interface PhotoGalleryProps {
  photos: string[]
  alt: string
  /** Fallback-tile emoji when a photo is missing. */
  emoji: string
}

/**
 * Photo gallery (Phase 4): thumbnail strip + main photo using the
 * Cloudinary transforms, and a full-screen lightbox with swipe,
 * arrow-key navigation and click-to-zoom. Graceful with 0, 1, or N
 * photos — zero photos shows the emoji tile.
 */
export function PhotoGallery({ photos, alt, emoji }: PhotoGalleryProps) {
  const [selected, setSelected] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const touchX = useRef<number | null>(null)
  const hasMultiple = photos.length > 1
  const activeIndex = Math.min(selected, Math.max(0, photos.length - 1))

  const go = useCallback(
    (delta: number) => {
      setSelected((current) => {
        const next = Math.min(photos.length - 1, Math.max(0, current + delta))
        return next
      })
      setZoomed(false)
    },
    [photos.length],
  )

  // Keyboard navigation while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(false)
      if (event.key === 'ArrowRight') go(1)
      if (event.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox, go])

  if (photos.length === 0) {
    return (
      <ListingPhoto
        src={undefined}
        alt={alt}
        emoji={emoji}
        className="aspect-[4/3] w-full rounded-3xl border border-bark/10"
        emojiClassName="text-6xl"
      />
    )
  }

  const main = photos[activeIndex]

  const onTouchEnd = (clientX: number) => {
    if (touchX.current === null) return
    const delta = clientX - touchX.current
    touchX.current = null
    if (Math.abs(delta) > 48) go(delta < 0 ? 1 : -1)
  }

  return (
    <figure className="flex flex-col gap-3">
      <div className="relative">
        <ListingPhoto
          src={main}
          alt={`${alt} — photo ${activeIndex + 1} of ${photos.length}`}
          emoji={emoji}
          variant="full"
          onClick={() => setLightbox(true)}
          className="aspect-[4/3] w-full cursor-zoom-in rounded-3xl border border-bark/10"
        />
        <span className="absolute bottom-3 right-3 rounded-full bg-bark/75 px-2.5 py-1 text-xs font-semibold text-cream backdrop-blur-sm">
          {activeIndex + 1} / {photos.length} · tap to expand
        </span>
        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={activeIndex === 0}
              onClick={() => go(-1)}
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-bark shadow disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={activeIndex === photos.length - 1}
              onClick={() => go(1)}
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg font-bold text-bark shadow disabled:opacity-40"
            >
              ›
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div
          role="group"
          aria-label="Photo thumbnails"
          className="no-scrollbar flex gap-2 overflow-x-auto"
        >
          {photos.map((photo, index) => (
            <button
              key={`${photo}-${index}`}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={index === activeIndex}
              aria-label={`Show photo ${index + 1}`}
              className={cn(
                'shrink-0 overflow-hidden rounded-2xl border-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-600',
                index === activeIndex
                  ? 'border-terracotta-600 shadow-sm'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <ListingPhoto
                src={photo}
                alt=""
                emoji={emoji}
                variant="thumb"
                className="h-16 w-20"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && main && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${alt} — full-screen photo viewer`}
          className="fixed inset-0 z-50 flex flex-col bg-bark/95 backdrop-blur-sm"
          onTouchStart={(e) => {
            touchX.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => onTouchEnd(e.changedTouches[0]?.clientX ?? 0)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-cream">
            <span className="text-sm font-semibold">
              {activeIndex + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              aria-label="Close full-screen viewer"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20"
            >
              ✕
            </button>
          </div>
          <div
            className={cn(
              'flex flex-1 items-center justify-center overflow-auto p-4',
              zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
            )}
            onClick={() => setZoomed((z) => !z)}
          >
            <img
              src={fullPhotoUrl(main)}
              alt={`${alt} — photo ${activeIndex + 1} of ${photos.length}`}
              className={cn(
                'max-h-full rounded-2xl object-contain transition-transform duration-300',
                zoomed ? 'scale-150' : 'scale-100',
              )}
              draggable={false}
            />
          </div>
          {hasMultiple && (
            <div className="flex items-center justify-center gap-4 pb-6">
              <button
                type="button"
                aria-label="Previous photo"
                disabled={activeIndex === 0}
                onClick={() => go(-1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-cream hover:bg-white/20 disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                disabled={activeIndex === photos.length - 1}
                onClick={() => go(1)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-cream hover:bg-white/20 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
