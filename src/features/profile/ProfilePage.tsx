import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { User } from '@/types'
import { useApp } from '@/context/AppContext'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useTrustTiers } from '@/hooks/useTrustTiers'
import { usersApi, toErrorMessage } from '@/services'
import { findById } from '@/utils/collections'
import { formatMonthYear } from '@/utils/dates'
import { haversineKm } from '@/utils/distance'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { TextField } from '@/components/ui/Field'
import { TrustBadge, TrustMeter } from '@/components/ui/Trust'
import { ListingCard } from '@/components/listings/ListingCard'
import { ReviewsList } from '@/components/reviews/ReviewsList'
import { MapPinIcon } from '@/components/icons'

/**
 * /profile/:id — public neighbor profile: bio, trust score with a real
 * breakdown (pure calculator output, never stored), badges, their
 * listings, and reviews about them. Graceful for users with zero reviews,
 * zero badges, or zero listings.
 */
/**
 * Owner-only contact settings: your phone number plus the switch that
 * decides whether listing pages show Call / WhatsApp buttons. In-app
 * chat is always available regardless — this only adds direct contact.
 */
function ContactPrefsCard({ user }: { user: User }) {
  const { dispatch } = useApp()
  const [phone, setPhone] = useState(user.phone)
  const [showPhone, setShowPhone] = useState(user.showPhone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await usersApi.updateContactPrefs(user.id, user.id, { phone, showPhone })
      dispatch({ type: 'USERS_UPSERTED', users: [updated] })
      setSaved(true)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby="contact-prefs"
      className="flex flex-col gap-3 rounded-3xl border border-bark/10 bg-white p-5 shadow-sm"
    >
      <div>
        <h2 id="contact-prefs" className="font-display text-lg font-bold text-bark">
          Contact options
        </h2>
        <p className="mt-0.5 text-sm text-bark-light">
          Neighbors can always message you in the app. Turn this on only if you also want buyers and
          renters to reach you directly from your listings.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <TextField
          label="Phone / WhatsApp number"
          type="tel"
          placeholder="+92 300 1234567"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value)
            setSaved(false)
          }}
        />
        <label className="flex items-center gap-2 text-sm font-medium text-bark">
          <input
            type="checkbox"
            checked={showPhone}
            className="h-4 w-4 accent-terracotta-600"
            onChange={(e) => {
              setShowPhone(e.target.checked)
              setSaved(false)
            }}
          />
          Show Call / WhatsApp buttons on my listings
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={saving}>
            Save contact settings
          </Button>
          {saved && (
            <span role="status" className="text-sm font-semibold text-moss-700">
              Saved ✓
            </span>
          )}
        </div>
      </form>
    </section>
  )
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useApp()
  const user = findById(state.users, id)
  const { score } = useTrustScore(user?.id)
  const origin = state.currentUser?.homeLocation ?? null

  const userListings = useMemo(
    () => state.listings.filter((listing) => listing.ownerId === user?.id),
    [state.listings, user],
  )
  const ownerTiers = useTrustTiers(state.users)
  const reviewsAboutUser = useMemo(
    () =>
      user
        ? state.reviews
            .filter((r) => r.revieweeId === user.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [],
    [state.reviews, user],
  )
  // Reviews this user WROTE (as lender or borrower) — their full history.
  const reviewsByUser = useMemo(
    () =>
      user
        ? state.reviews
            .filter((r) => r.reviewerId === user.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [],
    [state.reviews, user],
  )
  const totalReturns = user ? user.stats.onTimeReturns + user.stats.lateReturns : 0
  const returnRate =
    user && totalReturns > 0 ? Math.round((user.stats.onTimeReturns / totalReturns) * 100) : null

  if (!user) {
    return (
      <EmptyState
        emoji="🧭"
        title="That neighbor moved away"
        message="We couldn't find this profile — the link may be out of date."
        action={
          <Link to="/browse">
            <Button variant="secondary">Back to browse</Button>
          </Link>
        }
        className="mx-auto max-w-lg"
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col items-center gap-4 rounded-[2.5rem] border border-bark/10 bg-white p-6 text-center shadow-sm sm:p-8">
        <Avatar name={user.name} src={user.avatarUrl} size="lg" />
        <div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-bark">{user.name}</h1>
            {score && <TrustBadge tierName={score.tierName} size="md" />}
          </div>
          <p className="mt-1 flex items-center justify-center gap-1 text-sm text-bark-light">
            <MapPinIcon className="h-4 w-4" aria-hidden />
            {user.neighborhood} · here since {formatMonthYear(user.joinedAt)}
          </p>
        </div>
        {user.bio && (
          <p className="max-w-xl text-sm leading-relaxed text-bark-light">
            &ldquo;{user.bio}&rdquo;
          </p>
        )}
        {score && (
          <div className="w-full max-w-md">
            <TrustMeter score={score} showBreakdown />
          </div>
        )}
        <dl className="flex flex-wrap justify-center gap-2 text-xs">
          <div className="rounded-2xl bg-bark/5 px-3 py-2">
            <dt className="font-semibold text-bark-light">Lends</dt>
            <dd className="font-display text-base font-bold text-bark">
              {user.stats.successfulLends}
            </dd>
          </div>
          <div className="rounded-2xl bg-bark/5 px-3 py-2">
            <dt className="font-semibold text-bark-light">Borrows</dt>
            <dd className="font-display text-base font-bold text-bark">
              {user.stats.successfulBorrows}
            </dd>
          </div>
          <div className="rounded-2xl bg-bark/5 px-3 py-2">
            <dt className="font-semibold text-bark-light">On-time rate</dt>
            <dd className="font-display text-base font-bold text-bark">
              {returnRate != null ? `${returnRate}%` : '—'}
            </dd>
          </div>
        </dl>
      </header>

      {/* Contact preferences — only on your own profile (Phase 5) */}
      {state.currentUser?.id === user.id && <ContactPrefsCard user={user} />}

      {/* Badges */}
      <section aria-labelledby="badges" className="flex flex-col gap-3">
        <h2 id="badges" className="font-display text-lg font-bold text-bark">
          Badges
        </h2>
        {user.badges.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-bark/15 bg-white/60 p-4 text-center text-sm text-bark-light">
            No badges yet — on-time returns and reviews earn them.
          </p>
        ) : (
          <ul className="flex list-none flex-wrap gap-2">
            {user.badges.map((badge) => (
              <li
                key={badge.id}
                title={badge.description}
                className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
              >
                <span aria-hidden>{badge.emoji}</span>
                {badge.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Their listings */}
      <section aria-labelledby="listings" className="flex flex-col gap-3">
        <h2 id="listings" className="font-display text-lg font-bold text-bark">
          Sharing{' '}
          <span className="text-sm font-medium text-bark-light">({userListings.length})</span>
        </h2>
        {userListings.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-bark/15 bg-white/60 p-4 text-center text-sm text-bark-light">
            Nothing listed right now.
          </p>
        ) : (
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userListings.map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  owner={user}
                  ownerTier={ownerTiers[user.id] ?? null}
                  distanceKm={origin ? haversineKm(origin, listing.location) : null}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviews about them */}
      <section aria-labelledby="reviews" className="flex flex-col gap-3">
        <h2 id="reviews" className="font-display text-lg font-bold text-bark">
          What neighbors say{' '}
          <span className="text-sm font-medium text-bark-light">({reviewsAboutUser.length})</span>
        </h2>
        <ReviewsList
          reviews={reviewsAboutUser}
          usersById={(reviewerId) => findById(state.users, reviewerId)}
          emptyTitle="No reviews yet"
          emptyMessage={`${user.name.split(' ')[0]} hasn't been reviewed yet — borrows and reviews build the picture.`}
        />
      </section>

      {/* Reviews they've written — full history as lender and borrower */}
      <section aria-labelledby="reviews-written" className="flex flex-col gap-3">
        <h2 id="reviews-written" className="font-display text-lg font-bold text-bark">
          Reviews by {user.name.split(' ')[0]}{' '}
          <span className="text-sm font-medium text-bark-light">({reviewsByUser.length})</span>
        </h2>
        {reviewsByUser.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-bark/15 bg-white/60 p-4 text-center text-sm text-bark-light">
            {user.name.split(' ')[0]} hasn&apos;t written any reviews yet.
          </p>
        ) : (
          <ReviewsList
            reviews={reviewsByUser}
            usersById={(revieweeId) => findById(state.users, revieweeId)}
            emptyTitle="No reviews written yet"
          />
        )}
      </section>
    </div>
  )
}
