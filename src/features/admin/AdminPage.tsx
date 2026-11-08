import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { TrustBadge } from '@/components/ui/Trust'
import { useApp } from '@/context/AppContext'
import { useToast } from '@/context/ToastContext'
import { adminApi, listingsApi, reviewsApi, safetyApi, usersApi } from '@/services'
import { toErrorMessage } from '@/services/errors'
import type { AdminStats, AuditEntry, Listing, ListingSection, Report, User } from '@/types'
import { LISTING_SECTIONS } from '@/types'
import { formatPrice } from '@/utils/money'
import { sectionAccent } from '@/utils/sectionAccent'
import { buildTrustHistory, calculateTrustScore } from '@/utils/trustScore'
import { cn } from '@/utils/cn'

/**
 * Admin panel (Phase 9) — /admin, admins only. The guard here is UX;
 * the real enforcement is the Firestore rules (isAdmin on every admin
 * write + the audit log) and the services' own role checks.
 *
 * Tabs: Overview (stats + CSS charts), Reports (the Phase 8 queue plus
 * warn/suspend), Listings (pause/remove/restore/feature), Users
 * (suspend/delete), Admins (add/remove, last admin protected), Audit.
 */

type TabId = 'overview' | 'reports' | 'listings' | 'users' | 'admins' | 'audit'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Reports' },
  { id: 'listings', label: 'Listings' },
  { id: 'users', label: 'Users' },
  { id: 'admins', label: 'Admins' },
  { id: 'audit', label: 'Audit log' },
]

const SECTION_LABEL: Record<ListingSection, string> = {
  items: 'Items & Tools',
  vehicles: 'Vehicles',
  properties: 'Properties',
  arenas: 'Arenas & Venues',
}

export function AdminPage() {
  const { state } = useApp()
  const user = state.currentUser
  const [tab, setTab] = useState<TabId>('overview')

  if (!user) {
    return (
      <EmptyState
        tone="error"
        emoji="🔒"
        title="Sign in first"
        message="The admin panel needs an admin account."
        action={
          <Link to="/signin" className="font-semibold text-terracotta-600 dark:text-terracotta-400">
            Go to sign in
          </Link>
        }
      />
    )
  }
  if (user.role !== 'admin') {
    return (
      <EmptyState
        tone="error"
        emoji="🛡️"
        title="Admins only"
        message="Your account does not have the admin role. If it should, ask an existing admin to add you from the Admins tab."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold text-bark">Admin panel</h1>
        <p className="text-sm text-bark-light">
          Signed in as {user.name} · every action here is written to the audit log.
        </p>
      </header>

      <div role="tablist" aria-label="Admin sections" className="flex flex-wrap gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              tab === id
                ? 'bg-terracotta-600 text-white'
                : 'bg-surface text-bark-light hover:text-bark',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab actorId={user.id} />}
      {tab === 'reports' && <ReportsTab actorId={user.id} />}
      {tab === 'listings' && <ListingsTab actorId={user.id} />}
      {tab === 'users' && <UsersTab actorId={user.id} />}
      {tab === 'admins' && <AdminsTab actorId={user.id} />}
      {tab === 'audit' && <AuditTab actorId={user.id} />}
    </div>
  )
}

/* ---------------- shared bits ---------------- */

function useAdminData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  const reload = useCallback(() => {
    setLoading(true)
    loadRef
      .current()
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: unknown) => setError(toErrorMessage(e)))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])
  return { data, error, loading, reload }
}

function TabShell({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string | null
  children: React.ReactNode
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-bark-light">
        <Spinner /> Loading…
      </div>
    )
  }
  if (error)
    return <EmptyState tone="error" emoji="⚠️" title="Something went wrong" message={error} />
  return <>{children}</>
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-3xl border border-bark/10 bg-surface p-4">
      <p className="text-xs font-semibold tracking-wide text-bark-light uppercase">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-bark">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-bark-light">{hint}</p>}
    </div>
  )
}

/** Bare input in the Field control style (no label shell needed here). */
function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-2xl border border-bark/15 bg-surface px-3.5 py-2.5 text-sm text-bark placeholder:text-bark-light/75',
        props.className,
      )}
    />
  )
}

