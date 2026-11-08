import type { ISODateString } from '@/types'

const DAY_MS = 86_400_000
const MIN_MS = 60_000

/** Format a Date as a local-midnight calendar stamp ("2026-09-06T00:00:00"). */
export function toLocalDateIso(date: Date): ISODateString {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00`
}

/**
 * Convert an <input type="date"> value ("YYYY-MM-DD") into a local-midnight
 * calendar stamp. Returns null for malformed input (never throws).
 */
export function dateInputToIso(value: string): ISODateString | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : `${value}T00:00:00`
}

/** Calendar stamp → "YYYY-MM-DD" for <input type="date"> values. */
export function isoToInputValue(iso: ISODateString): string {
  return iso.slice(0, 10)
}

/** Today's date as an <input type="date"> value. */
export function todayInputValue(now: Date = new Date()): string {
  return toLocalDateIso(now).slice(0, 10)
}

/** Local midnight N days from today (negative for the past). */
export function localDateFromToday(offsetDays: number, now: Date = new Date()): ISODateString {
  const d = new Date(now)
  d.setDate(d.getDate() + offsetDays)
  return toLocalDateIso(d)
}

/** A UTC moment stamp N hours in the past (for seed "sent at" times). */
export function isoHoursAgo(hours: number): ISODateString {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

/** Whole days between two stamps (floor — negative if end precedes start). */
export function daysBetween(startIso: ISODateString, endIso: ISODateString): number {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.floor((end - start) / DAY_MS)
}

/** "Sep 6" (locale-aware; used for due dates and short labels). */
export function formatDate(iso: ISODateString): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "Sep 6 – Sep 8" (or single date if start equals end). */
export function formatDateRange(startIso: ISODateString, endIso: ISODateString): string {
  const start = formatDate(startIso)
  const end = formatDate(endIso)
  if (!start || !end) return ''
  return start === end ? start : `${start} – ${end}`
}

/** "May 2025" — for "Member since" labels. */
export function formatMonthYear(iso: ISODateString): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Minutes → "~45 min" / "~4 hr" for response-time hints. */
export function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `~${Math.round(minutes)} min`
  return `~${Math.round(minutes / 60)} hr`
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / falls back to date. */
export function relativeTime(
  iso: ISODateString,
  nowIso: ISODateString = new Date().toISOString(),
): string {
  const then = Date.parse(iso)
  const now = Date.parse(nowIso)
  if (Number.isNaN(then) || Number.isNaN(now)) return ''
  const mins = Math.floor((now - then) / MIN_MS)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days}d ago`
  return formatDate(iso)
}

/**
 * Inclusive overlap test for two calendar-stamp periods.
 * ["Sep 6–Sep 8"] and ["Sep 8–Sep 10"] share Sep 8, so they overlap.
 * Fixed-format ISO strings compare correctly with <= / >=.
 */
export function periodsOverlap(
  a: { start: ISODateString; end: ISODateString },
  b: { start: ISODateString; end: ISODateString },
): boolean {
  return a.start <= b.end && b.start <= a.end
}

/** Whole days until a due date, from today (negative = overdue). */
export function dueInDays(dueIso: ISODateString, now: Date = new Date()): number {
  return daysBetween(toLocalDateIso(now), dueIso)
}

/** "Due today" / "Due tomorrow" / "Due in 4 days" / "Overdue by 2 days". */
export function formatDueLabel(dueIso: ISODateString, now: Date = new Date()): string {
  const days = dueInDays(dueIso, now)
  if (days < 0) return `Overdue by ${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}
