import { useState } from 'react'
import { cn } from '@/utils/cn'

export interface AvatarProps {
  name: string
  src: string | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
} as const

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Avatar with graceful fallback: missing URL or failed load falls back to
 * warm initials — never a broken image.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-moss-200 dark:bg-moss-800 font-bold text-moss-800 dark:text-moss-200 ring-1 ring-bark/10',
          SIZES[size],
          className,
        )}
      >
        {initialsOf(name) || ' Neighbor'}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={`${name}'s avatar`}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 rounded-full object-cover ring-1 ring-bark/10',
        SIZES[size],
        className,
      )}
    />
  )
}