/* ---------------- Overview ---------------- */

function OverviewTab({ actorId }: { actorId: string }) {
  const [today] = useState(() => new Date())
  const {
    data: stats,
    error,
    loading,
  } = useAdminData<AdminStats>(() => adminApi.getStats(actorId), [actorId])
  return (
    <TabShell loading={loading} error={error}>
      {stats && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Users"
              value={stats.totalUsers}
              hint={`${stats.signupsThisWeek} new this week`}
            />
            <StatCard
              label="Listings"
              value={stats.totalListings}
              hint={`${stats.activeListings} active`}
            />
            <StatCard label="Active deals" value={stats.activeDeals} hint="Approved or out now" />
            <StatCard label="Open reports" value={stats.openReports} />
            <StatCard label="Admins" value={stats.totalAdmins} />
            <StatCard label="Signups this week" value={stats.signupsThisWeek} hint="Last 7 days" />
          </div>

          <section className="rounded-3xl border border-bark/10 bg-surface p-5">
            <h2 className="font-display text-lg font-bold text-bark">Listings by section</h2>
            <div className="mt-4 flex flex-col gap-3">
              {LISTING_SECTIONS.map((section) => {
                const count = stats.listingsBySection[section]
                const max = Math.max(1, ...Object.values(stats.listingsBySection))
                return (
                  <div key={section} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm text-bark-light">
                      {SECTION_LABEL[section]}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-bark/10">
                      <div
                        className={cn('h-full rounded-full', sectionAccent(section).solid)}
                        style={{ width: `${(count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold text-bark">{count}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-bark/10 bg-surface p-5">
            <h2 className="font-display text-lg font-bold text-bark">Signups — last 7 days</h2>
            <div
              className="mt-4 flex h-28 items-end gap-2"
              role="img"
              aria-label="Signup counts per day"
            >
              {stats.signupsByDay.map((count, i) => {
                const max = Math.max(1, ...stats.signupsByDay)
                const day = new Date(today.getTime() - (6 - i) * 24 * 3600 * 1000)
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-semibold text-bark">{count}</span>
                    <div
                      className="w-full rounded-t-xl bg-terracotta-500"
                      style={{ height: `${Math.max(6, (count / max) * 72)}px` }}
                    />
                    <span className="text-[11px] text-bark-light">
                      {day.toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </TabShell>
  )
}

/* ---------------- Reports ---------------- */

function ReportsTab({ actorId }: { actorId: string }) {
  const toast = useToast()
  const { data, error, loading, reload } = useAdminData<{
    reports: Report[]
    users: User[]
  }>(async () => {
    const [reports, users] = await Promise.all([
      safetyApi.listOpenReports(actorId),
      usersApi.getUsers(),
    ])
    return { reports, users }
  }, [actorId])
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.push({ tone: 'success', title: ok })
      reload()
    } catch (e) {
      toast.push({ tone: 'danger', title: 'Action failed', body: toErrorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <TabShell loading={loading} error={error}>
      {data && data.reports.length === 0 && (
        <EmptyState emoji="🎉" title="Queue is clear" message="No open reports right now." />
      )}
      {data && data.reports.length > 0 && (
        <ul className="flex list-none flex-col gap-3">
          {data.reports.map((report: Report) => {
            const owner = data.users.find((u) => u.id === report.targetOwnerId)
            return (
              <li key={report.id} className="rounded-3xl border border-bark/10 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger">{report.reason}</Badge>
                  <Badge>{report.kind}</Badge>
                  <span className="text-xs text-bark-light">
                    {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-bark">
                  Target: <span className="font-semibold">{report.targetId}</span>
                  {owner && <> · owner {owner.name}</>}
                </p>
                {report.details && <p className="mt-1 text-sm text-bark-light">{report.details}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === report.id}
                    onClick={() =>
                      void act(
                        report.id,
                        async () => {
                          await safetyApi.resolveReport(actorId, report.id, 'dismiss')
                        },
                        'Report dismissed',
                      )
                    }
                  >
                    Dismiss
                  </Button>
                  {report.kind === 'listing' && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === report.id}
                      onClick={() =>
                        void act(
                          report.id,
                          async () => {
                            await safetyApi.resolveReport(actorId, report.id, 'remove-listing')
                          },
                          'Listing removed',
                        )
                      }
                    >
                      Remove listing
                    </Button>
                  )}
                  {report.targetOwnerId && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === report.id}
                        onClick={() =>
                          void act(
                            report.id,
                            () =>
                              adminApi.warnUser(
                                actorId,
                                report.targetOwnerId!,
                                'Your listing or profile was reported. Please review our community rules.',
                              ),
                            'Warning sent',
                          )
                        }
                      >
                        Warn owner
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy === report.id}
                        onClick={() =>
                          void act(
                            report.id,
                            () => adminApi.suspendUser(actorId, report.targetOwnerId!),
                            'Owner suspended',
                          )
                        }
                      >
                        Suspend owner
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </TabShell>
  )
}

/* ---------------- Listings ---------------- */

function ListingsTab({ actorId }: { actorId: string }) {
  const toast = useToast()
  const {
    data: listings,
    error,
    loading,
    reload,
  } = useAdminData<Listing[]>(() => listingsApi.getListings(), [])
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<'all' | ListingSection>('all')
  const [status, setStatus] = useState<string>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      (listings ?? []).filter(
        (l) =>
          (section === 'all' || l.section === section) &&
          (status === 'all' || l.status === status) &&
          (query.trim() === '' || l.title.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [listings, query, section, status],
  )

  const act = async (listing: Listing, fn: () => Promise<void>, ok: string) => {
    setBusy(listing.id)
    try {
      await fn()
      toast.push({ tone: 'success', title: ok })
      reload()
    } catch (e) {
      toast.push({ tone: 'danger', title: 'Action failed', body: toErrorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <TabShell loading={loading} error={error}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <AdminInput
            aria-label="Search listings"
            placeholder="Search titles…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-48 flex-1"
          />
          <select
            aria-label="Section"
            value={section}
            onChange={(e) => setSection(e.target.value as typeof section)}
            className="rounded-2xl border border-bark/15 bg-surface px-3 py-2.5 text-sm text-bark"
          >
            <option value="all">All sections</option>
            {LISTING_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {SECTION_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-2xl border border-bark/15 bg-surface px-3 py-2.5 text-sm text-bark"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="reserved">Reserved</option>
            <option value="rented">Rented</option>
            <option value="sold">Sold</option>
            <option value="removed">Removed</option>
          </select>
        </div>

        {filtered.length === 0 && (
          <EmptyState
            emoji="🔍"
            title="No listings match"
            message="Try a different search or filter."
          />
        )}
        <ul className="flex list-none flex-col gap-2">
          {filtered.map((listing) => (
            <li
              key={listing.id}
              className="flex flex-wrap items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-bark">
                  {listing.featured && <span aria-label="Featured">⭐ </span>}
                  {listing.title}
                </p>
                <p className="text-xs text-bark-light">
                  {SECTION_LABEL[listing.section]} · {listing.listingType} · {formatPrice(listing)}{' '}
                  · {listing.location.city}
                </p>
              </div>
              <Badge
                tone={
                  listing.status === 'active'
                    ? 'success'
                    : listing.status === 'removed'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {listing.status}
              </Badge>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === listing.id}
                  onClick={() =>
                    void act(
                      listing,
                      () => adminApi.setFeatured(actorId, listing.id, !listing.featured),
                      listing.featured ? 'Unfeatured' : 'Featured on landing',
                    )
                  }
                >
                  {listing.featured ? 'Unfeature' : 'Feature'}
                </Button>
                {listing.status === 'active' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === listing.id}
                    onClick={() =>
                      void act(
                        listing,
                        () => adminApi.setListingStatusAdmin(actorId, listing.id, 'paused'),
                        'Listing paused',
                      )
                    }
                  >
                    Pause
                  </Button>
                )}
                {(listing.status === 'paused' || listing.status === 'removed') && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy === listing.id}
                    onClick={() =>
                      void act(
                        listing,
                        () => adminApi.setListingStatusAdmin(actorId, listing.id, 'active'),
                        'Listing restored',
                      )
                    }
                  >
                    Restore
                  </Button>
                )}
                {listing.status !== 'removed' && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy === listing.id}
                    onClick={() =>
                      void act(
                        listing,
                        () => adminApi.setListingStatusAdmin(actorId, listing.id, 'removed'),
                        'Listing removed',
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </TabShell>
  )
}

/* ---------------- Users ---------------- */

function UsersTab({ actorId }: { actorId: string }) {
  const toast = useToast()
  const { data, error, loading, reload } = useAdminData<{
    users: User[]
    listings: Listing[]
    reports: Report[]
    reviews: import('@/types').Review[]
  }>(async () => {
    const [users, listings, reports, reviews] = await Promise.all([
      usersApi.getUsers(),
      listingsApi.getListings(),
      safetyApi.listOpenReports(actorId).catch(() => [] as Report[]),
      reviewsApi.getReviews(),
    ])
    return { users, listings, reports, reviews }
  }, [actorId])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)
  const [warnTarget, setWarnTarget] = useState<User | null>(null)
  const [warnText, setWarnText] = useState('')

  const act = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast.push({ tone: 'success', title: ok })
      reload()
    } catch (e) {
      toast.push({ tone: 'danger', title: 'Action failed', body: toErrorMessage(e) })
    } finally {
      setBusy(null)
    }
  }

  const filtered = (data?.users ?? []).filter(
    (u) =>
      query.trim() === '' ||
      u.name.toLowerCase().includes(query.trim().toLowerCase()) ||
      (u.email ?? '').toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <TabShell loading={loading} error={error}>
      <div className="flex flex-col gap-4">
        <AdminInput
          aria-label="Search users"
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtered.length === 0 && <EmptyState emoji="🔍" title="No users match" />}
        <ul className="flex list-none flex-col gap-2">
          {filtered.map((u) => {
            const trust = calculateTrustScore(
              buildTrustHistory(
                u,
                data!.reviews.filter((r) => r.revieweeId === u.id),
              ),
            )
            const listingCount = data!.listings.filter((l) => l.ownerId === u.id).length
            const reportCount = data!.reports.filter(
              (r) => r.targetOwnerId === u.id || r.targetId === u.id,
            ).length
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-3"
              >
                <Avatar name={u.name} src={u.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-bark">
                    {u.name}
                    <TrustBadge tierName={trust.tierName} />
                    {u.role === 'admin' && <Badge tone="success">admin</Badge>}
                    {u.suspended && <Badge tone="danger">suspended</Badge>}
                    {(u.warnings ?? 0) > 0 && <Badge tone="warning">{u.warnings} warning(s)</Badge>}
                  </p>
                  <p className="text-xs text-bark-light">
                    {u.email ?? 'no email'} · trust {trust.total} · {listingCount} listings ·{' '}
                    {reportCount} reports against
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === u.id}
                    onClick={() => setWarnTarget(u)}
                  >
                    Warn
                  </Button>
                  {u.suspended ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === u.id}
                      onClick={() =>
                        void act(
                          u.id,
                          () => adminApi.unsuspendUser(actorId, u.id),
                          'User reinstated',
                        )
                      }
                    >
                      Unsuspend
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === u.id}
                      onClick={() =>
                        void act(u.id, () => adminApi.suspendUser(actorId, u.id), 'User suspended')
                      }
                    >
                      Suspend
                    </Button>
                  )}
                  {u.id !== actorId && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy === u.id}
                      onClick={() => setConfirmDelete(u)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <Modal
        open={warnTarget !== null}
        onClose={() => setWarnTarget(null)}
        title={`Warn ${warnTarget?.name ?? ''}`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-bark-light">
            They will get this as a notification, and the warning is counted on their account and
            written to the audit log.
          </p>
          <AdminInput
            aria-label="Warning message"
            placeholder="Please review our community rules…"
            value={warnText}
            onChange={(e) => setWarnText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setWarnTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!warnTarget || busy === warnTarget.id}
              onClick={() => {
                const target = warnTarget!
                setWarnTarget(null)
                void act(
                  target.id,
                  () => adminApi.warnUser(actorId, target.id, warnText),
                  'Warning sent',
                )
                setWarnText('')
              }}
            >
              Send warning
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this user?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-bark-light">
            {confirmDelete?.name} and all their listings will be permanently deleted. This cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!confirmDelete || busy === confirmDelete.id}
              onClick={() => {
                const target = confirmDelete!
                setConfirmDelete(null)
                void act(target.id, () => adminApi.deleteUser(actorId, target.id), 'User deleted')
              }}
            >
              Delete user
            </Button>
          </div>
        </div>
      </Modal>
    </TabShell>
  )
}

/* ---------------- Admins ---------------- */

function AdminsTab({ actorId }: { actorId: string }) {
  const toast = useToast()
  const {
    data: admins,
    error,
    loading,
    reload,
  } = useAdminData<User[]>(() => adminApi.listAdmins(actorId), [actorId])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null)

  const add = async () => {
    setBusy(true)
    try {
      await adminApi.addAdmin(actorId, email)
      toast.push({ tone: 'success', title: 'Admin added' })
      setEmail('')
      reload()
    } catch (e) {
      toast.push({ tone: 'danger', title: 'Could not add admin', body: toErrorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TabShell loading={loading} error={error}>
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <AdminInput
            aria-label="New admin email"
            type="email"
            required
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-56 flex-1"
          />
          <Button type="submit" disabled={busy || email.trim() === ''}>
            Add admin
          </Button>
        </form>
        <p className="text-xs text-bark-light">
          The person must already have a NeighborMart account with that email. The last remaining
          admin can never be removed.
        </p>
        <ul className="flex list-none flex-col gap-2">
          {(admins ?? []).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-3xl border border-bark/10 bg-surface p-3"
            >
              <Avatar name={a.name} src={a.avatarUrl} size="md" />
              <div className="flex-1">
                <p className="font-semibold text-bark">{a.name}</p>
                <p className="text-xs text-bark-light">{a.email ?? a.id}</p>
              </div>
              <Button
                size="sm"
                variant="danger"
                disabled={(admins ?? []).length <= 1}
                onClick={() => setConfirmRemove(a)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        title="Remove admin?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-bark-light">
            {confirmRemove?.name} will lose admin access immediately. Their account and listings
            stay.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = confirmRemove!
                setConfirmRemove(null)
                adminApi
                  .removeAdmin(actorId, target.id)
                  .then(() => {
                    toast.push({ tone: 'success', title: 'Admin removed' })
                    reload()
                  })
                  .catch((e) =>
                    toast.push({ tone: 'danger', title: 'Failed', body: toErrorMessage(e) }),
                  )
              }}
            >
              Remove admin
            </Button>
          </div>
        </div>
      </Modal>
    </TabShell>
  )
}

/* ---------------- Audit ---------------- */

function AuditTab({ actorId }: { actorId: string }) {
  const { data, error, loading } = useAdminData<{
    entries: AuditEntry[]
    users: User[]
  }>(async () => {
    const [entries, users] = await Promise.all([adminApi.listAudit(actorId), usersApi.getUsers()])
    return { entries, users }
  }, [actorId])
  return (
    <TabShell loading={loading} error={error}>
      {data && data.entries.length === 0 && (
        <EmptyState
          emoji="🗂️"
          title="No admin actions yet"
          message="Warn, suspend, feature — it will all show up here."
        />
      )}
      {data && data.entries.length > 0 && (
        <ul className="flex list-none flex-col gap-2">
          {data.entries.map((entry: AuditEntry) => (
            <li key={entry.id} className="rounded-3xl border border-bark/10 bg-surface p-3 text-sm">
              <span className="font-semibold text-bark">{entry.action}</span>{' '}
              <span className="text-bark-light">
                · {data.users.find((u) => u.id === entry.adminId)?.name ?? entry.adminId} ·{' '}
                {entry.targetType} {entry.targetId} · {new Date(entry.createdAt).toLocaleString()}
              </span>
              <p className="mt-0.5 text-bark-light">{entry.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </TabShell>
  )
}
