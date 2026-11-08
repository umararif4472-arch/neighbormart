import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useItems } from '@/hooks/useItems'
import { useTrustTiers } from '@/hooks/useTrustTiers'
import { findById } from '@/utils/collections'
import { haversineKm } from '@/utils/distance'
import { Button } from '@/components/ui/Button'
import { ItemCardSkeleton } from '@/components/ui/Skeleton'
import { ItemCard } from '@/components/items/ItemCard'
import { TrustTierLadder } from '@/components/ui/Trust'
import { cn } from '@/utils/cn'

const HOW_IT_WORKS = [
  {
    emoji: '🏷️',
    title: 'List',
    text: 'Snap a photo of the thing gathering dust — the drill, the tent, the karaoke machine — and set your borrow terms.',
  },
  {
    emoji: '🔎',
    title: 'Discover',
    text: 'Search what your neighbors own, filtered by walking distance. Cheaper than buying, friendlier than renting.',
  },
  {
    emoji: '🤝',
    title: 'Borrow',
    text: 'Send a request, agree on pickup, return it with a thank-you. Every on-time return builds your reputation.',
  },
] as const

/**
 * / — the pitch: why buy when a neighbor already owns one?
 * Live feed pulls real (mock-service) items so the page is alive on load.
 */
export function LandingPage() {
  const { state } = useApp()
  const { items, loading } = useItems()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null
  const ownerTiers = useTrustTiers(state.users)

  // "Fresh on the block" — the 3 newest listings, nearest-first ordering
  // is Browse's job; here we just show what's new.
  const freshItems = useMemo(
    () => [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3),
    [items],
  )

  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-moss-300 bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-800">
            <span aria-hidden>📍</span>
            {currentUser ? `${currentUser.neighborhood} & nearby` : 'Your neighborhood'}
            {items.length > 0 && ` · ${items.length} items shared`}
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-bark sm:text-5xl">
            Why buy it when your{' '}
            <span className="text-terracotta-600 underline decoration-terracotta-300 decoration-4 underline-offset-4">
              neighbor
            </span>{' '}
            already owns one?
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-bark-light sm:text-lg">
            NeighborMart is your neighborhood marketplace: tools, gear, vehicles, homes, and sports
            grounds from people nearby — borrow them free, rent them, or buy them outright. No
            strangers, just neighbors building trust.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/browse">
              <Button size="lg">Browse items near you</Button>
            </Link>
            <Link to="/list-item">
              <Button size="lg" variant="secondary">
                List something you own
              </Button>
            </Link>
          </div>
        </div>

        {/* Fanned photo collage from real listings */}
        <div aria-hidden className="relative hidden h-80 lg:block">
          {items.slice(0, 3).map((item, index) => {
            const photo = item.photos[0]
            const rotations = [-6, 3, -2]
            const offsets = ['left-4 top-6', 'left-40 top-16 z-10', 'left-20 top-40']
            return (
              <div
                key={item.id}
                className={cn(
                  'absolute h-44 w-56 overflow-hidden rounded-3xl border-4 border-white bg-white shadow-xl',
                  offsets[index],
                )}
                style={{ transform: `rotate(${rotations[index]}deg)` }}
              >
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-terracotta-50 to-moss-100 text-4xl">
                    🧰
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-it-works" className="flex flex-col gap-6">
        <div>
          <h2
            id="how-it-works"
            className="font-display text-2xl font-extrabold text-bark sm:text-3xl"
          >
            How it works
          </h2>
          <p className="mt-1 text-sm text-bark-light">
            Three steps between your garage and your neighbor&apos;s project.
          </p>
        </div>
        <ol className="grid list-none gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col gap-3 rounded-3xl border border-bark/10 bg-white p-6 shadow-sm"
            >
              <span className="absolute right-5 top-4 font-display text-3xl font-extrabold text-terracotta-100">
                {index + 1}
              </span>
              <span
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-50 text-2xl"
              >
                {step.emoji}
              </span>
              <h3 className="font-display text-lg font-bold text-bark">{step.title}</h3>
              <p className="text-sm leading-relaxed text-bark-light">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Live feed */}
      <section aria-labelledby="fresh-listings" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="fresh-listings"
              className="font-display text-2xl font-extrabold text-bark sm:text-3xl"
            >
              Fresh on the block
            </h2>
            <p className="mt-1 text-sm text-bark-light">
              Real items your neighbors are sharing right now.
            </p>
          </div>
          <Link
            to="/browse"
            className="text-sm font-semibold text-terracotta-700 underline-offset-4 hover:underline"
          >
            See all {items.length} items →
          </Link>
        </div>
        {loading ? (
          <div role="status" aria-label="Loading the latest listings">
            <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i}>
                  <ItemCardSkeleton />
                </li>
              ))}
            </ul>
          </div>
        ) : freshItems.length > 0 ? (
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {freshItems.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  owner={findById(state.users, item.ownerId)}
                  ownerTier={ownerTiers[item.ownerId] ?? null}
                  distanceKm={origin ? haversineKm(origin, item.location) : null}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl border border-dashed border-bark/15 bg-white/60 p-6 text-center text-sm text-bark-light">
            The block is quiet — nothing listed yet. Be the first!
          </p>
        )}
      </section>

      {/* Trust explainer teaser */}
      <section
        aria-labelledby="trust-explainer"
        className="rounded-[2.5rem] border border-moss-200 bg-moss-50 p-6 sm:p-10"
      >
        <div className="flex flex-col gap-6">
          <div>
            <h2
              id="trust-explainer"
              className="font-display text-2xl font-extrabold text-bark sm:text-3xl"
            >
              Trust is the currency
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bark-light sm:text-base">
              No payment processing, no deposits held hostage. Instead, every neighbor earns a trust
              score from on-time returns, honest reviews, a verified profile, and simply being
              responsive. Lend to the tiers you&apos;re comfortable with.
            </p>
          </div>
          <TrustTierLadder />
          <Link
            to="/trust"
            className="text-sm font-semibold text-moss-800 underline-offset-4 hover:underline"
          >
            See exactly how the score is calculated →
          </Link>
        </div>
      </section>

      {/* CTA band */}
      <section className="flex flex-col items-center gap-4 rounded-[2.5rem] bg-terracotta-600 p-8 text-center shadow-lg sm:p-12">
        <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
          Got a garage full of maybes?
        </h2>
        <p className="max-w-md text-sm text-terracotta-50 sm:text-base">
          That ladder you used once could fix someone&apos;s gutter this weekend. List it in two
          minutes — your neighbors will do the rest.
        </p>
        <Link to="/list-item">
          <Button size="lg" variant="secondary" className="border-terracotta-300">
            List something you own
          </Button>
        </Link>
      </section>
    </div>
  )
}
