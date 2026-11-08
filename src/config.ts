/**
 * App-wide configuration read from environment variables (see
 * .env.example). Everything has a sane default so the app runs with no
 * .env file at all — the mock backend needs no configuration.
 */

/**
 * Default currency for prices, ISO-style code. PKR unless overridden.
 * Read defensively: the seed script imports this module under plain
 * Node (tsx), where `import.meta.env` does not exist — there the
 * default applies. Under Vite the literal access below is replaced
 * statically, exactly as before.
 */
export const DEFAULT_CURRENCY: string =
  typeof import.meta.env?.VITE_DEFAULT_CURRENCY === 'string'
    ? import.meta.env.VITE_DEFAULT_CURRENCY
    : 'PKR'
