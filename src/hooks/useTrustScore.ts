import { useMemo } from 'react'
import type { TrustScoreResult } from '@/types'
import { useApp } from '@/context/AppContext'
import {
  buildTrustHistory,
  calculateTrustScore,
  tierForScore,
  type TrustTier,
} from '@/utils/trustScore'

/**
 * Derive any user's trust score from context (users + reviews) using the
 * pure calculator. Never hardcoded, never stored — it recomputes whenever
 * reviews or stats change, which is what makes "return → trust update"
 * visible in the UI.
 */
export function useTrustScore(userId: string | undefined | null): {
  score: TrustScoreResult | null
  tier: TrustTier | null
} {
  const { state } = useApp()

  const user = useMemo(
    () => state.users.find((u) => u.id === userId) ?? null,
    [state.users, userId],
  )

  const reviewsReceived = useMemo(
    () => state.reviews.filter((r) => r.revieweeId === userId),
    [state.reviews, userId],
  )

  return useMemo(() => {
    if (!user) return { score: null, tier: null }
    const score = calculateTrustScore(buildTrustHistory(user, reviewsReceived))
    return { score, tier: tierForScore(score.total) }
  }, [user, reviewsReceived])
}
