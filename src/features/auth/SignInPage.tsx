import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { authApi, isFirebaseConfigured, toErrorMessage } from '@/services'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { LogoMark } from '@/components/layout/Layout'

/**
 * Sign-in (Phase 3) — functional, on-brand, deliberately simple. The
 * animated login experience (floating icons, logo reveal) is Phase 6
 * and replaces this page's presentation, not its logic.
 *
 * Google is the primary path; email/password is the fallback. In mock
 * mode every path resolves to the demo session (Maya) so the page is
 * still demonstrable without a Firebase project.
 */
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

  // Already signed in? Go where the user was headed.
  if (state.currentUser) {
    return <Navigate to={next} replace />
  }

  const finish = () => {
    // Kick hydration so the account view replaces the guest view, then go.
    retryHydration()
    navigate(next, { replace: true })
  }

  const handleGoogle = async () => {
    setBusy('google')
    setError(null)
    try {
      await authApi.signInWithGoogle()
      finish()
    } catch (err) {
      setError(toErrorMessage(err))
      setBusy(null)
    }
  }

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault()
    setBusy('email')
    setError(null)
    try {
      if (mode === 'signup') {
        await authApi.signUpWithEmail(name, email, password)
      } else {
        await authApi.signInWithEmail(email, password)
      }
      finish()
    } catch (err) {
      setError(toErrorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark />
        <h1 className="font-display text-2xl font-extrabold text-bark">
          {mode === 'signin' ? 'Welcome back' : 'Join NeighborMart'}
        </h1>
        <p className="text-sm leading-relaxed text-bark-light">
          Sign in to list things, message neighbors, and request borrows. Browsing stays open to
          everyone.
        </p>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        loading={busy === 'google'}
        disabled={busy !== null}
        onClick={() => void handleGoogle()}
      >
        <span aria-hidden className="font-display text-base font-bold text-terracotta-600">
          G
        </span>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs font-semibold text-bark-light">
        <span className="h-px flex-1 bg-bark/10" />
        or with email
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
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
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
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-bark-light">
        {mode === 'signin' ? (
          <>
            New to NeighborMart?{' '}
            <button
              type="button"
              className="font-semibold text-terracotta-700 underline-offset-2 hover:underline"
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
              className="font-semibold text-terracotta-700 underline-offset-2 hover:underline"
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
        <p className="rounded-2xl bg-moss-50 px-4 py-3 text-center text-xs leading-relaxed text-moss-800">
          Demo mode: this build runs on sample data, so any sign-in opens the demo account. Connect
          Firebase (see .env.example) for real accounts.
        </p>
      )}
    </div>
  )
}
