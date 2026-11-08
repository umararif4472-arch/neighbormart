import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useDerivedNotifications } from '@/hooks/useDerivedNotifications'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { authApi, isFirebaseConfigured } from '@/services'
import { BellIcon, HomeIcon, ChatIcon, PlusIcon, ListIcon, UserIcon } from '@/components/icons'
import { cn } from '@/utils/cn'

/**
 * App shell: skip link, top navbar, main outlet, mobile bottom tab bar,
 * footer. Mobile-first — the tab bar is the primary navigation on phones.
 */

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-2xl bg-terracotta-600 shadow-sm"
      >
        {/* Mini house mark matching the favicon */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#FBF7F0" aria-hidden>
          <path d="M12 4 3 11h2.5v8H10v-5h4v5h4.5v-8H21z" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-lg font-extrabold tracking-tight text-bark">
          Neighbor<span className="text-terracotta-600">Mart</span>
        </span>
      )}
    </span>
  )
}

function Navbar() {
  const { state } = useApp()
  // The bell counts actionable items DERIVED from request state — approving
  // or returning something anywhere updates it instantly.
  const { attentionCount } = useDerivedNotifications()
  const currentUser = state.currentUser

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-full px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
      isActive
        ? 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-900 dark:text-terracotta-100'
        : 'text-bark-light hover:bg-bark/5 hover:text-bark',
    )

  return (
    <header className="sticky top-0 z-30 border-b border-bark/10 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          to="/"
          aria-label="NeighborMart — home"
          className="focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <LogoMark />
        </Link>

        {/* Desktop links */}
        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          <NavLink to="/browse" className={navLinkClass}>
            Browse
          </NavLink>
          <NavLink to="/vehicles" className={navLinkClass}>
            Vehicles
          </NavLink>
          <NavLink to="/properties" className={navLinkClass}>
            Properties
          </NavLink>
          <NavLink to="/arenas" className={navLinkClass}>
            Arenas
          </NavLink>
          <NavLink to="/dashboard" className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/messages" className={navLinkClass}>
            Messages
          </NavLink>
          <Link
            to="/list-item"
            className="ml-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-terracotta-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
          >
            <PlusIcon className="h-4 w-4" />
            List an item
          </Link>
        </nav>

        {/* Bell + avatar (all sizes) */}
        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <ThemeToggle />
          <Link
            to="/dashboard"
            aria-label={`Notifications${attentionCount > 0 ? ` — ${attentionCount} need attention` : ''}`}
            className="relative rounded-full p-2.5 text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
          >
            <BellIcon className="h-5 w-5" />
            {attentionCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-terracotta-600 px-1 text-[11px] font-bold text-white">
                {attentionCount > 9 ? '9+' : attentionCount}
              </span>
            )}
          </Link>
          {currentUser && (
            <Link
              to={`/profile/${currentUser.id}`}
              aria-label="Your profile"
              className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-600"
            >
              <Avatar name={currentUser.name} src={currentUser.avatarUrl} size="sm" />
            </Link>
          )}
          {isFirebaseConfigured && currentUser && (
            <button
              type="button"
              onClick={() => void authApi.signOut()}
              className="rounded-full px-3 py-2 text-sm font-semibold text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
            >
              Sign out
            </button>
          )}
          {isFirebaseConfigured && !currentUser && (
            <Link
              to="/signin"
              className="inline-flex h-10 items-center rounded-full bg-terracotta-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function MobileTabBar() {
  const { state } = useApp()
  const profileId = state.currentUser?.id ?? (isFirebaseConfigured ? null : 'u-maya')
  const profileTarget = profileId ? `/profile/${profileId}` : '/signin'

  const tab = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
      isActive ? 'text-terracotta-700 dark:text-terracotta-300' : 'text-bark-light',
    )

  return (
    <nav
      aria-label="Primary (mobile)"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-bark/10 bg-cream/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 py-1.5">
        <NavLink to="/browse" className={tab}>
          <HomeIcon className="h-5 w-5" />
          Browse
        </NavLink>
        <NavLink to="/dashboard" className={tab}>
          <ListIcon className="h-5 w-5" />
          Requests
        </NavLink>
        {/* Center CTA — raised "list an item" button */}
        <Link
          to="/list-item"
          aria-label="List an item"
          className="-mt-6 flex justify-center focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-600 text-white shadow-lg shadow-terracotta-600/30 transition-transform active:scale-95">
            <PlusIcon className="h-6 w-6" />
          </span>
        </Link>
        <NavLink to="/messages" className={tab}>
          <ChatIcon className="h-5 w-5" />
          Messages
        </NavLink>
        <NavLink to={profileTarget} className={tab}>
          <UserIcon className="h-5 w-5" />
          Profile
        </NavLink>
      </div>
    </nav>
  )
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-bark/10 bg-parchment/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center sm:px-6">
        <LogoMark />
        <p className="text-xs text-bark-light">
          Your local marketplace for borrowing, renting, buying and selling — items, vehicles,
          properties and arenas, right on your street.
        </p>
        <p className="text-xs text-bark-light">
          Trust is earned: on-time returns, honest reviews, and showing up for your street.{' '}
          <Link
            to="/trust"
            className="font-semibold text-terracotta-700 underline-offset-2 hover:underline"
          >
            How it works
          </Link>
        </p>
      </div>
    </footer>
  )
}

export function Layout() {
  const location = useLocation()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-full bg-terracotta-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <Navbar />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10"
      >
        <div key={location.pathname} className="nm-page">
          <Outlet />
        </div>
      </main>
      <Footer />
      <MobileTabBar />
    </div>
  )
}
