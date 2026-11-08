import { cn } from '@/utils/cn'
import type { TrustTierName, TrustScoreResult } from '@/types'
import { TRUST_TIERS, tierByName, tierForScore } from '@/utils/trustScore'

/**
 * Trust visuals — every tier color/emoji lives here so badges feel like
 * achievements and stay consistent everywhere a name appears.
 */

const TIER_STYLES: Record<TrustTierName, string> = {
  'New Neighbor':
    'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-300',
  Reliable:
    'bg-moss-100 dark:bg-moss-900/50 text-moss-800 dark:text-moss-200 border-moss-300 dark:border-moss-800',
  Trusted: 'bg-moss-600 text-white border-moss-700',
  'Community Pillar': 'bg-amber-400 text-amber-950 border-amber-500',
}

export interface TrustBadgeProps {
  tierName: TrustTierName
  /** Show the tier emoji. */
  withEmoji?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Compact tier chip shown next to every user name. */
export function TrustBadge({
  tierName,
  withEmoji = true,
  size = 'sm',
  className,
}: TrustBadgeProps) {
  const tier = tierByName(tierName)
  return (
    <span
      title={tier.description}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TIER_STYLES[tierName],
        className,
      )}
    >
      {withEmoji && (
        <span aria-hidden className="text-xs leading-none">
          {tier.emoji}
        </span>
      )}
      {tierName}
    </span>
  )
}

function tierBarColor(tierName: TrustTierName): string {
  switch (tierName) {
    case 'Community Pillar':
      return 'bg-amber-400'
    case 'Trusted':
      return 'bg-moss-600'
    case 'Reliable':
      return 'bg-moss-400'
    default:
      return 'bg-stone-400'
  }
}

export interface TrustMeterProps {
  score: TrustScoreResult
  /** Show the per-factor breakdown rows (profiles & explainer). */
  showBreakdown?: boolean
  className?: string
}

/** Score bar (+ optional breakdown) driven by the pure calculator output. */
export function TrustMeter({ score, showBreakdown = false, className }: TrustMeterProps) {
  const tier = tierForScore(score.total)

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-bark">Trust score</span>
        <span className="text-sm font-bold text-bark">
          {score.total}
          <span className="font-medium text-bark-light">/100</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={score.total}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Trust score ${score.total} of 100 — ${tier.name}`}
        className="h-2 overflow-hidden rounded-full bg-bark/10"
      >
        <div
          className={cn('h-full rounded-full transition-all duration-500', tierBarColor(tier.name))}
          style={{ width: `${score.total}%` }}
        />
      </div>
      {showBreakdown && (
        <dl className="mt-1 flex flex-col gap-1 text-xs">
          {[
            ['On-time returns', score.breakdown.onTimeReturns, 30],
            ['Reviews from neighbors', score.breakdown.reviews, 25],
            ['Completed deals', score.breakdown.completedDeals, 15],
            ['Verified profile', score.breakdown.verification, 10],
            ['Account age', score.breakdown.accountAge, 5],
            ['Responsiveness', score.breakdown.responsiveness, 15],
          ].map(([label, value, max]) => (
            <div key={label as string} className="flex items-center justify-between gap-3">
              <dt className="text-bark-light">{label}</dt>
              <dd className="font-medium text-bark">
                {value as number}/{max as number}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Full ladder for the trust explainer (landing + profile). */
export function TrustTierLadder({ className }: { className?: string }) {
  return (
    <ol className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {TRUST_TIERS.map((tier, index) => (
        <li
          key={tier.name}
          className="flex flex-col gap-1.5 rounded-3xl border border-bark/10 bg-surface p-4 shadow-sm"
        >
          <span className="text-sm font-bold text-bark-light">Tier {index + 1}</span>
          <TrustBadge tierName={tier.name} size="md" />
          <p className="text-xs leading-relaxed text-bark-light">{tier.description}</p>
          <p className="mt-auto text-xs font-semibold text-terracotta-700 dark:text-terracotta-300">
            {tier.minScore}
            {tier.minScore === 0 ? '+' : '–100'} points
          </p>
        </li>
      ))}
    </ol>
  )
}
