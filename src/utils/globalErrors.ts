/**
 * Global error reporting (Phase 8). Uncaught errors and unhandled
 * promise rejections anywhere in the app are funneled to one place:
 * logged to the console (and, in production, eligible for a future
 * Sentry hook marked below), plus a CustomEvent the Toast provider
 * listens to so the user sees "something went wrong" instead of a
 * silent failure. Per-route ErrorBoundary still handles render errors.
 */

export const GLOBAL_ERROR_EVENT = 'neighbormart:global-error'

let installed = false

function report(kind: string, error: unknown) {
  console.error(`[NeighborMart] ${kind}:`, error)
  // Sentry is deliberately NOT wired (Wave 2, F): it needs a new paid
  // account/DSN. Crash-free monitoring via Firebase Analytics is also
  // out of scope for the web build — Analytics (services/analytics.ts)
  // carries funnel events only, not error reporting — so uncaught
  // errors stay console-only here by decision, not by omission.
  window.dispatchEvent(
    new CustomEvent<string>(GLOBAL_ERROR_EVENT, {
      detail: 'Something went wrong — please try again.',
    }),
  )
}

export function installGlobalErrorHandlers() {
  if (installed) return
  installed = true
  window.addEventListener('error', (event) =>
    report('uncaught error', event.error ?? event.message),
  )
  window.addEventListener('unhandledrejection', (event) =>
    report('unhandled rejection', event.reason),
  )
}
