import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { authApi, isFirebaseConfigured, toErrorMessage } from '@/services'
import { logSignIn } from '@/services/analytics'
import type { User } from '@/types'
import { needsOnboarding, onboardingSkippedThisSession } from '@/utils/onboarding'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'
import { APP_NAME } from '@/config'
import { cn } from '@/utils/cn'
import logoSymbol from '@/assets/brand/logo-symbol.svg'

/**
 * Sign-in (Phase 6, Open Door brand pass) — the animated login
 * experience: a warm drifting mesh hero (charcoal in dark mode) with
 * floating section icons tinted in the kit's section accents, the
 * door logo popping in, and the brand tagline revealing line by line
 * over a calm veil; the sign-in card slides up on the right, shakes
 * on a failed attempt, and the page fades out on success. All motion
 * is CSS (index.css, nm-*), pauses when the tab is hidden, and honors
 * prefers-reduced-motion.
 *
 * Google is the primary path — a big, official-style button with
 * default / hover / loading / disabled states. Email/password is the
 * secondary path. Auth logic is unchanged from Phase 3; errors arrive
 * pre-friendly from the live auth service (toErrorMessage passes them
 * through). After sign-in, a profile that still needs onboarding is
 * routed through the 3-step setup before its destination.
 */

const FLOATING_ICONS: Array<{
  emoji: string
  label: string
  className: string
  delay: string
  tilt: string
  /** Brand accent tint (exact kit hexes, graphical use). */
  tint: string
  /** Drift duration — varied per icon for a parallax feel. */
  duration: string
}> = [
  {
    emoji: '🧰',
    label: 'Items & Tools',
    className: 'left-[8%] top-[16%]',
    delay: '0s',
    tilt: '-6deg',
    tint: 'bg-brand-items/25',
    duration: '6.5s',
  },
  {
    emoji: '🚗',
    label: 'Vehicles',
    className: 'right-[10%] top-[22%]',
    delay: '0.8s',
    tilt: '5deg',
    tint: 'bg-brand-vehicles/25',
    duration: '5.2s',
  },
  {
    emoji: '🏠',
    label: 'Properties',
    className: 'left-[14%] bottom-[20%]',
    delay: '1.6s',
    tilt: '4deg',
    tint: 'bg-brand-properties/25',
    duration: '7.4s',
  },
  {
    emoji: '🏟️',
    label: 'Sports Arenas',
    className: 'right-[14%] bottom-[26%]',
    delay: '0.4s',
    tilt: '-5deg',
    tint: 'bg-brand-arenas/25',
    duration: '5.9s',
  },
  {
    emoji: '💬',
    label: 'Neighbor chat',
    className: 'left-[42%] top-[10%]',
    delay: '2.1s',
    tilt: '3deg',
    tint: 'bg-brand-amber/25',
    duration: '6.8s',
  },
]

/** Google's official multicolor "G" mark. */
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden focusable="false">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34.3 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  )
}

