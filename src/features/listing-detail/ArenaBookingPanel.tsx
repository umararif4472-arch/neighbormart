import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { ArenaListing, BorrowRequest, User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useMyRequests } from '@/hooks/useRequests'
import { arenaSlotsForDay, slotsOverlap, validateArenaSlot } from '@/utils/requestLifecycle'
import { formatMoney } from '@/utils/money'
import { Button } from '@/components/ui/Button'
import { TextAreaField } from '@/components/ui/Field'
import { CheckIcon } from '@/components/icons'
import { cn } from '@/utils/cn'

export interface ArenaBookingPanelProps {
  listing: ArenaListing
  owner: User
  /** All requests for this listing — busy ones block their slots. */
  requests: readonly BorrowRequest[]
}

const BUSY_STATUSES = new Set(['pending', 'approved', 'active'])

function datePlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dayLabel(isoDate: string, offset: number): { top: string; bottom: string } {
  const d = new Date(`${isoDate}T12:00:00`)
  return {
    top: offset === 0 ? 'Today' : d.toLocaleDateString('en-PK', { weekday: 'short' }),
    bottom: d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }),
  }
}

/**
 * Phase 5 arena booking: pick a day inside the advance-booking window,
 * tap one or more consecutive slots, see the price math, send the
 * booking request. Busy slots (pending/approved/active requests) are
 * shown booked; the service re-validates with the same pure helpers.
 */
