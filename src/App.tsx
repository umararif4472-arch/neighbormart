import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { AppHydrationError, AppSplash } from '@/components/layout/BootScreens'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { useTierWatcher } from '@/hooks/useTierWatcher'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Route-level code splitting (Phase 7): every page is a lazy chunk, so
 * the first load ships the shell + landing only. Firebase rides along
 * with whichever chunk needs it and is split into its own vendor chunk
 * in vite.config.ts — together these removed the >500 kB bundle warning.
 */
const LandingPage = lazy(() =>
  import('@/features/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
)
const BrowsePage = lazy(() =>
  import('@/features/browse/BrowsePage').then((m) => ({ default: m.BrowsePage })),
)
const ListingDetailPage = lazy(() =>
  import('@/features/listing-detail/ListingDetailPage').then((m) => ({
    default: m.ListingDetailPage,
  })),
)
const ListItemPage = lazy(() =>
  import('@/features/list-item/ListItemPage').then((m) => ({ default: m.ListItemPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const MessagesPage = lazy(() =>
  import('@/features/messages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)
const TrustExplainerPage = lazy(() =>
  import('@/features/trust/TrustExplainerPage').then((m) => ({
    default: m.TrustExplainerPage,
  })),
)
const NotFoundPage = lazy(() =>
  import('@/features/not-found/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const SignInPage = lazy(() =>
  import('@/features/auth/SignInPage').then((m) => ({ default: m.SignInPage })),
)
const OnboardingPage = lazy(() =>
  import('@/features/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
)

/** Skeleton fallback while a route chunk downloads. */
function RouteFallback() {
  return (
    <div role="status" aria-label="Loading page" className="flex flex-col gap-4 py-2">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="aspect-[4/3] w-full" />
      </div>
    </div>
  )
}

/**
 * App routes. Hydration gates the shell: while global state loads (real
 * async delay from the mock services) we show the splash; failures show a
 * retry screen. Everything else lives in the Layout (navbar + tab bar +
 * footer) via nested routes.
 */
export default function App() {
  const { state, retryHydration } = useApp()
  const phase = state.hydration.phase

  // Visible tier-up/down moments fire from anywhere in the app.
  useTierWatcher()

  if (phase === 'loading') return <AppSplash />
  if (phase === 'error') {
    return (
      <AppHydrationError
        message={state.hydration.message ?? 'Unknown error'}
        onRetry={retryHydration}
      />
    )
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <ErrorBoundary>
                <LandingPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="browse"
            element={
              <ErrorBoundary>
                <BrowsePage />
              </ErrorBoundary>
            }
          />
          {/* Phase 5 section routes — same browse page, section-locked. */}
          <Route
            path="items"
            element={
              <ErrorBoundary>
                <BrowsePage routeSection="items" />
              </ErrorBoundary>
            }
          />
          <Route
            path="vehicles"
            element={
              <ErrorBoundary>
                <BrowsePage routeSection="vehicles" />
              </ErrorBoundary>
            }
          />
          <Route
            path="properties"
            element={
              <ErrorBoundary>
                <BrowsePage routeSection="properties" />
              </ErrorBoundary>
            }
          />
          <Route
            path="arenas"
            element={
              <ErrorBoundary>
                <BrowsePage routeSection="arenas" />
              </ErrorBoundary>
            }
          />
          <Route
            path="listing/:id"
            element={
              <ErrorBoundary>
                <ListingDetailPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="signin"
            element={
              <ErrorBoundary>
                <SignInPage />
              </ErrorBoundary>
            }
          />
          {/* Phase 6: first-login setup, reached from the sign-in flow. */}
          <Route
            path="welcome"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <OnboardingPage />
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="list-item"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <ListItemPage />
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="dashboard"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="messages"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <MessagesPage />
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="messages/:requestId"
            element={
              <ErrorBoundary>
                <RequireAuth>
                  <MessagesPage />
                </RequireAuth>
              </ErrorBoundary>
            }
          />
          <Route
            path="profile/:id"
            element={
              <ErrorBoundary>
                <ProfilePage />
              </ErrorBoundary>
            }
          />
          <Route
            path="trust"
            element={
              <ErrorBoundary>
                <TrustExplainerPage />
              </ErrorBoundary>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
