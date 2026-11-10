import { useEffect, useMemo, useState } from 'react'
import type { User } from '@/types'
import { useApp } from '@/context/AppContext'
import { usersApi } from '@/services'
import { findById } from '@/utils/collections'

/**
 * Scoped user loading (Workstream A): fetch ONLY the profiles for the
 * ids a screen actually shows (listing owners, reviewers, chat
 * counterparts…), through the service layer's per-session cache —
 * repeat renders and repeat screens cost no reads. Fetched users are
 * upserted into AppContext, so the returned lookup stays live when a
 * profile changes elsewhere.
 */
export function useUsersByIds(ids: readonly string[]) {
  const { state, dispatch } = useApp()
  const [loading, setLoading] = useState(false)

  const key = useMemo(() => [...new Set(ids.filter(Boolean))].sort().join(','), [ids])

  useEffect(() => {
    if (!key) return
    let alive = true
    setLoading(true)
    usersApi
      .getUsersByIds(key.split(','))
      .then((users) => {
        if (!alive) return
        if (users.length > 0) dispatch({ type: 'USERS_UPSERTED', users })
        setLoading(false)
      })
      .catch(() => {
        // A missing profile renders as "a neighbor" — never a crash.
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [key, dispatch])

  const users = useMemo(() => {
    if (!key) return [] as User[]
    return key
      .split(',')
      .map((id) => findById(state.users, id))
      .filter((u): u is User => u != null)
  }, [key, state.users])

  const usersById = useMemo(
    () => (id: string) => findById(state.users, id),
    [state.users],
  )

  return { users, usersById, loading }
}
