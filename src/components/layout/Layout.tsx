import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useDerivedNotifications } from '@/hooks/useDerivedNotifications'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { InstallPrompt } from './InstallPrompt'
import { authApi, isFirebaseConfigured } from '@/services'
import {
  BellIcon,
  HomeIcon,
  ChatIcon,
  PlusIcon,
  ListIcon,
  UserIcon,
  ChevronDownIcon,
  MenuIcon,
  XIcon,
} from '@/components/icons'
import { cn } from '@/utils/cn'
import { APP_NAME, APP_TAGLINE } from '@/config'
import symbolSimple from '@/assets/brand/logo-symbol-simple.svg'
import symbolDark from '@/assets/brand/logo-symbol-dark.svg'

/**
 * App shell: skip link, top navbar, main outlet, mobile bottom tab bar,
 * footer. Mobile-first — the tab bar is the primary navigation on phones.
 */

/**
 * The Open Door brand mark (brand kit SVGs, used verbatim). At this
 * 36px navbar size the kit rule applies — the simple symbol (no
 * welcome mat) — with the dark-plate version on dark backgrounds.
 * The wordmark text is set in Poppins Bold: "Neighbor" in ink,
 * "Mart" in terracotta (lightened on dark, per the kit wordmark).
 * The lockup never shrinks or wraps: it sits in a shrink-0 slot and
 * the wordmark is nowrap (below 420px the symbol alone carries the
 * brand, so the bar can never overflow on narrow phones).
 */
export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <img src={symbolSimple} alt="" aria-hidden className="h-9 w-9 shrink-0 dark:hidden" />
      <img src={symbolDark} alt="" aria-hidden className="hidden h-9 w-9 shrink-0 dark:block" />
      {!compact && (
        <span className="hidden whitespace-nowrap font-display text-[17px] font-bold tracking-tight text-bark min-[420px]:block">
          Neighbor<span className="text-wordmark-mart">Mart</span>
        </span>
      )}
    </span>
  )
}

