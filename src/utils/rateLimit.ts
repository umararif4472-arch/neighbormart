/**
 * Fixed-window rate limiting (Phase 8), shared by the mock services
 * (in-memory) and mirrored by the live backend with a per-user counter
 * document + Firestore rules: max 10 new listings per 24 hours, max 30
 * messages per minute. The pure window math lives here so both sides
 * agree and it's unit-testable.
 */

export const LISTING_RATE_LIMIT = { limit: 10, windowMs: 24 * 60 * 60 * 1000 } as const
export const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 } as const

export interface WindowState {
  windowStart: string | null
  count: number
}

export interface WindowDecision extends WindowState {
  allowed: boolean
}

/**
 * Decide whether one more action fits the window at `nowIso`, and the
 * state to persist if it proceeds. An expired window resets.
 */
export function checkWindow(
  state: WindowState,
  nowIso: string,
  limit: number,
  windowMs: number,
): WindowDecision {
  const now = Date.parse(nowIso)
  const start = state.windowStart ? Date.parse(state.windowStart) : NaN
  if (Number.isNaN(start) || now - start >= windowMs) {
    return { allowed: true, windowStart: nowIso, count: 1 }
  }
  if (state.count >= limit) {
    return { allowed: false, windowStart: state.windowStart, count: state.count }
  }
  return { allowed: true, windowStart: state.windowStart, count: state.count + 1 }
}
