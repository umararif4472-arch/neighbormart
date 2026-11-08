import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { toErrorMessage, usersApi } from '@/services'
import {
  LAHORE_AREAS,
  ONBOARDING_CITIES,
  ONBOARDING_INTERESTS,
  ONBOARDING_STEPS,
  draftFromUser,
  markOnboardingSkipped,
  validateOnboardingStep,
  type OnboardingDraft,
  type OnboardingErrors,
} from '@/utils/onboarding'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { cn } from '@/utils/cn'

/**
 * Onboarding (Phase 6) — the 3-step setup a new account completes right
 * after first sign-in:
 *   1. About you — confirm name, photo and phone (prefilled from the
 *      Google/email profile where available).
 *   2. Where you are — city + area, which power "near you".
 *   3. Your interests — chips that seed recommendations.
 * Validation is the shared pure logic in utils/onboarding (the services
 * re-run it on save). "Skip for now" is session-scoped: the user lands
 * where they were headed and is offered setup again next sign-in.
 */
export function OnboardingPage() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next') ?? '/dashboard'
  const user = state.currentUser

  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<OnboardingDraft | null>(null)
  const [errors, setErrors] = useState<OnboardingErrors>({})
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Prefill once the session user is known (state identity is stable here).
  const activeDraft = useMemo(() => {
    if (draft) return draft
    return user ? draftFromUser(user) : null
  }, [draft, user])

  if (!user) {
    return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />
  }
  if (!activeDraft) return null

  const set = (patch: Partial<OnboardingDraft>) => {
    const updated = { ...activeDraft, ...patch }
    setDraft(updated)
    if (showErrors) setErrors(validateOnboardingStep(stepIndex, updated))
  }

  const toggleInterest = (interest: string) => {
    const interests = activeDraft.interests.includes(interest)
      ? activeDraft.interests.filter((i) => i !== interest)
      : [...activeDraft.interests, interest]
    set({ interests })
  }

  const handleSkip = () => {
    markOnboardingSkipped()
    navigate(next, { replace: true })
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const stepErrors = validateOnboardingStep(stepIndex, activeDraft)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      setShowErrors(true)
      return
    }
    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setStepIndex(stepIndex + 1)
      setErrors({})
      setShowErrors(false)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await usersApi.completeOnboarding(user.id, user.id, activeDraft)
      dispatch({ type: 'USERS_UPSERTED', users: [updated] })
      navigate(next, { replace: true })
    } catch (err) {
      setSaveError(toErrorMessage(err))
      setSaving(false)
    }
  }

  const isLast = stepIndex === ONBOARDING_STEPS.length - 1

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-2xl font-extrabold text-bark">
          Let’s set up your profile
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-bark-light">
          Three quick steps so neighbors know who you are, where you are, and what you’re into.
        </p>
      </div>

      {/* Step progress */}
      <ol className="flex items-center gap-2" aria-label="Onboarding progress">
        {ONBOARDING_STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={i === stepIndex ? 'step' : undefined}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                i < stepIndex
                  ? 'bg-moss-600 text-white'
                  : i === stepIndex
                    ? 'bg-terracotta-600 text-white'
                    : 'bg-bark/10 text-bark-light',
              )}
            >
              {i < stepIndex ? '✓' : i + 1}
            </span>
            <span
              className={cn(
                'hidden text-sm font-semibold sm:block',
                i === stepIndex ? 'text-bark' : 'text-bark-light',
              )}
            >
              {label}
            </span>
            {i < ONBOARDING_STEPS.length - 1 && <span className="h-px flex-1 bg-bark/10" />}
          </li>
        ))}
      </ol>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="nm-fade-up flex flex-col gap-4 rounded-[2rem] border border-bark/10 bg-surface p-6 shadow-sm sm:p-8"
        key={stepIndex}
      >
        {stepIndex === 0 && (
          <>
            <div className="flex items-center gap-4">
              <Avatar
                name={activeDraft.name || user.name}
                src={activeDraft.avatarUrl || undefined}
                size="lg"
              />
              <p className="text-sm leading-relaxed text-bark-light">
                This is how neighbors will see you. Your photo comes from your account — paste a
                different image link if you’d like.
              </p>
            </div>
            <TextField
              label="Your name"
              required
              autoComplete="name"
              value={activeDraft.name}
              onChange={(e) => set({ name: e.target.value })}
              error={showErrors ? errors.name : undefined}
              placeholder="e.g. Ayesha Khan"
            />
            <TextField
              label="Photo link (optional)"
              type="url"
              value={activeDraft.avatarUrl}
              onChange={(e) => set({ avatarUrl: e.target.value })}
              placeholder="https://…"
            />
            <TextField
              label="Phone / WhatsApp (optional)"
              type="tel"
              autoComplete="tel"
              value={activeDraft.phone}
              onChange={(e) => set({ phone: e.target.value })}
              error={showErrors ? errors.phone : undefined}
              hint="Only shown on your listings if you turn that on later, in your profile."
              placeholder="+92 300 1234567"
            />
          </>
        )}

        {stepIndex === 1 && (
          <>
            <SelectField
              label="City"
              required
              value={activeDraft.city}
              onChange={(e) => set({ city: e.target.value })}
              error={showErrors ? errors.city : undefined}
            >
              <option value="">Pick your city…</option>
              {ONBOARDING_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Area / neighborhood"
              required
              value={activeDraft.neighborhood}
              onChange={(e) => set({ neighborhood: e.target.value })}
              error={showErrors ? errors.neighborhood : undefined}
              hint="Listings you post appear to neighbors around this area."
              placeholder="e.g. Gulberg"
              list="nm-area-suggestions"
            />
            <datalist id="nm-area-suggestions">
              {LAHORE_AREAS.map((area) => (
                <option key={area} value={area} />
              ))}
            </datalist>
          </>
        )}

        {stepIndex === 2 && (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-bark">
              What are you here for?{' '}
              <span aria-hidden className="text-terracotta-600 dark:text-terracotta-400">
                *
              </span>
            </legend>
            <p className="text-sm text-bark-light">
              Pick anything you’d borrow, rent, buy or book — we’ll surface more of it.
            </p>
            <div className="flex flex-wrap gap-2">
              {ONBOARDING_INTERESTS.map((interest) => {
                const selected = activeDraft.interests.includes(interest)
                return (
                  <button
                    key={interest}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      'cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-600',
                      selected
                        ? 'border-terracotta-600 bg-terracotta-600 text-white'
                        : 'border-bark/15 bg-surface text-bark hover:border-terracotta-300 dark:border-terracotta-800 hover:text-terracotta-700 dark:hover:text-terracotta-300',
                    )}
                  >
                    {selected ? '✓ ' : ''}
                    {interest}
                  </button>
                )
              })}
            </div>
            {showErrors && errors.interests && (
              <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
                {errors.interests}
              </p>
            )}
          </fieldset>
        )}

        {saveError && (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 dark:bg-red-950/60 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          >
            {saveError}
          </p>
        )}

        <div className="mt-2 flex items-center gap-3">
          {stepIndex > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStepIndex(stepIndex - 1)
                setErrors({})
                setShowErrors(false)
              }}
            >
              Back
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" loading={saving} disabled={saving}>
            {isLast ? 'Finish setup' : 'Continue'}
          </Button>
        </div>
      </form>

      <button
        type="button"
        onClick={handleSkip}
        className="mx-auto text-sm font-semibold text-bark-light underline-offset-2 hover:text-bark hover:underline"
      >
        Skip for now
      </button>
    </div>
  )
}
