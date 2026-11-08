import { Link } from 'react-router-dom'
import type { RequestView } from '@/hooks/useRequests'
import { formatDateRange, formatDueLabel } from '@/utils/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/utils/cn'

export type RequestActionId =
  | 'approve'
  | 'decline'
  | 'confirm-pickup'
  | 'mark-returned'
  | 'review'
  | 'withdraw'
  | 'chat'
  | 'report-issue'

export interface RequestCardProps {
  view: RequestView
  /** Which side of the exchange the current user is on. */
  viewerRole: 'lender' | 'borrower'
  /** Conflicting borrowers' names + dates, precomputed by the parent tab. */
  conflictLabels: string[]
  busy?: boolean
  /** Action buttons, rendered by the parent tab. */
  actions?: React.ReactNode
  className?: string
}

/**
 * One request row, driven entirely by the lifecycle state machine's
 * effective status (incl. derived "overdue") and review progress. Status
 * presentation comes from STATUS_META — no status logic lives here.
 */
export function RequestCard({
  view,
  viewerRole,
  conflictLabels,
  busy,
  actions,
  className,
}: RequestCardProps) {
  const { request, effective, statusMeta, counterpartName, counterpartAvatar, review } = view
  const overdue = effective === 'overdue'

  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-3xl border bg-surface p-4 shadow-sm transition-opacity',
        overdue
          ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/60'
          : 'border-bark/10',
        busy && 'opacity-60',
        className,
      )}
      aria-label={`${view.listingTitle} — ${statusMeta.label}`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={counterpartName} src={counterpartAvatar} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={`/item/${request.listingId}`}
              className="truncate font-display text-sm font-bold text-bark hover:text-terracotta-700 dark:hover:text-terracotta-300"
            >
              {view.listingTitle}
            </Link>
            <Badge tone={statusMeta.tone} dot>
              {statusMeta.label}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-bark-light">
            {viewerRole === 'lender' ? 'Lent to' : 'Borrowed from'}{' '}
            <span className="font-semibold text-bark">{counterpartName}</span> ·{' '}
            {formatDateRange(request.period.start, request.period.end)}
            {request.dueAt && (effective === 'active' || overdue) && (
              <span
                className={cn(
                  'font-semibold',
                  overdue
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-terracotta-700 dark:text-terracotta-300',
                )}
              >
                {' '}
                · {formatDueLabel(request.dueAt)}
              </span>
            )}
          </p>
          {request.note && (
            <p className="mt-1.5 rounded-2xl bg-bark/5 px-3 py-1.5 text-xs italic leading-relaxed text-bark-light">
              “{request.note}”
            </p>
          )}
        </div>
      </div>

      {/* Overlap warning — surfaced BEFORE the lender approves both. */}
      {conflictLabels.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-100"
        >
          <span aria-hidden>⚠️</span>
          <span>
            Overlapping request{conflictLabels.length > 1 ? 's' : ''} for these dates:{' '}
            {conflictLabels.join(', ')}. Approving both would double-book the item — pick one.
          </span>
        </p>
      )}

      {/* Overdue escalation — never a dead end. */}
      {overdue && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/60 px-3 py-2 text-xs text-red-800 dark:text-red-200">
          <span className="font-semibold">This borrow is overdue.</span>
          <span>
            {viewerRole === 'lender'
              ? 'Nudge them in chat, or report an issue if it stays unresolved.'
              : 'Return it or check in with the owner — issues can be reported too.'}
          </span>
        </div>
      )}

      {/* Review progress sub-state — the request never disappears. */}
      {review && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-bark-light">
          {view.iReviewed ? (
            <Badge tone="success">You reviewed ✓</Badge>
          ) : (
            <Badge tone="moss">Your review pending</Badge>
          )}
          {review.awaitingReviewFrom &&
            review.awaitingReviewFrom !== (viewerRole === 'lender' ? 'lender' : 'borrower') && (
              <span>
                Waiting for {counterpartName.split(' ')[0]}
                {review.awaitingReviewFrom === 'both' ? ' to review too' : ''}.
              </span>
            )}
        </p>
      )}

      {/* Issue flag */}
      {request.issue && (
        <p className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/60 px-3 py-2 text-xs font-medium text-red-800 dark:text-red-200">
          🚩 Issue reported ({request.issue.reason})
          {request.issue.note ? ` — “${request.issue.note}”` : ''}
        </p>
      )}

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </article>
  )
}