export function SignInPage() {
  const { state, retryHydration } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Card shake on a failed attempt (re-triggered per failure). */
  const [shaking, setShaking] = useState(false)
  /** Success exit: the page fades/slides out before navigating. */
  const [leaving, setLeaving] = useState(false)
  /** Background motion pauses while the tab is hidden. */
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /** Where a freshly signed-in user goes: onboarding first, if needed. */
  const destinationFor = (user: User) =>
    needsOnboarding(user) && !onboardingSkippedThisSession()
      ? `/welcome?next=${encodeURIComponent(next)}`
      : next

  // Already signed in? Go where the user was headed (via onboarding if due).
  if (state.currentUser) {
    return <Navigate to={destinationFor(state.currentUser)} replace />
  }

  const finish = (user: User) => {
    // Smooth exit: fade/slide the page out, then swap to the account
    // view (hydration re-run) and navigate to the destination.
    setLeaving(true)
    window.setTimeout(() => {
      retryHydration()
      navigate(destinationFor(user), { replace: true })
    }, 280)
  }

  const fail = (err: unknown) => {
    // Errors arrive pre-friendly from the auth service — never raw codes.
    setError(toErrorMessage(err))
    setBusy(null)
    setShaking(true)
  }

  const handleGoogle = async () => {
    setBusy('google')
    setError(null)
    try {
      const user = await authApi.signInWithGoogle()
      logSignIn('google')
      finish(user)
    } catch (err) {
      fail(err)
    }
  }

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('email')
    setError(null)
    try {
      const user =
        mode === 'signup'
          ? await authApi.signUpWithEmail(name, email, password)
          : await authApi.signInWithEmail(email, password)
      if (mode !== 'signup') logSignIn('email')
      finish(user)
    } catch (err) {
      fail(err)
    }
  }

  return (
    <div
      className={cn(
        'grid gap-6 py-4 transition-all duration-300 lg:grid-cols-[1.05fr_1fr] lg:gap-10',
        leaving && 'translate-y-2 opacity-0',
      )}
    >
      {/* Animated hero — decorative on small screens it becomes a banner. */}
      <section
        aria-hidden
        className={cn(
          'nm-mesh relative overflow-hidden rounded-[2rem] px-6 py-10 text-brand-cream shadow-sm sm:px-10 lg:min-h-[560px] lg:py-14',
          paused && 'nm-paused',
        )}
      >
        {/* Calm veil: keeps hero text at WCAG AA over the brightest
            part of the drifting mesh, in both themes. */}
        <div className="absolute inset-0 bg-terracotta-950/20 dark:bg-black/30" />
        {FLOATING_ICONS.map((icon) => (
          <span
            key={icon.label}
            title={icon.label}
            className={`nm-float absolute hidden h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-lg backdrop-blur-sm sm:flex ${icon.tint} ${icon.className}`}
            style={{
              animationDelay: icon.delay,
              animationDuration: icon.duration,
              ['--nm-tilt' as string]: icon.tilt,
            }}
          >
            {icon.emoji}
          </span>
        ))}
        <div className="relative flex h-full flex-col items-start justify-center gap-5">
          <img
            src={logoSymbol}
            alt=""
            className="nm-logo-pop h-16 w-16 shadow-lg"
            width={64}
            height={64}
          />
          <p className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            <span className="nm-fade-up block" style={{ animationDelay: '0.15s' }}>
              Everything
            </span>
            <span className="nm-fade-up block" style={{ animationDelay: '0.3s' }}>
              behind the door
            </span>
          </p>
          <p
            className="nm-fade-up max-w-sm text-sm leading-relaxed text-brand-cream/85"
            style={{ animationDelay: '0.45s' }}
          >
            Tools, cars, homes and sports arenas from neighbors you can trust — with real reviews,
            verified profiles and chat built in.
          </p>
          <ul
            className="nm-fade-up flex flex-wrap gap-2 text-xs font-semibold"
            style={{ animationDelay: '0.6s' }}
          >
            {['🧰 Items & Tools', '🚗 Vehicles', '🏠 Properties', '🏟️ Arenas'].map((chip) => (
              <li key={chip} className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sign-in card */}
      <section
        className={cn(
          'nm-fade-up flex flex-col justify-center gap-5 rounded-[2rem] border border-bark/10 bg-surface p-6 shadow-sm sm:p-8',
          shaking && 'nm-shake',
        )}
        style={{ animationDelay: '0.2s' }}
        onAnimationEnd={() => setShaking(false)}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-2xl font-bold text-bark">
            {mode === 'signin' ? 'Welcome back' : `Join ${APP_NAME}`}
          </h1>
          <p className="text-sm leading-relaxed text-bark-light">
            Sign in to list things, message neighbors, and book deals. Browsing stays open to
            everyone.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleGoogle()}
          disabled={busy !== null}
          aria-busy={busy === 'google' || undefined}
          className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-3 rounded-full border border-bark/20 bg-white px-6 text-base font-semibold text-[#3c4043] shadow-sm transition hover:border-bark/35 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-600 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
        >
          {busy === 'google' ? <Spinner size="sm" /> : <GoogleGlyph />}
          {busy === 'google' ? 'Signing in with Google...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 text-xs font-semibold text-bark-light">
          <span className="h-px flex-1 bg-bark/10" />
          or
          <span className="h-px flex-1 bg-bark/10" />
        </div>

        <form onSubmit={(e) => void handleEmail(e)} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <TextField
              label="Your name"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ayesha Khan"
            />
          )}
          <TextField
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            type="password"
            required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
          />

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={busy === 'email'}
            disabled={busy !== null}
          >
            {mode === 'signin' ? 'Sign in with email' : 'Create account'}
          </Button>
        </form>

        <p className="text-center text-sm text-bark-light">
          {mode === 'signin' ? (
            <>
              New to {APP_NAME}?{' '}
              <button
                type="button"
                className="font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode('signup')
                  setError(null)
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-terracotta-700 dark:text-terracotta-300 underline-offset-2 hover:underline"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        {!isFirebaseConfigured && (
          <p className="rounded-2xl bg-moss-50 dark:bg-moss-900/50 px-4 py-3 text-center text-xs leading-relaxed text-moss-800 dark:text-moss-200">
            Demo mode: this build runs on sample data, so any sign-in opens the demo account.
            Connect Firebase (see .env.example) for real accounts.
          </p>
        )}
      </section>
    </div>
  )
}
