import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import type { ListingSection } from '@/types'
import { uploadListingPhoto } from '@/services/photos'
import { toErrorMessage } from '@/services'
import {
  PHOTO_LIMITS_BY_SECTION,
  isCloudinaryConfigured,
  validatePhotoFileMeta,
} from '@/utils/cloudinary'
import { cn } from '@/utils/cn'
import { CameraIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from '@/components/icons'

/**
 * Photo uploader (Phase 4) — replaces the old session-preview / pasted
 * link paths. Each picked file becomes an entry with its own state:
 * uploading (real XHR progress) → done (Cloudinary URL) or error
 * (message + Retry). Only DONE entries sync into the form's
 * draft.photos, in display order — so the wizard's publish validation
 * (including the vehicle/property 3-photo minimum) counts real uploads
 * only. Supports multi-pick, camera capture on mobile, drag & drop of
 * files, drag-to-reorder tiles, Make cover, and delete. Removal drops
 * the photo from the listing; the Cloudinary asset itself is cleaned
 * up admin-side (signed destroy can't happen in the browser).
 */

interface UploadEntry {
  id: string
  /** Object-URL preview while uploading; the Cloudinary URL once done. */
  preview: string
  status: 'uploading' | 'done' | 'error'
  progress: number
  url?: string
  file?: File
  error?: string
}

let entrySeq = 0
const nextId = () => `photo-${++entrySeq}`

export interface PhotoUploaderProps {
  section: ListingSection
  /** The form's photos: finished upload URLs only, in display order. */
  photos: string[]
  onPhotosChange: (urls: string[]) => void
  /** Reports how many uploads are still in flight (publish guard). */
  onPendingChange?: (pending: number) => void
}

export function PhotoUploader({
  section,
  photos,
  onPhotosChange,
  onPendingChange,
}: PhotoUploaderProps) {
  const limit = PHOTO_LIMITS_BY_SECTION[section]
  const [entries, setEntries] = useState<UploadEntry[]>(() =>
    photos.map((url) => ({
      id: nextId(),
      preview: url,
      status: 'done' as const,
      progress: 1,
      url,
    })),
  )
  const [rejected, setRejected] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const lastEmitted = useRef<string>(JSON.stringify(photos))
  /** Latest entries for async upload callbacks; synced after each commit. */
  const entriesRef = useRef(entries)
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  const doneUrls = (list: UploadEntry[]) =>
    list.filter((e) => e.status === 'done' && e.url).map((e) => e.url as string)

  /** Push local entry changes up to the form whenever done-order changes. */
  const emit = (list: UploadEntry[]) => {
    const urls = doneUrls(list)
    const key = JSON.stringify(urls)
    if (key !== lastEmitted.current) {
      lastEmitted.current = key
      onPhotosChange(urls)
    }
    onPendingChange?.(list.filter((e) => e.status === 'uploading').length)
  }

  const applyEntries = (next: UploadEntry[]) => {
    setEntries(next)
    emit(next)
  }

  // External changes (draft restore, publish reset, section coercion)
  // reseed the tiles — but never while uploads are in flight.
  useEffect(() => {
    const key = JSON.stringify(photos)
    if (key === lastEmitted.current) return
    if (entriesRef.current.some((e) => e.status === 'uploading')) return
    lastEmitted.current = key
    setEntries(
      photos.map((url) => ({
        id: nextId(),
        preview: url,
        status: 'done' as const,
        progress: 1,
        url,
      })),
    )
  }, [photos])

  const startUpload = (entryId: string, file: File) => {
    void uploadListingPhoto(file, (fraction) => {
      const next = entriesRef.current.map((e) =>
        e.id === entryId ? { ...e, progress: fraction } : e,
      )
      setEntries(next)
      entriesRef.current = next
    })
      .then((url) => {
        const next = entriesRef.current.map((e) =>
          e.id === entryId
            ? {
                ...e,
                status: 'done' as const,
                progress: 1,
                url,
                preview: url,
                file: undefined,
                error: undefined,
              }
            : e,
        )
        applyEntries(next)
      })
      .catch((err: unknown) => {
        const next = entriesRef.current.map((e) =>
          e.id === entryId ? { ...e, status: 'error' as const, error: toErrorMessage(err) } : e,
        )
        applyEntries(next)
      })
  }

  const addFiles = (files: File[]) => {
    const problems: string[] = []
    const room = limit - entriesRef.current.length
    const accepted: File[] = []
    for (const file of files) {
      const problem = validatePhotoFileMeta(file)
      if (problem) {
        problems.push(problem)
      } else if (accepted.length < room) {
        accepted.push(file)
      } else {
        problems.push(`"${file.name}" was skipped — this section allows at most ${limit} photos.`)
      }
    }
    setRejected(problems)
    if (accepted.length === 0) return
    const fresh: UploadEntry[] = accepted.map((file) => ({
      id: nextId(),
      preview: URL.createObjectURL(file),
      status: 'uploading',
      progress: 0,
      file,
    }))
    applyEntries([...entriesRef.current, ...fresh])
    for (const entry of fresh) {
      if (entry.file) startUpload(entry.id, entry.file)
    }
  }

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    if (dragIndex.current !== null) return // tile reorder drop, not files
    addFiles(Array.from(event.dataTransfer.files ?? []))
  }

  const removeEntry = (id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id)
    if (entry && entry.preview.startsWith('blob:')) URL.revokeObjectURL(entry.preview)
    applyEntries(entriesRef.current.filter((e) => e.id !== id))
  }

  const moveEntry = (index: number, delta: number) => {
    const target = index + delta
    const list = [...entriesRef.current]
    if (target < 0 || target >= list.length) return
    const [item] = list.splice(index, 1)
    if (!item) return
    list.splice(target, 0, item)
    applyEntries(list)
  }

  const coverEntry = (index: number) => {
    if (index <= 0) return
    const list = [...entriesRef.current]
    const [item] = list.splice(index, 1)
    if (!item) return
    list.unshift(item)
    applyEntries(list)
  }

  const dropOnTile = (targetIndex: number) => {
    const from = dragIndex.current
    dragIndex.current = null
    if (from === null || from === targetIndex) return
    const list = [...entriesRef.current]
    const [item] = list.splice(from, 1)
    if (!item) return
    list.splice(targetIndex, 0, item)
    applyEntries(list)
  }

  const doneCount = entries.filter((e) => e.status === 'done').length
  const pendingCount = entries.filter((e) => e.status === 'uploading').length
  /** The cover is the first FINISHED photo — an in-flight tile ahead of it doesn't count. */
  const coverId = entries.find((e) => e.status === 'done')?.id

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-3xl border-2 border-dashed p-3 transition-colors',
          dragOver
            ? 'border-terracotta-500 bg-terracotta-50 dark:bg-terracotta-900/50'
            : 'border-transparent',
        )}
      >
        <div className="flex flex-wrap gap-3">
          {entries.map((entry, index) => (
            <div
              key={entry.id}
              draggable={entry.status === 'done'}
              onDragStart={() => {
                dragIndex.current = index
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dropOnTile(index)
              }}
              className="relative w-24"
            >
              <img
                src={entry.preview}
                alt={`Listing photo ${index + 1}`}
                className={cn(
                  'h-24 w-24 rounded-2xl border border-bark/10 object-cover',
                  entry.status === 'error' && 'opacity-50',
                )}
              />
              {entry.status === 'uploading' && (
                <div className="absolute inset-x-1 bottom-1 rounded-full bg-bark/70 px-1.5 py-1">
                  <div
                    className="h-1.5 rounded-full bg-terracotta-400 transition-all"
                    style={{ width: `${Math.round(entry.progress * 100)}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(entry.progress * 100)}
                    aria-label={`Uploading photo ${index + 1}`}
                  />
                  <p className="mt-0.5 text-center text-[10px] font-bold text-cream">
                    {Math.round(entry.progress * 100)}%
                  </p>
                </div>
              )}
              {entry.status === 'error' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!entry.file) return
                    const next = entriesRef.current.map((e) =>
                      e.id === entry.id
                        ? { ...e, status: 'uploading' as const, progress: 0, error: undefined }
                        : e,
                    )
                    applyEntries(next)
                    startUpload(entry.id, entry.file)
                  }}
                  className="absolute inset-x-1 bottom-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white shadow"
                >
                  Failed — tap to retry
                </button>
              )}
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bark text-cream shadow-md transition-transform hover:scale-110"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
              {entry.status === 'done' &&
                (entry.id === coverId ? (
                  <span className="absolute bottom-1 left-1 rounded-full bg-bark/80 px-2 py-0.5 text-[10px] font-bold text-cream">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverEntry(index)}
                    className="absolute bottom-1 left-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-bark shadow"
                  >
                    Make cover
                  </button>
                ))}
              {entries.length > 1 && entry.status === 'done' && (
                <span className="absolute bottom-1 right-1 flex gap-0.5">
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => moveEntry(index, -1)}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-bark shadow disabled:opacity-40"
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === entries.length - 1}
                    onClick={() => moveEntry(index, 1)}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-bark shadow disabled:opacity-40"
                  >
                    <ChevronRightIcon className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          ))}

          {entries.length < limit && (
            <>
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bark/20 bg-cream/50 text-bark-light transition-colors hover:border-terracotta-400 hover:text-terracotta-600 dark:hover:text-terracotta-400">
                <CameraIcon className="h-6 w-6" aria-hidden />
                <span className="text-[11px] font-semibold">Add photos</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={handlePick}
                />
              </label>
              <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-bark/20 bg-cream/50 text-bark-light transition-colors hover:border-terracotta-400 hover:text-terracotta-600 dark:hover:text-terracotta-400 sm:hidden">
                <span aria-hidden className="text-xl">
                  📸
                </span>
                <span className="text-[11px] font-semibold">Take photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="sr-only"
                  onChange={handlePick}
                />
              </label>
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-bark-light">
          Drag & drop photos here, or use the tiles. JPG, PNG or WebP, up to 5 MB each — big photos
          are resized automatically. {doneCount} uploaded
          {pendingCount > 0 ? ` · ${pendingCount} uploading…` : ''} · up to {limit} for this
          section.
        </p>
      </div>

      {!isCloudinaryConfigured && (
        <p className="rounded-2xl bg-amber-50 dark:bg-amber-950/60 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          Heads up: this build has no Cloudinary cloud configured, so uploads will fail until
          VITE_CLOUDINARY_CLOUD_NAME is set in .env.local.
        </p>
      )}

      {entries
        .filter((e) => e.status === 'error')
        .map((e) => (
          <p key={e.id} role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
            {e.error ?? 'A photo failed to upload.'}
          </p>
        ))}
      {rejected.map((problem) => (
        <p
          key={problem}
          role="alert"
          className="text-sm font-medium text-red-700 dark:text-red-300"
        >
          {problem}
        </p>
      ))}
    </div>
  )
}
