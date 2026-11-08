import { cn } from '@/utils/cn'

/** Animated placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-bark/10', className)} />
}

/** Card-shaped skeleton matching ItemCard's layout (used in browse grids). */
export function ItemCardSkeleton() {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-3xl border border-bark/10 bg-surface shadow-sm"
      aria-hidden
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none rounded-t-3xl" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  )
}

/** Grid of skeletons with a polite loading announcement. */
export function BrowseGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading items">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: count }, (_, i) => (
          <ItemCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
