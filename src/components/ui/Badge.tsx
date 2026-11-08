import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'terracotta' | 'moss'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-bark/5 text-bark-light border-bark/10',
  success: 'bg-moss-100 text-moss-800 border-moss-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  terracotta: 'bg-terracotta-50 text-terracotta-800 border-terracotta-200',
  moss: 'bg-moss-600 text-white border-moss-700',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  /** Render a leading status dot. */
  dot?: boolean
}

/** Small status/label pill used across cards and rows. */
export function Badge({ tone = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Listing status → badge tone, one source for cards, detail, and map pins. */
export function listingStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'rented':
    case 'reserved':
      return 'warning'
    case 'sold':
      return 'terracotta'
    default:
      return 'neutral'
  }
}
