import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppContext'

/**
 * Route guard (Phase 3). Browsing is public; posting, messaging, and the
 * dashboard require a session. In mock mode the demo session always
 * exists, so this never redirects there; in live (Firebase) mode a guest
 * is sent to /signin with a `next` param to return to afterwards.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useApp()
  const location = useLocation()

  if (!state.currentUser) {
    return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  return <>{children}</>
}
