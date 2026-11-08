import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react'
import type { AppNotification, BorrowRequest, Listing, Message, Review, User } from '@/types'
import { upsertById } from '@/utils/collections'
import {
  isApiError,
  isFirebaseConfigured,
  toErrorMessage,
  authApi,
  listingsApi,
  notificationsApi,
  requestsApi,
  reviewsApi,
  usersApi,
} from '@/services'

/**
 * Global app state (single source of truth for cross-feature data):
 * current user, users, listings, requests, reviews, notifications, and
 * per-request message threads. Trust scores are NEVER stored — they are
 * derived on demand from users + reviews via the pure calculator.
 */

// ---------------------------------------------------------------------------
// State & actions
// ---------------------------------------------------------------------------

interface HydrationPayload {
  /** Null in live mode when browsing as a guest (no session). */
  currentUser: User | null
  users: User[]
  listings: Listing[]
  requests: BorrowRequest[]
  reviews: Review[]
  notifications: AppNotification[]
}

interface AppState {
  hydration: { phase: 'loading' | 'ready' | 'error'; message: string | null }
  currentUser: User | null
  users: User[]
  listings: Listing[]
  requests: BorrowRequest[]
  reviews: Review[]
  notifications: AppNotification[]
  messagesByRequest: Record<string, Message[]>
}

type Action =
  | { type: 'HYDRATE_START' }
  | { type: 'HYDRATE_SUCCESS'; payload: HydrationPayload }
  | { type: 'HYDRATE_ERROR'; message: string }
  | { type: 'LISTINGS_SET'; listings: Listing[] }
  | { type: 'LISTINGS_UPSERTED'; listings: Listing[] }
  | { type: 'REQUESTS_UPSERTED'; requests: BorrowRequest[] }
  | { type: 'USERS_UPSERTED'; users: User[] }
  | { type: 'REVIEWS_APPENDED'; reviews: Review[] }
  | { type: 'NOTIFICATIONS_SET'; notifications: AppNotification[] }
  | { type: 'NOTIFICATIONS_APPENDED'; notifications: AppNotification[] }
  | { type: 'NOTIFICATION_READ'; id: string }
  | { type: 'MESSAGES_LOADED'; requestId: string; messages: Message[] }
  | { type: 'MESSAGE_APPENDED'; message: Message }

const initialState: AppState = {
  hydration: { phase: 'loading', message: null },
  currentUser: null,
  users: [],
  listings: [],
  requests: [],
  reviews: [],
  notifications: [],
  messagesByRequest: {},
}

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE_START':
      return { ...state, hydration: { phase: 'loading', message: null } }
    case 'HYDRATE_SUCCESS': {
      const { currentUser, ...rest } = action.payload
      return {
        ...state,
        hydration: { phase: 'ready', message: null },
        currentUser,
        ...rest,
      }
    }
    case 'HYDRATE_ERROR':
      return { ...state, hydration: { phase: 'error', message: action.message } }
    case 'LISTINGS_SET':
      return { ...state, listings: action.listings }
    case 'LISTINGS_UPSERTED':
      return { ...state, listings: upsertById(state.listings, action.listings) }
    case 'REQUESTS_UPSERTED':
      return { ...state, requests: upsertById(state.requests, action.requests) }
    case 'USERS_UPSERTED': {
      // Keep the session copy in sync when the signed-in user's own
      // profile changes (contact prefs, onboarding, …).
      const ownUpdate = state.currentUser
        ? action.users.find((u) => u.id === state.currentUser?.id)
        : undefined
      return {
        ...state,
        users: upsertById(state.users, action.users),
        currentUser: ownUpdate ?? state.currentUser,
      }
    }
    case 'REVIEWS_APPENDED':
      return { ...state, reviews: [...state.reviews, ...action.reviews] }
    case 'NOTIFICATIONS_SET':
      return { ...state, notifications: action.notifications }
    case 'NOTIFICATIONS_APPENDED':
      return { ...state, notifications: upsertById(state.notifications, action.notifications) }
    case 'NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, read: true } : n,
        ),
      }
    case 'MESSAGES_LOADED':
      return {
        ...state,
        messagesByRequest: { ...state.messagesByRequest, [action.requestId]: action.messages },
      }
    case 'MESSAGE_APPENDED': {
      const existing = state.messagesByRequest[action.message.requestId] ?? []
      return {
        ...state,
        messagesByRequest: {
          ...state.messagesByRequest,
          [action.message.requestId]: [...existing, action.message],
        },
      }
    }
    default: {
      // Exhaustiveness guard — TS errors if an action is unhandled.
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}

// ---------------------------------------------------------------------------
// Provider & hooks
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<Action>
  /** Re-run hydration (used by the error screen's retry button). */
  retryHydration: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const [attempt, setAttempt] = useState(0)
  const retryHydration = useMemo(() => () => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    dispatch({ type: 'HYDRATE_START' })

    void (async () => {
      try {
        const currentUser = await authApi.getSessionUser()
        const [users, listings, requests, reviews, notifications] = await Promise.all([
          usersApi.getUsers(),
          listingsApi.getListings(),
          requestsApi.getRequestsForUser(currentUser.id),
          reviewsApi.getReviews(),
          notificationsApi.getNotifications(currentUser.id),
        ])
        if (alive) {
          dispatch({
            type: 'HYDRATE_SUCCESS',
            payload: { currentUser, users, listings, requests, reviews, notifications },
          })
        }
      } catch (error) {
        // Live backend + no session = guest browsing: public data only,
        // no account-bound requests/notifications. Posting, messaging,
        // and the dashboard sit behind RequireAuth in this mode.
        if (isFirebaseConfigured && isApiError(error) && error.code === 'forbidden') {
          try {
            const [users, listings, reviews] = await Promise.all([
              usersApi.getUsers(),
              listingsApi.getListings(),
              reviewsApi.getReviews(),
            ])
            if (alive) {
              dispatch({
                type: 'HYDRATE_SUCCESS',
                payload: {
                  currentUser: null,
                  users,
                  listings,
                  requests: [],
                  reviews,
                  notifications: [],
                },
              })
            }
            return
          } catch {
            // Fall through to the error screen below.
          }
        }
        if (alive) {
          dispatch({ type: 'HYDRATE_ERROR', message: toErrorMessage(error) })
        }
      }
    })()

    return () => {
      alive = false
    }
  }, [attempt])

  // Live mode: a sign-in or sign-out anywhere re-runs hydration so the
  // whole app swaps between the guest view and the account view.
  useEffect(() => {
    if (!isFirebaseConfigured) return
    let lastUid: string | null | undefined
    const unsubscribe = authApi.onSessionChange((user) => {
      const uid = user?.id ?? null
      if (lastUid === undefined) {
        lastUid = uid
        return
      }
      if (uid !== lastUid) {
        lastUid = uid
        setAttempt((n) => n + 1)
      }
    })
    return unsubscribe
  }, [])

  const value = useMemo(() => ({ state, dispatch, retryHydration }), [state, retryHydration])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Access global app state + dispatch. Must be used inside <AppProvider>. */
export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an <AppProvider>')
  }
  return context
}