export function ArenaBookingPanel({ listing, owner, requests }: ArenaBookingPanelProps) {
  const { state } = useApp()
  const { sendRequest, toErrorMessage } = useMyRequests()
  const currentUser = state.currentUser
  const maxDays = listing.details.advanceBooking.maxAdvanceDays

  const [date, setDate] = useState(() => datePlus(0))
  const [selected, setSelected] = useState<string[]>([]) // startTimes, sorted
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [success, setSuccess] = useState<BorrowRequest | null>(null)

  const grid = useMemo(() => arenaSlotsForDay(listing), [listing])

  const busyRanges = useMemo(
    () =>
      requests
        .filter((r) => r.slot && r.slot.date === date && BUSY_STATUSES.has(r.status))
        .map((r) => r.slot!),
    [requests, date],
  )

  const slotState = (startTime: string, endTime: string): 'free' | 'booked' | 'tooSoon' => {
    if (busyRanges.some((b) => slotsOverlap({ date, startTime, endTime }, b))) return 'booked'
    if (validateArenaSlot(listing, { date, startTime, endTime }) !== null) return 'tooSoon'
    return 'free'
  }

  function toggleSlot(startTime: string) {
    setServiceError(null)
    setSelected((prev) => {
      if (prev.includes(startTime)) return prev.filter((s) => s !== startTime)
      // Keep the selection one consecutive run: extend only if adjacent.
      if (prev.length === 0) return [startTime]
      const sorted = [...prev, startTime].sort()
      const cells = grid.filter((g) => sorted.includes(g.startTime))
      const consecutive = cells.every(
        (cell, i) => i === 0 || cells[i - 1].endTime === cell.startTime,
      )
      return consecutive ? sorted : [startTime]
    })
  }

  const chosen = useMemo(() => {
    const cells = grid.filter((g) => selected.includes(g.startTime))
    if (cells.length === 0) return null
    const hours = (cells.length * listing.details.slotMinutes) / 60
    return {
      startTime: cells[0].startTime,
      endTime: cells[cells.length - 1].endTime,
      hours,
      total: hours * listing.price,
    }
  }, [grid, selected, listing.details.slotMinutes, listing.price])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!currentUser || !chosen) return
    const slot = { date, startTime: chosen.startTime, endTime: chosen.endTime }
    const invalid = validateArenaSlot(listing, slot)
    if (invalid) {
      setServiceError(invalid)
      return
    }
    setSending(true)
    setServiceError(null)
    try {
      const request = await sendRequest({
        listingId: listing.id,
        borrowerId: currentUser.id,
        period: {
          start: new Date(`${date}T${slot.startTime}:00`).toISOString(),
          end: new Date(`${date}T${slot.endTime}:00`).toISOString(),
        },
        note,
        slot,
      })
      setSuccess(request)
    } catch (error) {
      setServiceError(toErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  if (success) {
    return (
      <section
        aria-label="Booking sent"
        className="flex flex-col items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-5 text-center shadow-sm"
      >
        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-moss-100 text-moss-700"
        >
          <CheckIcon className="h-7 w-7" />
        </span>
        <h2 className="font-display text-lg font-bold text-bark">Booking request sent!</h2>
        <p className="text-sm text-bark-light">
          {owner.name} will confirm your slot — {success.slot?.date} · {success.slot?.startTime}–
          {success.slot?.endTime}. You&apos;ll get a notification the moment they respond.
        </p>
        <Link to="/dashboard">
          <Button>Go to my requests</Button>
        </Link>
      </section>
    )
  }

  return (
    <section
      id="arena-booking"
      aria-label={`Book a slot at ${listing.title}`}
      className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm"
    >
      <div>
        <h2 className="font-display text-lg font-bold text-bark">Book a slot</h2>
        <p className="mt-0.5 text-xs text-bark-light">
          {formatMoney(listing.price, listing.currency)} per hour · slots of{' '}
          {listing.details.slotMinutes} min · book up to {maxDays} days ahead
        </p>
      </div>

      {/* Day strip */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Pick a day">
        {Array.from({ length: maxDays + 1 }, (_, i) => {
          const iso = datePlus(i)
          const label = dayLabel(iso, i)
          const active = iso === date
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDate(iso)
                setSelected([])
                setServiceError(null)
              }}
              className={cn(
                'flex shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-xs transition-colors',
                active
                  ? 'border-terracotta-600 bg-terracotta-600 text-white'
                  : 'border-bark/15 bg-surface text-bark-light hover:border-terracotta-300',
              )}
            >
              <span className="font-semibold">{label.top}</span>
              <span>{label.bottom}</span>
            </button>
          )
        })}
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="group" aria-label="Pick slots">
        {grid.map(({ startTime, endTime }) => {
          const state = slotState(startTime, endTime)
          const isSelected = selected.includes(startTime)
          return (
            <button
              key={startTime}
              type="button"
              disabled={state !== 'free'}
              aria-pressed={isSelected}
              onClick={() => toggleSlot(startTime)}
              className={cn(
                'rounded-xl border px-2 py-2 text-xs font-semibold transition-colors',
                state === 'booked' &&
                  'cursor-not-allowed border-bark/10 bg-bark/5 text-bark-light line-through',
                state === 'tooSoon' && 'cursor-not-allowed border-bark/10 bg-surface text-bark/30',
                state === 'free' &&
                  !isSelected &&
                  'border-moss-300 bg-moss-50 text-moss-900 hover:border-moss-500',
                isSelected && 'border-terracotta-600 bg-terracotta-600 text-white',
              )}
            >
              {startTime}
              <span className="block text-[10px] font-medium opacity-70">
                {state === 'booked' ? 'Booked' : `to ${endTime}`}
              </span>
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {chosen ? (
          <p className="rounded-2xl bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-900">
            {date} · {chosen.startTime}–{chosen.endTime} · {chosen.hours} hr ={' '}
            {formatMoney(chosen.total, listing.currency)}
          </p>
        ) : (
          <p className="text-xs text-bark-light">
            Tap a free slot — tap a neighbouring slot to book a longer session.
          </p>
        )}
        <TextAreaField
          label="Note for the arena (optional)"
          placeholder="Team size, what you're playing, anything they should know."
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {serviceError && (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {serviceError}
          </p>
        )}
        <Button type="submit" size="lg" loading={sending} disabled={!chosen}>
          Request this slot
        </Button>
      </form>
    </section>
  )
}
