import { useMemo, useState, type FormEvent } from 'react'
import type { RequestView } from '@/hooks/useRequests'
import { useApp } from '@/context/AppContext'
import { useMyRequests } from '@/hooks/useRequests'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextAreaField } from '@/components/ui/Field'
import { StarInput } from '@/components/ui/StarInput'
import { Avatar } from '@/components/ui/Avatar'
import { CheckIcon } from '@/components/icons'

export interface ReviewModalProps {
  view: RequestView
  viewerRole: 'lender' | 'borrower'
  open: boolean
  onClose: () => void
}

/**
 * Review flow for a returned borrow: 1–5 stars + a short comment for the
 * other party. The service blocks double reviews (one per party per
 * request) and completes the returned → reviewed transition when the pair
 * is done — the success panel explains which of the two just happened.
 */
export function ReviewModal({ view, viewerRole, open, onClose }: ReviewModalProps) {
  const { state } = useApp()
  const { sendReview, toErrorMessage } = useMyRequests()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ pairComplete: boolean } | null>(null)

  const counterpartName = view.counterpartName.split(' ')[0]

  const ratingError = useMemo(
    () => (submitted && rating === 0 ? 'Pick a star rating first.' : undefined),
    [submitted, rating],
  )
  const commentError = useMemo(() => {
    if (!submitted) return undefined
    const trimmed = comment.trim()
    if (trimmed.length < 3) return 'Add a short comment (3+ characters) — it means a lot.'
    if (trimmed.length > 500) return 'Keep it under 500 characters.'
    return undefined
  }, [submitted, comment])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (rating === 0 || comment.trim().length < 3) return
    if (!state.currentUser) return

    setSending(true)
    try {
      const result = await sendReview({
        requestId: view.request.id,
        reviewerId: state.currentUser.id,
        rating,
        comment,
      })
      setDone({ pairComplete: result.request?.status === 'reviewed' })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={done ? 'Review sent' : `Review ${counterpartName}`}>
      {done ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-moss-100 dark:bg-moss-900/50 text-moss-700 dark:text-moss-300"
          >
            <CheckIcon className="h-7 w-7" />
          </span>
          <p className="text-sm leading-relaxed text-bark-light">
            {done.pairComplete
              ? `That wraps up the ${view.listingTitle} borrow — you both reviewed, so it's fully closed. Your stars now feed ${counterpartName}'s trust score.`
              : `Thanks! ${counterpartName} gets your stars right away. The borrow stays visible in "reviews pending" until they review you too.`}
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex items-center gap-3 rounded-2xl bg-terracotta-50 dark:bg-terracotta-900/50 p-3">
            <Avatar name={view.counterpartName} src={view.counterpartAvatar} size="sm" />
            <p className="text-xs leading-relaxed text-bark-light">
              You were the <span className="font-semibold text-bark">{viewerRole}</span> on{' '}
              <span className="font-semibold text-bark">{view.listingTitle}</span>. Your review
              feeds {counterpartName}&apos;s trust score — theirs will feed yours.
            </p>
          </div>

          <StarInput
            legend={viewerRole === 'lender' ? 'How was having it back?' : 'How was the borrow?'}
            value={rating}
            onChange={setRating}
            error={ratingError}
          />

          <TextAreaField
            label="Your comment"
            value={comment}
            maxLength={500}
            rows={4}
            placeholder={`e.g. "${counterpartName} returned it on time, spotless, with cookies."`}
            hint={`${comment.length}/500 — specific, honest, kind.`}
            onChange={(e) => setComment(e.target.value)}
            error={commentError}
          />

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" loading={sending}>
              Send review
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
