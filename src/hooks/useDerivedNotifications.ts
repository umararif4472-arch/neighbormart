import { useMemo } from 'react'
import { useApp } from '@/context/AppContext'
import { useNow } from './useNow'
import { buildNotificationFeed, type DerivedNotification } from '@/utils/derivedNotifications'

/**
 * The current user's notification feed: DERIVED from request state (plus
 * stored push notifications like messages), never a hardcoded list. Act on
 * a request anywhere in the app and this feed updates instantly.
 */
export function useDerivedNotifications() {
  const { state } = useApp()
  const now = useNow()
  const currentUser = state.currentUser

  return useMemo(() => {
    if (!currentUser) {
      return { feed: [] as DerivedNotification[], attentionCount: 0 }
    }
    return buildNotificationFeed({
      userId: currentUser.id,
      requests: state.requests,
      listings: state.listings,
      users: state.users,
      reviews: state.reviews,
      storedNotifications: state.notifications,
      now,
    })
  }, [
    currentUser,
    state.requests,
    state.listings,
    state.users,
    state.reviews,
    state.notifications,
    now,
  ])
}
