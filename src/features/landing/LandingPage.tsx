import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useListings } from '@/hooks/useListings'
import { LISTING_SECTIONS } from '@/types'
import { SECTION_META } from '@/utils/categoryMeta'
import { useTrustTiers } from '@/hooks/useTrustTiers'
import { findById } from '@/utils/collections'
import { haversineKm } from '@/utils/distance'
import { Button } from '@/components/ui/Button'
import { ItemCardSkeleton } from '@/components/ui/Skeleton'
import { ListingCard } from '@/components/listings/ListingCard'
import { TrustTierLadder } from '@/components/ui/Trust'
import { cn } from '@/utils/cn'
import { sectionAccent } from '@/utils/sectionAccent'

const HOW_IT_WORKS = [
  {
    emoji: '📸',
    title: 'Post',
    text: 'Snap a few photos, set your price or borrow terms, and publish — a drill, a car, a spare room, even a cricket pitch by the hour.',
  },
  {
    emoji: '💬',
    title: 'Connect',
    text: 'Neighbors send a request or an offer, you chat, check their trust score, and agree on pickup, dates, or a booking slot.',
  },
  {
    emoji: '🤝',
    title: 'Deal',
    text: 'Meet, hand over, and mark it done. Reviews and on-time returns grow both trust scores for the next deal.',
  },
] as const

const FAQS = [
  {
    q: 'How do payments work?',
    a: 'NeighborMart does not process payments in this release. You and your neighbor agree on the deal in chat and settle directly — cash on pickup is most common. Prices, deposits and fees are always shown up front on the listing.',
  },
  {
    q: 'What can I list?',
    a: 'Four sections: Items & Tools (borrow, rent, sell), Vehicles (rent by hour/day/week/month, or sell), Properties (rent or sell), and Sports Arenas & Venues (booked by the hour or day). If a neighbor nearby could use it, it belongs here.',
  },
  {
    q: 'What is the trust score?',
    a: 'A 0–100 score from on-time returns, completed deals, reviews, profile verification and responsiveness. It helps neighbors decide who to deal with — and it grows with every good deal you complete.',
  },
  {
    q: 'Is it free to use?',
    a: 'Yes — listing, borrowing, renting, buying and selling on NeighborMart is free. Borrowing is always free by definition; rentals and sales are priced by the owner.',
  },
  {
    q: 'How do arena bookings work?',
    a: 'Arenas show a day strip and time slots. Pick your day, choose one or more back-to-back slots, and send the booking — the owner approves it and the slots are blocked for everyone else.',
  },
] as const

/**
 * / — the pitch: why buy when a neighbor already owns one?
 * Section tiles route into browse; the live feed pulls real
 * (mock-service) listings from every section so the page is alive.
 */
