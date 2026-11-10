import { logEvent } from 'firebase/analytics'
import type { ListingSection } from '@/types'
import { getFirebaseAnalytics } from './firebase'

/**
 * Analytics funnel events (Wave 2, Workstream F — Firebase Analytics,
 * free tier). Typed, fire-and-forget helpers mirroring the Flutter
 * `core/observability.dart` event names exactly, so both platforms
 * land in the same funnel:
 *
 *   sign_in          — a sign-in completed successfully
 *   listing_created  — a listing was published
 *   request_created  — a borrow/rent/booking request was sent
 *
 * Every helper no-ops when Analytics is unavailable (mock mode, no
 * measurement id, unsupported browser) and swallows its own errors —
 * analytics must never break the flow it measures.
 */
function log(name: string, params?: Record<string, string>): void {
  void (async () => {
    try {
      const analytics = await getFirebaseAnalytics()
      if (analytics) logEvent(analytics, name, params)
    } catch {
      // Best-effort only.
    }
  })()
}

/** A sign-in completed successfully. [method]: 'google' | 'email'. */
export function logSignIn(method: 'google' | 'email'): void {
  log('sign_in', { method })
}

/** A listing was published in [section]. */
export function logListingCreated(section: ListingSection): void {
  log('listing_created', { section })
}

/** A request was sent for a listing in [section]. */
export function logRequestCreated(section: ListingSection): void {
  log('request_created', { section })
}
