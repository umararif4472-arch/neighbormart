import { cn } from '@/utils/cn'
import { StarIcon } from '@/components/icons'

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-[18px] w-[18px]',
  lg: 'h-6 w-6',
} as const

export interface StarRatingProps {
  /** 1–5, supports halves (e.g. 4.5). */
  value: number
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Read-only star rating. Partial fill via an overlay row clipped to the
 * percentage — no pixel math drift, works at any size.
 */
export function StarRating({ value, size = 'sm', className }: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, value))
  const pct = (clamped / 5) * 100

  const row = (filled: boolean) => (
    <span aria-hidden className="flex shrink-0 gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon
          key={i}
          filled={filled}
          className={cn(SIZES[size], filled ? 'text-amber-400' : 'text-bark/20')}
        />
      ))}
    </span>
  )

  return (
    <span
      role="img"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      className={cn('relative inline-flex', className)}
    >
      {row(false)}
      <span aria-hidden className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row(true)}
      </span>
    </span>
  )
}
