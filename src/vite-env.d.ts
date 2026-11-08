/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase (Phase 3) — see .env.example. Optional until the real
  // backend lands, so the mock build type-checks with no env set.
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_DEFAULT_CURRENCY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
