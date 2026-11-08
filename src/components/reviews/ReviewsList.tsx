import type { Review, User } from '@/types'
import { formatDate, relativeTime } from '@/utils/dates'
import { Avatar } from '@/components/ui/Avatar'
import { StarRating } from '@/components/ui/StarRating'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/utils/cn'

export interface ReviewCardProps {
  review: Review
  reviewer: User | undefined
  /** Optional item context (used on profiles, hidden on item pages). */
  showItem?: string | false
  /**
   * Perspective: "about" shows the reviewer (default); "written" shows the
   * reviewee — used on profiles for the reviews-this-user-wrote section.
   */
  perspective?: 'about' | 'written'
  className?: string
}

/** One neighbor's review: stars, comment, who wrote it, when. */
export function ReviewCard({
  review,
  reviewer,
  showItem,
  perspective = 'about',
  className,
}: ReviewCardProps) {
  const written = perspective === 'written'
  return (
    <article
      className={cn(
        'flex flex-col gap-2.5 rounded-3xl border border-bark/10 bg-white p-4 shadow-sm',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={reviewer?.name ?? 'A neighbor'} src={reviewer?.avatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-bark">
              {reviewer?.name ?? 'A neighbor'}
            </p>
            <p className="text-xs text-bark-light">
              {written
                ? `${review.reviewerRole === 'lender' ? 'their lend of' : 'their borrow of'} this item`
                : `${review.reviewerRole === 'lender' ? 'lent this item' : 'borrowed this item'}`}
              {showItem ? ` · ${showItem}` : ''}
            </p>
          </div>
        </div>
        <StarRating value={review.rating} />
      </div>
      <blockquote className="text-sm leading-relaxed text-bark">
        &ldquo;{review.comment}&rdquo;
      </blockquote>
      <time dateTime={review.createdAt} className="text-xs text-bark-light">
        {relativeTime(review.createdAt)} · {formatDate(review.createdAt)}
      </time>
    </article>
  )
}

export interface ReviewsListProps {
  reviews: Review[]
  /** userId → user lookup for the displayed person. */
  usersById: (id: string) => User | undefined
  /** Empty-state copy varies by context. */
  emptyTitle?: string
  emptyMessage?: string
  /** Display perspective (see ReviewCard). */
  perspective?: 'about' | 'written'
  className?: string
}

/**
 * Reviews section body with a real empty state — zero reviews renders a
 * friendly callout, never a broken or blank section.
 */
export function ReviewsList({
  reviews,
  usersById,
  emptyTitle = 'No reviews yet',
  emptyMessage = 'The first borrower sets the tone — reviews build trust for everyone.',
  perspective = 'about',
  className,
}: ReviewsListProps) {
  if (reviews.length === 0) {
    return <EmptyState emoji="🌱" title={emptyTitle} message={emptyMessage} className={className} />
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {reviews.map((review) => (
        <ReviewCard
          key={review.id}
          review={review}
          reviewer={usersById(perspective === 'written' ? review.revieweeId : review.reviewerId)}
          perspective={perspective}
        />
      ))}
    </div>
  )
}
