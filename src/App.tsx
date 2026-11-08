import { Routes, Route } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { AppHydrationError, AppSplash } from '@/components/layout/BootScreens'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LandingPage } from '@/features/landing/LandingPage'
import { BrowsePage } from '@/features/browse/BrowsePage'
import { ListingDetailPage } from '@/features/listing-detail/ListingDetailPage'
import { ListItemPage } from '@/features/list-item/ListItemPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MessagesPage } from '@/features/messages/MessagesPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { TrustExplainerPage } from '@/features/trust/TrustExplainerPage'
import { NotFoundPage } from '@/features/not-found/NotFoundPage'
import { SignInPage } from '@/features/auth/SignInPage'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { useTierWatcher } from '@/hooks/useTierWatcher'

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
  )
}
