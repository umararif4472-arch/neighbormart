import { Link } from 'react-router-dom'
import { useApp } from '@/context/AppContext'
import { useTrustScore } from '@/hooks/useTrustScore'
import { Button } from '@/components/ui/Button'
import { TrustBadge, TrustMeter, TrustTierLadder } from '@/components/ui/Trust'
import { TRUST_WEIGHTS } from '@/utils/trustScore'
import { CheckIcon } from '@/components/icons'

/**
 * /trust — the "How Trust Scores Work" explainer.
 *
 * Every number on this page is rendered from TRUST_WEIGHTS and the same
 * pure calculator the app runs on — not marketing copy. Change the formula
 * in utils/trustScore.ts and this page changes with it.
 */

interface FactorRow {
  emoji: string
  name: string
  max: number
  how: string
  weight: number
}

export function TrustExplainerPage() {
  const { state } = useApp()
  const { score } = useTrustScore(state.currentUser?.id)

  const factors: FactorRow[] = [
    {
      emoji: '⏰',
      name: 'On-time return rate',
      max: TRUST_WEIGHTS.ON_TIME_MAX,
      weight: 30,
      how: `${TRUST_WEIGHTS.ON_TIME_MAX} × (on-time returns ÷ all your returns) × (returns ÷ ${TRUST_WEIGHTS.ON_TIME_VOLUME_FULL_AT}). The heart of the score — late returns lower your rate while the volume keeps climbing, so one late return visibly hurts. Fewer than ${TRUST_WEIGHTS.ON_TIME_VOLUME_FULL_AT} returns just means the volume weight is still growing.`,
    },
    {
      emoji: '⭐',
      name: 'Reviews from neighbors',
      max: TRUST_WEIGHTS.REVIEWS_MAX,
      weight: 25,
      how: `${TRUST_WEIGHTS.REVIEWS_MAX} × (reviews ÷ ${TRUST_WEIGHTS.REVIEWS_COUNTED_MAX}, capped) × (average rating ÷ 5). Both sides review after each deal — stars alone aren't enough, neighbors read your words.`,
    },
    {
      emoji: '🧾',
      name: 'Completed deals',
      max: TRUST_WEIGHTS.DEALS_MAX,
      weight: 15,
      how: `${TRUST_WEIGHTS.DEALS_MAX} × (completed deals ÷ ${TRUST_WEIGHTS.DEALS_FULL_AT}, capped). Every finished deal counts — a borrow returned, a lend completed, an item sold, a rental hosted — so sellers and renters build trust too, not just borrowers.`,
    },
    {
      emoji: '✅',
      name: 'Verified profile',
      max: TRUST_WEIGHTS.VERIFICATION_MAX,
      weight: 10,
      how: `Phone ${TRUST_WEIGHTS.PHONE_POINTS} pts, email ${TRUST_WEIGHTS.EMAIL_POINTS} pts, verified ID ${TRUST_WEIGHTS.ID_POINTS} pts. It's the basics of "we know how to reach you — and who you are."`,
    },
    {
      emoji: '🏠',
      name: 'Account age',
      max: TRUST_WEIGHTS.ACCOUNT_AGE_MAX,
      weight: 5,
      how: `About 1 pt every ${TRUST_WEIGHTS.ACCOUNT_AGE_DAYS_PER_POINT} days — full ${TRUST_WEIGHTS.ACCOUNT_AGE_MAX} pts at roughly two years on the block. Slowly earned, never bought.`,
    },
    {
      emoji: '💬',
      name: 'Responsiveness',
      max: TRUST_WEIGHTS.RESPONSIVENESS_MAX,
      weight: 15,
      how: `${TRUST_WEIGHTS.RESPONSIVENESS_MAX} × your response rate — the share of messages and requests you answer. People deal with neighbors who reply.`,
    },
  ]

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-3 text-center">
        <span aria-hidden className="text-5xl">
          🤝
        </span>
        <h1 className="font-display text-3xl font-extrabold text-bark sm:text-4xl">
          How trust scores work
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-bark-light sm:text-base">
          There&apos;s no payment processing here — reputation is the currency. Every score below is
          computed live from real behavior, and the same formula powers the badges you see next to
          every name on the block.
        </p>
      </header>

      {/* Your live score, computed by the actual formula */}
      {score && (
        <section
          aria-labelledby="your-score"
          className="flex flex-col gap-4 rounded-[2.5rem] border border-bark/10 bg-surface p-6 shadow-sm sm:p-8"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="your-score" className="font-display text-xl font-extrabold text-bark">
              Your score right now
            </h2>
            <TrustBadge tierName={score.tierName} size="md" />
          </div>
          <TrustMeter score={score} showBreakdown />
          <p className="text-xs leading-relaxed text-bark-light">
            These aren&apos;t static numbers — mark a return, leave a review, or simply reply to a
            neighbor, and the inputs above change and the score follows.
          </p>
        </section>
      )}

      {/* The actual formula, factor by factor */}
      <section aria-labelledby="the-formula" className="flex flex-col gap-4">
        <div>
          <h2 id="the-formula" className="font-display text-2xl font-extrabold text-bark">
            The formula, factor by factor
          </h2>
          <p className="mt-1 text-sm text-bark-light">
            Five factors, 100 points. No hidden weights — here is exactly how the app computes it.
          </p>
        </div>
        <ul className="flex list-none flex-col gap-3">
          {factors.map((factor) => (
            <li
              key={factor.name}
              className="flex flex-col gap-2 rounded-3xl border border-bark/10 bg-surface p-5 shadow-sm sm:flex-row sm:gap-4"
            >
              <div className="flex items-center gap-3 sm:w-56 sm:shrink-0">
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-2xl bg-terracotta-50 text-xl"
                >
                  {factor.emoji}
                </span>
                <div>
                  <p className="font-display text-sm font-bold text-bark">{factor.name}</p>
                  <p className="text-xs font-semibold text-terracotta-700">
                    up to {factor.max} pts
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-bark-light">{factor.how}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* On-time vs late — the visible difference */}
      <section
        aria-labelledby="late-demo"
        className="flex flex-col gap-4 rounded-[2.5rem] border border-terracotta-200 bg-terracotta-50/60 p-6 sm:p-8"
      >
        <h2 id="late-demo" className="font-display text-xl font-extrabold text-bark">
          On-time vs. late — the math isn&apos;t cosmetic
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-moss-300 bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-moss-800">
              <CheckIcon className="h-4 w-4" aria-hidden /> 8 returns, all on time
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-moss-800">
              40<span className="text-sm font-semibold text-bark-light">/40 pts</span>
            </p>
            <p className="mt-1 text-xs text-bark-light">rate 8/8 × volume 8/8 = full marks</p>
          </div>
          <div className="rounded-3xl border border-red-200 bg-surface p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-red-700">
              <span aria-hidden>⏳</span> 8 returns, 2 late
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-red-700">
              30<span className="text-sm font-semibold text-bark-light">/40 pts</span>
            </p>
            <p className="mt-1 text-xs text-bark-light">
              rate 6/8 × volume 8/8 — the same borrows, minus the punctuality
            </p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-bark-light">
          A late return can also drop you a tier instantly — tiers are just thresholds on the total
          (0–24 New Neighbor, 25–49 Reliable, 50–74 Trusted, 75–100 Community Pillar). Returning
          things when you said you would is the single best thing you can do here.
        </p>
      </section>

      {/* The ladder */}
      <section aria-labelledby="the-ladder" className="flex flex-col gap-4">
        <h2 id="the-ladder" className="font-display text-2xl font-extrabold text-bark">
          The ladder
        </h2>
        <TrustTierLadder />
      </section>

      {/* Reviews feed in — a note */}
      <section aria-labelledby="reviews-note" className="flex flex-col gap-2">
        <h2 id="reviews-note" className="font-display text-lg font-extrabold text-bark">
          One more thing about reviews
        </h2>
        <p className="text-sm leading-relaxed text-bark-light">
          After every completed borrow, both neighbors review each other — one review each, no
          second chances to retaliate or flatter. Only your {TRUST_WEIGHTS.REVIEWS_COUNTED_MAX} most
          recent count toward the score, and average rating matters as much as count: three
          thoughtful 5-star reviews beat ten rushed 3-stars.
        </p>
      </section>

      <div className="flex justify-center gap-3">
        <Link to="/browse">
          <Button variant="secondary">Back to browse</Button>
        </Link>
        {state.currentUser && (
          <Link to={`/profile/${state.currentUser.id}`}>
            <Button>See my profile</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
