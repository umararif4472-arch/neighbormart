import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { BorrowRequest, ItemListing, User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useMyRequests } from '@/hooks/useRequests'
import { dateInputToIso, formatDateRange, todayInputValue } from '@/utils/dates'
import { borrowDurationFromInputs, validateBorrowPeriod, validateNote } from '@/utils/validation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextField, TextAreaField } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { CheckIcon } from '@/components/icons'

export interface RequestBorrowModalProps {
  listing: ItemListing
  owner: User
  open: boolean
  onClose: () => void
}

/**
 * Request-to-borrow flow: pick dates + write a note.
 *
 * Validation is real and shown inline (never a silently disabled button):
 * end after start, no past dates, within the item's max duration. The
 * request service re-validates (overlap/availability) — its ApiError is
 * surfaced in the form. On success the modal switches to a success view,
 * and the request is already in context for the dashboard.
 */
export function RequestBorrowModal({ listing, owner, open, onClose }: RequestBorrowModalProps) {
  const { state } = useApp()
  const { sendRequest, toErrorMessage } = useMyRequests()
  const currentUser = state.currentUser

  // Plain call, not a memo: "today" must be fresh whenever the modal
  // re-renders (e.g. after being reopened on a later day).
  const today = todayInputValue()
  const [startInput, setStartInput] = useState(today)
  const [endInput, setEndInput] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [success, setSuccess] = useState<BorrowRequest | null>(null)

  // Reset local form state each time the modal opens.
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setStartInput(todayInputValue())
      setEndInput('')
      setNote('')
      setSubmitted(false)
      setSending(false)
      setServiceError(null)
      setSuccess(null)
    }
  }

  // Validation errors (computed live; shown once the user submits).
  const validation = useMemo(
    () => validateBorrowPeriod(startInput, endInput, listing.details.maxDurationDays),
    [startInput, endInput, listing.details.maxDurationDays],
  )
  const noteError = submitted ? validateNote(note) : undefined
  const durationDays = borrowDurationFromInputs(startInput, endInput)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setServiceError(null)

    if (!validation.valid || noteError) return
    if (!currentUser) return

    const startIso = dateInputToIso(startInput)
    const endIso = dateInputToIso(endInput)
    if (!startIso || !endIso) return // guarded by validation anyway

    setSending(true)
    try {
      const request = await sendRequest({
        listingId: listing.id,
        borrowerId: currentUser.id,
        period: { start: startIso, end: endIso },
        note,
      })
      setSuccess(request)
    } catch (error) {
      setServiceError(toErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={success ? 'Request sent' : `Request to borrow`}>
      {success ? (
        <SuccessView listing={listing} owner={owner} request={success} onClose={onClose} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Owner + item context */}
          <div className="flex items-center gap-3 rounded-2xl bg-terracotta-50 p-3">
            <Avatar name={owner.name} src={owner.avatarUrl} size="sm" />
            <p className="text-sm text-bark-light">
              You&apos;re asking <span className="font-semibold text-bark">{owner.name}</span> —
              typically replies in ~{owner.avgResponseMinutes} min.
            </p>
          </div>

          <TextField
            label="Start date"
            type="date"
            required
            value={startInput}
            min={today}
            onChange={(e) => setStartInput(e.target.value)}
            error={submitted ? validation.errors.start : undefined}
          />
          <TextField
            label="Return by"
            type="date"
            required
            value={endInput}
            min={startInput || today}
            onChange={(e) => setEndInput(e.target.value)}
            error={submitted ? validation.errors.end : undefined}
            hint={
              durationDays != null
                ? `That's a ${durationDays}-day borrow (max ${listing.details.maxDurationDays}).`
                : `This item can be borrowed for up to ${listing.details.maxDurationDays} days.`
            }
          />
          {submitted && validation.errors.duration && (
            <p role="alert" className="-mt-2 text-xs font-medium text-red-700">
              {validation.errors.duration}
            </p>
          )}

          <TextAreaField
            label="Note to the owner"
            placeholder={`Tell ${owner.name.split(' ')[0]} what it's for — a sentence goes a long way.`}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={noteError}
            hint={`${note.length}/500 — optional, but neighborly.`}
          />

          {serviceError && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {serviceError}
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" loading={sending}>
              Send request
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function SuccessView({
  listing,
  owner,
  request,
  onClose,
}: {
  listing: ItemListing
  owner: User
  request: BorrowRequest
  onClose: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <span
        aria-hidden
        className="flex h-16 w-16 items-center justify-center rounded-full bg-moss-100 text-moss-700"
      >
        <CheckIcon className="h-8 w-8" />
      </span>
      <div>
        <h3 className="font-display text-xl font-bold text-bark">Request sent!</h3>
        <p className="mt-1 text-sm text-bark-light">
          {owner.name} will get back to you — typically in ~{owner.avgResponseMinutes} minutes.
          You&apos;ll get a notification here the moment they respond.
        </p>
      </div>
      <p className="rounded-2xl bg-terracotta-50 px-4 py-2 text-sm font-semibold text-bark">
        {listing.title} · {formatDateRange(request.period.start, request.period.end)}
      </p>
      <div className="flex gap-2">
        <Link to="/dashboard" onClick={onClose}>
          <Button>Go to my requests</Button>
        </Link>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}
