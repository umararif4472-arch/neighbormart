import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore/lite'
import { getStorage, type FirebaseStorage } from 'firebase/storage'
import { ApiError } from './errors'

/**
 * Firebase bootstrap (Phase 3). The web config comes from VITE_FIREBASE_*
 * env vars (see .env.example) — these values are public by design; real
 * protection lives in firestore.rules / storage.rules.
 *
 * When the config is absent (local dev, unit tests, CI), the app runs on
 * the in-memory mock service layer instead — `isFirebaseConfigured` is
 * the single switch the services barrel reads.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
)

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null

function requireApp(): FirebaseApp {
  if (!isFirebaseConfigured) {
    throw new ApiError(
      'unknown',
      'Firebase is not configured — copy .env.example to .env.local and fill in VITE_FIREBASE_* values.',
    )
  }
  app ??= initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth {
  auth ??= getAuth(requireApp())
  return auth
}

export function getDb(): Firestore {
  db ??= getFirestore(requireApp())
  return db
}

export function getFirebaseStorage(): FirebaseStorage {
  storage ??= getStorage(requireApp())
  return storage
}