export function LandingPage() {
  const { state } = useApp()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const { listings, loading } = useListings()
  const currentUser = state.currentUser
  const origin = currentUser?.homeLocation ?? null
  const ownerTiers = useTrustTiers(state.users)

  // "Fresh on the block" — the 3 newest listings across all sections;
  // nearest-first ordering is Browse's job, here we just show what's new.
  const freshListings = useMemo(
    () =>
      [...listings].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3),
    [listings],
  )
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of listings) counts.set(l.section, (counts.get(l.section) ?? 0) + 1)
    return counts
  }, [listings])

  // "Featured" — the most-viewed active listings (Phase 5): social proof
  // up top, straight from the real view counters.
  const featuredListings = useMemo(
    () =>
      listings
        .filter((l) => l.status === 'active')
        .sort((a, b) => b.views - a.views)
        .slice(0, 3),
    [listings],
  )

  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-moss-300 bg-moss-50 px-3 py-1 text-xs font-semibold text-moss-800">
            <span aria-hidden>📍</span>
            {currentUser ? `${currentUser.neighborhood} & nearby` : 'Your neighborhood'}
            {listings.length > 0 && ` · ${listings.length} listings near you`}
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
          <form
            role="search"
            aria-label="Search listings"
            className="flex max-w-xl items-center gap-2 rounded-full border border-bark/15 bg-surface p-1.5 shadow-sm transition-shadow focus-within:shadow-md"
            onSubmit={(e) => {
              e.preventDefault()
              const q = searchQuery.trim()
              navigate(q ? `/browse?q=${encodeURIComponent(q)}` : '/browse')
            }}
          >
            <span aria-hidden className="pl-2.5 text-lg">
              🔎
            </span>
            <label htmlFor="hero-search" className="sr-only">
              Search tools, cars, homes, arenas…
            </label>
            <input
              id="hero-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Try “drill”, “Corolla”, “padel”…"
              className="min-w-0 flex-1 bg-transparent text-sm text-bark outline-none placeholder:text-bark-light"
            />
            <Button type="submit" size="md" className="shrink-0 rounded-full">
              Search
            </Button>
          </form>
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
          {listings.slice(0, 3).map((item, index) => {
            const photo = item.photos[0]
            const rotations = [-6, 3, -2]
            const offsets = ['left-4 top-6', 'left-40 top-16 z-10', 'left-20 top-40']
            return (
              <div
                key={item.id}
                className={cn(
                  'absolute h-44 w-56 overflow-hidden rounded-3xl border-4 border-white bg-surface shadow-xl',
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

      {/* Section entry tiles — the four marketplace sections */}
      <section aria-labelledby="sections" className="flex flex-col gap-6">
        <div>
          <h2 id="sections" className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
            Four sections, one neighborhood
          </h2>
          <p className="mt-1 text-sm text-bark-light">
            Borrow, rent, buy, or sell — pick a section and start exploring.
          </p>
        </div>
        <ul className="grid list-none grid-cols-2 gap-4 lg:grid-cols-4">
          {LISTING_SECTIONS.map((section) => {
            const accent = sectionAccent(section)
            return (
              <li key={section}>
                <Link
                  to={section === 'items' ? '/browse' : `/${section}`}
                  className="group flex h-full flex-col gap-2 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-terracotta-600"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-transform group-hover:scale-110',
                      accent.chip,
                    )}
                  >
                    {SECTION_META[section].emoji}
                  </span>
                  <span className="font-display text-base font-bold text-bark">
                    {SECTION_META[section].label}
                  </span>
                  <span className="text-xs leading-relaxed text-bark-light">
                    {SECTION_META[section].blurb}
                  </span>
                  <span className={cn('mt-auto pt-1 text-xs font-semibold', accent.text)}>
                    {sectionCounts.get(section) ?? 0} listings →
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
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
            Post it, connect with a neighbor, close the deal — for every section.
          </p>
        </div>
        <ol className="grid list-none gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className="relative flex flex-col gap-3 rounded-3xl border border-bark/10 bg-surface p-6 shadow-sm"
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

      {/* Featured — most-viewed active listings */}
      {!loading && featuredListings.length > 0 && (
        <section aria-labelledby="featured-listings" className="flex flex-col gap-6">
          <div>
            <h2
              id="featured-listings"
              className="font-display text-2xl font-extrabold text-bark sm:text-3xl"
            >
              Featured near you
            </h2>
            <p className="mt-1 text-sm text-bark-light">
              The listings everyone keeps opening — most viewed this season.
            </p>
          </div>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredListings.map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  owner={findById(state.users, listing.ownerId)}
                  ownerTier={ownerTiers[listing.ownerId] ?? null}
                  distanceKm={origin ? haversineKm(origin, listing.location) : null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

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
              Real listings your neighbors have posted right now.
            </p>
          </div>
          <Link
            to="/browse"
            className="text-sm font-semibold text-terracotta-700 underline-offset-4 hover:underline"
          >
            See all items →
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
        ) : freshListings.length > 0 ? (
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {freshListings.map((listing) => (
              <li key={listing.id}>
                <ListingCard
                  listing={listing}
                  owner={findById(state.users, listing.ownerId)}
                  ownerTier={ownerTiers[listing.ownerId] ?? null}
                  distanceKm={origin ? haversineKm(origin, listing.location) : null}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl border border-dashed border-bark/15 bg-surface/60 p-6 text-center text-sm text-bark-light">
            The block is quiet — nothing listed yet. Be the first!
          </p>
        )}
      </section>

      {/* Trust explainer teaser */}
      <section
        aria-labelledby="trust-explainer"
        className="rounded-[2.5rem] border border-moss-200 bg-moss-50 p-6 dark:border-moss-800 dark:bg-moss-900/40 sm:p-10"
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
              score from on-time returns, completed deals, honest reviews, a verified profile, and
              simply being responsive. Deal with the tiers you&apos;re comfortable with.
            </p>
          </div>
          <TrustTierLadder />
          <Link
            to="/trust"
            className="text-sm font-semibold text-moss-800 underline-offset-4 hover:underline dark:text-moss-200"
          >
            See exactly how the score is calculated →
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="flex flex-col gap-6">
        <div>
          <h2 id="faq" className="font-display text-2xl font-extrabold text-bark sm:text-3xl">
            Questions, answered
          </h2>
          <p className="mt-1 text-sm text-bark-light">The things every new neighbor asks first.</p>
        </div>
        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => {
            const open = openFaq === i
            return (
              <div
                key={faq.q}
                className="overflow-hidden rounded-3xl border border-bark/10 bg-surface shadow-sm"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpenFaq(open ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-display text-base font-bold text-bark transition-colors hover:bg-bark/5 focus-visible:outline-2 focus-visible:outline-terracotta-600"
                >
                  {faq.q}
                  <span
                    aria-hidden
                    className={cn('text-terracotta-600 transition-transform', open && 'rotate-180')}
                  >
                    ▾
                  </span>
                </button>
                <div
                  id={`faq-panel-${i}`}
                  hidden={!open}
                  className="px-5 pb-5 text-sm leading-relaxed text-bark-light"
                >
                  {faq.a}
                </div>
              </div>
            )
          })}
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
