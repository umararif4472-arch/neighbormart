import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useUsersByIds } from '@/hooks/useUsersByIds'
import { authApi, safetyApi, toErrorMessage, usersApi } from '@/services'
import { findById } from '@/utils/collections'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/Field'
import { ReportModal } from '@/components/safety/ReportModal'

/**
 * Safety actions on SOMEONE ELSE'S profile (Phase 8): report the user,
 * or block them (their listings disappear from your browse/landing).
 */
export function ProfileSafetyActions({ user }: { user: User }) {
  const { state, dispatch } = useApp()
  const me = state.currentUser
  const [reportOpen, setReportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!me || me.id === user.id) return null
  const blocked = (me.blockedUserIds ?? []).includes(user.id)

  async function toggleBlock() {
    if (!me) return
    setBusy(true)
    setError(null)
    try {
      const updated = await usersApi.setBlocked(me.id, me.id, user.id, !blocked)
      dispatch({ type: 'USERS_UPSERTED', users: [updated] })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-label="Safety actions"
      className="flex flex-col gap-2 rounded-3xl border border-bark/10 bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setReportOpen(true)}>
          🚩 Report user
        </Button>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => void toggleBlock()}>
          {blocked ? 'Unblock user' : '🚫 Block user'}
        </Button>
        {blocked && (
          <span className="text-xs font-semibold text-bark-light">
            Blocked — you won't see their listings.
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        actorId={me.id}
        targetType="user"
        targetId={user.id}
        targetLabel={user.name}
      />
    </section>
  )
}

/**
 * Your own account safety card (Phase 8): manage blocked users and the
 * danger-zone account deletion (typed confirmation, permanent).
 */
export function AccountSafetyCard({ user }: { user: User }) {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Blocked profiles are fetched scoped (they're not in global state).
  useUsersByIds(user.blockedUserIds ?? [])
  const blockedUsers = (user.blockedUserIds ?? [])
    .map((id) => findById(state.users, id))
    .filter((u): u is User => Boolean(u))

  async function unblock(targetId: string) {
    try {
      const updated = await usersApi.setBlocked(user.id, user.id, targetId, false)
      dispatch({ type: 'USERS_UPSERTED', users: [updated] })
    } catch {
      // Non-fatal in the UI; the list refreshes from context on success.
    }
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await safetyApi.deleteMyAccount(user.id)
      await authApi.signOut().catch(() => undefined)
      navigate('/')
    } catch (err) {
      setError(toErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby="account-safety"
      className="flex flex-col gap-4 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm"
    >
      <div>
        <h2 id="account-safety" className="font-display text-lg font-bold text-bark">
          Safety &amp; account
        </h2>
        <p className="text-sm text-bark-light">
          Blocked neighbors' listings never appear in your browse or home feed.
        </p>
      </div>

      {blockedUsers.length === 0 ? (
        <p className="text-sm text-bark-light">You haven't blocked anyone.</p>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {blockedUsers.map((blocked) => (
            <li
              key={blocked.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-bark/5 px-3 py-2"
            >
              <span className="text-sm font-semibold text-bark">{blocked.name}</span>
              <Button size="sm" variant="secondary" onClick={() => void unblock(blocked.id)}>
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-bark/10 pt-4">
        <h3 className="font-display text-base font-bold text-red-700 dark:text-red-300">
          Danger zone
        </h3>
        <p className="mt-1 text-sm text-bark-light">
          Deleting your account permanently removes your profile and all your listings. This cannot
          be undone.
        </p>
        <Button className="mt-3 bg-red-700 hover:bg-red-800" onClick={() => setDeleteOpen(true)}>
          Delete my account
        </Button>
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <form onSubmit={handleDelete} className="flex flex-col gap-4">
          <p className="text-sm text-bark-light">
            Your profile, listings, requests and messages will be removed. Type{' '}
            <strong className="text-bark">DELETE</strong> to confirm.
          </p>
          <TextField
            label="Type DELETE to confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Keep my account
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={confirmText !== 'DELETE'}
              className="bg-red-700 hover:bg-red-800"
            >
              Permanently delete
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