const SECTION_LINKS = [
  { to: '/browse', label: 'Browse' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/properties', label: 'Properties' },
  { to: '/arenas', label: 'Arenas' },
] as const

function Navbar() {
  const { state } = useApp()
  // The bell counts actionable items DERIVED from request state — approving
  // or returning something anywhere updates it instantly.
  const { attentionCount } = useDerivedNotifications()
  const currentUser = state.currentUser
  const location = useLocation()
  const headerRef = useRef<HTMLElement>(null)
  const [openMenu, setOpenMenu] = useState<'more' | 'burger' | null>(null)

  const accountLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/messages', label: 'Messages' },
    ...(currentUser?.role === 'admin'
      ? [
          { to: '/moderation', label: 'Moderation' },
          { to: '/admin', label: 'Admin' },
        ]
      : []),
  ]
  const accountActive = accountLinks.some((l) => location.pathname.startsWith(l.to))

  // Menus close on navigation, on Escape, and on a pointer-down
  // anywhere outside the header.
  useEffect(() => {
    setOpenMenu(null)
  }, [location.pathname])
  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
      isActive
        ? 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-900 dark:text-terracotta-100'
        : 'text-bark-light hover:bg-bark/5 hover:text-bark',
    )

  const menuItemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'block whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
      isActive
        ? 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-900 dark:text-terracotta-100'
        : 'text-bark-light hover:bg-bark/5 hover:text-bark',
    )

  const ctaClass =
    'ml-1 inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-terracotta-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600'

  const signOut = () => void authApi.signOut()

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-bark/10 bg-cream/90 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-2.5 px-4 sm:px-6 xl:px-4">
        <Link
          to="/"
          aria-label={`${APP_NAME} — home`}
          className="shrink-0 focus-visible:outline-2 focus-visible:outline-terracotta-600"
        >
          <LogoMark />
        </Link>

        {/* Full row — xl and up: every link fits inline (measured:
            the admin row needs ~1230px; the widened 1320px container
            gives it room at ≥1280px viewports). */}
        <nav aria-label="Primary" className="ml-auto hidden shrink-0 items-center gap-0.5 xl:flex">
          {[...SECTION_LINKS, ...accountLinks].map((l) => (
            <NavLink key={l.to} to={l.to} className={navLinkClass}>
              {l.label}
            </NavLink>
          ))}
          <Link to="/list-item" className={ctaClass}>
            <PlusIcon className="h-4 w-4" />
            List an item
          </Link>
        </nav>

        {/* Compact row — lg to xl: the four sections stay inline, the
            account links move into the "More" dropdown. */}
        <nav
          aria-label="Primary"
          className="ml-auto hidden shrink-0 items-center gap-0.5 lg:flex xl:hidden"
        >
          {SECTION_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={navLinkClass}>
              {l.label}
            </NavLink>
          ))}
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'more'}
              onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
              className={cn(
                'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-600',
                openMenu === 'more' || accountActive
                  ? 'bg-terracotta-50 text-terracotta-700 dark:bg-terracotta-900 dark:text-terracotta-100'
                  : 'text-bark-light hover:bg-bark/5 hover:text-bark',
              )}
            >
              More
              <ChevronDownIcon
                className={cn('h-4 w-4 transition-transform', openMenu === 'more' && 'rotate-180')}
              />
            </button>
            {openMenu === 'more' && (
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-0 top-[calc(100%+10px)] z-40 w-56 rounded-2xl border border-bark/10 bg-surface p-1.5 shadow-xl"
              >
                {accountLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} className={menuItemClass} role="menuitem">
                    {l.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
          <Link to="/list-item" className={ctaClass}>
            <PlusIcon className="h-4 w-4" />
            List an item
          </Link>
        </nav>

        {/* Bell + avatar + theme (all sizes) */}
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
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
              onClick={signOut}
              className="hidden whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-semibold text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600 lg:block"
            >
              Sign out
            </button>
          )}
          {isFirebaseConfigured && !currentUser && (
            <Link
              to="/signin"
              className="hidden h-10 items-center whitespace-nowrap rounded-full bg-terracotta-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600 lg:inline-flex"
            >
              Sign in
            </Link>
          )}
          {/* Hamburger — below lg the whole nav lives in the panel. */}
          <button
            type="button"
            aria-label={openMenu === 'burger' ? 'Close menu' : 'Open menu'}
            aria-expanded={openMenu === 'burger'}
            aria-controls="header-nav-panel"
            onClick={() => setOpenMenu(openMenu === 'burger' ? null : 'burger')}
            className="rounded-full p-2.5 text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600 lg:hidden"
          >
            {openMenu === 'burger' ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Expanded panel — below lg: all links, the CTA, sign out. */}
      {openMenu === 'burger' && (
        <div id="header-nav-panel" className="border-t border-bark/10 lg:hidden">
          <nav
            aria-label="Primary (expanded)"
            className="mx-auto grid w-full max-w-[1320px] gap-1 px-4 py-3 sm:px-6"
          >
            {[...SECTION_LINKS, ...accountLinks].map((l) => (
              <NavLink key={l.to} to={l.to} className={menuItemClass}>
                {l.label}
              </NavLink>
            ))}
            <Link
              to="/list-item"
              className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-terracotta-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-terracotta-700 focus-visible:outline-2 focus-visible:outline-terracotta-600"
            >
              <PlusIcon className="h-4 w-4" />
              List an item
            </Link>
            {isFirebaseConfigured && currentUser && (
              <button
                type="button"
                onClick={signOut}
                className="mt-1 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-semibold text-bark-light transition-colors hover:bg-bark/5 hover:text-bark focus-visible:outline-2 focus-visible:outline-terracotta-600"
              >
                Sign out
              </button>
            )}
            {isFirebaseConfigured && !currentUser && (
              <NavLink to="/signin" className={menuItemClass}>
                Sign in
              </NavLink>
            )}
          </nav>
        </div>
      )}
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
        <p className="font-display text-sm font-semibold text-bark">{APP_TAGLINE}</p>
        <p className="text-xs text-bark-light">
          Your local marketplace for borrowing, renting, buying and selling — items, vehicles,
          properties and arenas, right on your street.
        </p>
        <nav
          aria-label="Legal and safety"
          className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-semibold"
        >
          <Link
            to="/terms"
            className="text-terracotta-700 underline-offset-2 hover:underline dark:text-terracotta-300"
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy"
            className="text-terracotta-700 underline-offset-2 hover:underline dark:text-terracotta-300"
          >
            Privacy Policy
          </Link>
          <Link
            to="/safety"
            className="text-terracotta-700 underline-offset-2 hover:underline dark:text-terracotta-300"
          >
            Stay safe &amp; avoid scams
          </Link>
        </nav>
        <p className="text-xs text-bark-light">
          Trust is earned: on-time returns, honest reviews, and showing up for your street.{' '}
          <Link
            to="/trust"
            className="font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-2 hover:underline"
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
  const { state } = useApp()
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only rounded-full bg-terracotta-600 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <Navbar />
      {state.currentUser?.suspended && (
        <div
          role="alert"
          className="border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 px-4 py-2.5 text-center text-sm font-medium text-red-800 dark:text-red-200"
        >
          Your account is suspended — you can browse, but posting listings, messaging and making
          requests are paused. Contact the {APP_NAME} team if you think this is a mistake.
        </div>
      )}
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
      <InstallPrompt />
    </div>
  )
}
