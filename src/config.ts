/**
 * App-wide configuration read from environment variables (see
 * .env.example). Everything has a sane default so the app runs with no
 * .env file at all — the mock backend needs no configuration.
 */

/** Default currency for prices, ISO-style code. PKR unless overridden. */
export const DEFAULT_CURRENCY: string = import.meta.env.VITE_DEFAULT_CURRENCY ?? 'PKR'
