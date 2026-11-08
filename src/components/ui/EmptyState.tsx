import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export interface EmptyStateProps {
  emoji?: string
  title: string
  message?: string
  /** Optional action (a button/link node). */
  action?: ReactNode
  className?: string
  tone?: 'default' | 'error'
}

/**
 * Friendly empty/missing-data state. Used for empty filters, 404 items,
 * zero reviews, and anywhere data can be legitimately absent.
 */
export function EmptyState({
  emoji = '🌤️',
  title,
  message,
  action,
  className,
  tone = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-10 text-center',
        tone === 'error'
          ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/60'
          : 'border-bark/15 bg-surface/70',
        className,
      )}
      role="status"
    >
      <span aria-hidden className="text-4xl">
        {emoji}
      </span>
      <div>
        <h3 className="font-display text-lg font-semibold text-bark">{title}</h3>
        {message && <p className="mx-auto mt-1 max-w-sm text-sm text-bark-light">{message}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
