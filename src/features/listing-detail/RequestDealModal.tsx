import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { BorrowRequest, Listing, User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useMyRequests } from '@/hooks/useRequests'
import { dateInputToIso, formatDateRange, todayInputValue } from '@/utils/dates'
import { validateBorrowPeriod } from '@/utils/validation'
import { formatMoney } from '@/utils/money'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextField, TextAreaField } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { CheckIcon } from '@/components/icons'

export interface RequestDealModalProps {
  listing: Exclude<Listing, { section: 'items' } | { section: 'arenas' }>
  owner: User
  open: boolean
  onClose: () => void
}

/** Max rental window per section (mirrors the service caps). */
const RENT_CAPS: Record<string, number> = { vehicles: 30, properties: 366 }

/** Whole units of the listing's priceUnit inside a day range. */
function unitsForPeriod(listing: Listing, startInput: string, endInput: string): number | null {
  if (!startInput || !endInput) return null
  const days = Math.round((Date.parse(endInput) - Date.parse(startInput)) / 86_400_000) + 1
  if (!Number.isFinite(days) || days < 1) return null
  switch (listing.priceUnit) {
    case 'day':
      return days
    case 'week':
      return Math.ceil(days / 7)
    case 'month':
      return Math.ceil(days / 30)
    case 'hour':
      return days * 24
    default:
      return 1
  }
}

/**
 * Phase 5 deal flow for vehicles & properties:
 *  - rent listings → pick a period, see the price math, send the request
 *  - sell listings → offer form (asking price prefilled; negotiation
 *    happens in chat once the owner accepts an offer)
 * The service re-validates everything (caps, offer rules, overlaps).
 */
export function RequestDealModal({ listing, owner, open, onClose }: RequestDealModalProps) {
  const { state } = useApp()
  const { sendRequest, toErrorMessage } = useMyRequests()
  const currentUser = state.currentUser
  const isSell = listing.listingType === 'sell'

  const today = todayInputValue()
  const [startInput, setStartInput] = useState(today)
  const [endInput, setEndInput] = useState('')
  const [offer, setOffer] = useState(String(listing.price))
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [success, setSuccess] = useState<BorrowRequest | null>(null)

  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setStartInput(todayInputValue())
      setEndInput('')
      setOffer(String(listing.price))
      setNote('')
      setSubmitted(false)
      setSending(false)
      setServiceError(null)
      setSuccess(null)
    }
  }

  const cap = RENT_CAPS[listing.section] ?? 30
  const validation = useMemo(
    () => validateBorrowPeriod(startInput, endInput, cap),
    [startInput, endInput, cap],
  )
  const units = useMemo(
    () => (isSell ? null : unitsForPeriod(listing, startInput, endInput)),
    [isSell, listing, startInput, endInput],
  )
  const offerNumber = Number(offer)
  const offerError = !isSell
    ? undefined
    : !Number.isFinite(offerNumber) || offerNumber <= 0
      ? 'Enter an offer above Rs 0.'
      : !listing.negotiable && offerNumber !== listing.price
        ? 'This listing isn’t negotiable — offer the asking price.'
        : undefined

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setServiceError(null)
    if (!currentUser) return

    if (isSell) {
      if (offerError) return
      setSending(true)
      try {
        const request = await sendRequest({
          listingId: listing.id,
          borrowerId: currentUser.id,
          period: { start: new Date().toISOString(), end: new Date().toISOString() },
          note,
          offerAmount: offerNumber,
        })
        setSuccess(request)
      } catch (error) {
        setServiceError(toErrorMessage(error))
      } finally {
        setSending(false)
      }
      return
    }

    if (!validation.valid) return
    const startIso = dateInputToIso(startInput)
    const endIso = dateInputToIso(endInput)
    if (!startIso || !endIso) return
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

  const title = success
    ? isSell
      ? 'Offer sent'
      : 'Request sent'
    : isSell
      ? 'Make an offer'
      : 'Request to rent'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {success ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full bg-moss-100 text-moss-700"
          >
            <CheckIcon className="h-8 w-8" />
          </span>
          <div>
            <h3 className="font-display text-xl font-bold text-bark">
              {isSell ? 'Offer sent!' : 'Request sent!'}
            </h3>
            <p className="mt-1 text-sm text-bark-light">
              {owner.name} will get back to you — typically in ~{owner.avgResponseMinutes} minutes.
              {isSell
                ? ' If they accept, the listing is reserved for you and you can chat to arrange the handover.'
                : ' You’ll get a notification here the moment they respond.'}
            </p>
          </div>
          <p className="rounded-2xl bg-terracotta-50 px-4 py-2 text-sm font-semibold text-bark">
            {listing.title} ·{' '}
            {isSell
              ? formatMoney(success.offerAmount ?? listing.price, listing.currency)
              : formatDateRange(success.period.start, success.period.end)}
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
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex items-center gap-3 rounded-2xl bg-terracotta-50 p-3">
            <Avatar name={owner.name} src={owner.avatarUrl} size="sm" />
            <p className="text-sm text-bark-light">
              You&apos;re dealing with <span className="font-semibold text-bark">{owner.name}</span>{' '}
              — {formatMoney(listing.price, listing.currency)}
              {listing.listingType === 'rent' ? ` per ${listing.priceUnit}` : ''}
              {listing.negotiable ? ', negotiable' : ''}.
            </p>
          </div>

          {isSell ? (
            <TextField
              label={`Your offer (${listing.currency})`}
              type="number"
              min={1}
              required
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              error={submitted ? offerError : undefined}
              hint={
                listing.negotiable
                  ? `Asking ${formatMoney(listing.price, listing.currency)} — offer what you think is fair.`
                  : `Fixed price: ${formatMoney(listing.price, listing.currency)}.`
              }
            />
          ) : (
            <>
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
                label="End date"
                type="date"
                required
                value={endInput}
                min={startInput || today}
                onChange={(e) => setEndInput(e.target.value)}
                error={submitted ? validation.errors.end : undefined}
                hint={`Up to ${cap} days for ${listing.section}.`}
              />
              {units != null && (
                <p className="rounded-2xl bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-900">
                  {units} × {formatMoney(listing.price, listing.currency)} per {listing.priceUnit} ={' '}
                  {formatMoney(units * listing.price, listing.currency)} total
                </p>
              )}
            </>
          )}

          <TextAreaField
            label="Note to the owner"
            placeholder={`Tell ${owner.name.split(' ')[0]} what you need it for.`}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
              {isSell ? 'Send offer' : 'Send request'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
