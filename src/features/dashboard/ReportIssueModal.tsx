import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { RequestView } from '@/hooks/useRequests'
import { useApp } from '@/context/AppContext'
import { useMyRequests } from '@/hooks/useRequests'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextAreaField } from '@/components/ui/Field'
import { CheckIcon } from '@/components/icons'
import { cn } from '@/utils/cn'

export interface ReportIssueModalProps {
  view: RequestView
  open: boolean
  onClose: () => void
}

const REASONS = [
  'Item not returned',
  'Returned late / damaged',
  'Can\u2019t reach the other neighbor',
  'Something else',
] as const

/**
 * Escalation path for overdue/problem borrows. Reporting flags the request
 * (visible to both parties) and notifies the counterpart — the borrow is
 * never left stuck silently. Chat stays one tap away.
 */
export function ReportIssueModal({ view, open, onClose }: ReportIssueModalProps) {
  const { state } = useApp()
  const { reportIssue, toErrorMessage } = useMyRequests()
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const reasonError = submitted && !reason ? 'Pick what went wrong.' : undefined
  const noteError =
    submitted && note.trim().length > 0 && note.trim().length < 5
      ? 'Add a little more detail (or leave the note empty).'
      : undefined

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!reason || (note.trim().length > 0 && note.trim().length < 5)) return
    if (!state.currentUser) return

    setSending(true)
    try {
      await reportIssue({
        requestId: view.request.id,
        actorId: state.currentUser.id,
        reason,
        note,
      })
      setDone(true)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={done ? 'Issue reported' : 'Report an issue'}>
      {done ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700"
          >
            <CheckIcon className="h-7 w-7" />
          </span>
          <p className="text-sm leading-relaxed text-bark-light">
            Thanks for flagging it. {view.counterpartName.split(' ')[0]} has been notified, the
            request is marked with the issue, and you can keep coordinating in chat — most things
            resolve with a conversation.
          </p>
          <div className="flex gap-2">
            <Link to={`/messages/${view.request.id}`}>
              <Button>Open chat</Button>
            </Link>
            <Button variant="secondary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm leading-relaxed text-bark-light">
            About the <span className="font-semibold text-bark">{view.listingTitle}</span> borrow
            with <span className="font-semibold text-bark">{view.counterpartName}</span>. This flags
            the request and lets them know something needs sorting — it doesn&apos;t cancel
            anything.
          </p>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-bark">
              What went wrong?
              <span aria-hidden className="ml-1 text-terracotta-600">
                *
              </span>
            </legend>
            {REASONS.map((option) => (
              <label
                key={option}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm transition-colors',
                  'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-600',
                  reason === option
                    ? 'border-terracotta-600 bg-terracotta-50 text-terracotta-900 font-semibold'
                    : 'border-bark/15 bg-surface text-bark hover:border-terracotta-300',
                )}
              >
                <input
                  type="radio"
                  name="issue-reason"
                  value={option}
                  checked={reason === option}
                  onChange={() => setReason(option)}
                  className="sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    'h-4 w-4 rounded-full border-2',
                    reason === option
                      ? 'border-terracotta-600 bg-terracotta-600'
                      : 'border-bark/30',
                  )}
                >
                  {reason === option && (
                    <span className="block h-full w-full scale-50 rounded-full bg-surface" />
                  )}
                </span>
                {option}
              </label>
            ))}
          </fieldset>
          {reasonError && (
            <p role="alert" className="-mt-2 text-xs font-medium text-red-700">
              {reasonError}
            </p>
          )}

          <TextAreaField
            label="Details (optional)"
            value={note}
            maxLength={500}
            rows={3}
            placeholder="Anything that helps sort this out faster…"
            onChange={(e) => setNote(e.target.value)}
            error={noteError}
          />

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={sending}>
              Report issue
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
