import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Report } from '@/types'
import { useApp } from '@/context/AppContext'
import { safetyApi, toErrorMessage } from '@/services'
import { usePageMeta } from '@/hooks/usePageMeta'
import { findById } from '@/utils/collections'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * /moderation (Phase 8) — the reports queue for admin accounts.
 * Non-admins get a clear denial (the service + Firestore rules also
 * refuse them server-side). Actions: dismiss, or remove the reported
 * listing, which resolves the report as "actioned".
 */
export function ModerationPage() {
  usePageMeta({ title: 'Moderation', description: 'Review reports from the community.' })
  const { state } = useApp()
  const actor = state.currentUser
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!actor) return
    setLoading(true)
    setError(null)
    try {
      setReports(await safetyApi.listOpenReports(actor.id))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [actor])

  useEffect(() => {
    void load()
  }, [load])

  async function act(report: Report, action: 'dismiss' | 'remove-listing') {
    if (!actor) return
    setBusyId(report.id)
    try {
      await safetyApi.resolveReport(actor.id, report.id, action)
      setReports((prev) => prev.filter((r) => r.id !== report.id))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  if (!actor) {
    return (
      <EmptyState
        emoji="🔐"
        title="Sign in required"
        message="Moderation is available to signed-in admin accounts."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
          Moderation queue
        </h1>
        <p className="mt-1 text-sm text-bark-light">
          Reports from the community, newest first. Removing a listing hides it everywhere at once.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-red-200 dark:border-red-800 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
        >
          <span>{error}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Loading reports" className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : reports.length === 0 && !error ? (
        <EmptyState
          emoji="🎉"
          title="Queue is clear"
          message="No open reports. The neighborhood is behaving itself."
        />
      ) : (
        <ul className="flex list-none flex-col gap-3">
          {reports.map((report) => {
            const targetListing =
              report.kind === 'listing'
                ? state.listings.find((l) => l.id === report.targetId)
                : undefined
            const targetUser =
              report.kind === 'user' ? findById(state.users, report.targetId) : undefined
            const reporter = findById(state.users, report.reportedBy)
            return (
              <li
                key={report.id}
                className="flex flex-col gap-3 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-800 dark:bg-red-950 dark:text-red-200">
                    {report.kind === 'borrow-issue' ? 'Borrow issue' : `Reported ${report.kind}`}
                  </span>
                  <span className="rounded-full bg-bark/5 px-2.5 py-1 text-bark">
                    Reason: {report.reason}
                  </span>
                  <span className="text-bark-light">
                    {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-bark-light">
                  {report.kind === 'listing' ? (
                    <>
                      Listing:{' '}
                      {targetListing ? (
                        <Link
                          to={`/listing/${targetListing.id}`}
                          className="font-semibold text-terracotta-700 underline-offset-2 hover:underline dark:text-terracotta-300"
                        >
                          {targetListing.title}
                        </Link>
                      ) : (
                        <span className="font-semibold text-bark">{report.targetId}</span>
                      )}
                    </>
                  ) : report.kind === 'user' ? (
                    <>
                      User:{' '}
                      {targetUser ? (
                        <Link
                          to={`/profile/${targetUser.id}`}
                          className="font-semibold text-terracotta-700 underline-offset-2 hover:underline dark:text-terracotta-300"
                        >
                          {targetUser.name}
                        </Link>
                      ) : (
                        <span className="font-semibold text-bark">{report.targetId}</span>
                      )}
                    </>
                  ) : (
                    <>Borrow issue on a past deal.</>
                  )}{' '}
                  · reported by {reporter?.name ?? 'a neighbor'}
                  {report.details && <p className="mt-1 italic">“{report.details}”</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.kind === 'listing' && (
                    <Button
                      size="sm"
                      loading={busyId === report.id}
                      onClick={() => void act(report, 'remove-listing')}
                    >
                      Remove listing
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === report.id}
                    onClick={() => void act(report, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
