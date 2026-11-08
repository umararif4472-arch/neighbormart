/**
 * Live smoke test (opt-in, NOT part of npm test).
 *
 * Runs the real Firebase client SDK against the real project using the
 * config in .env.local: public reads, a demo-account sign-in, a profile
 * read, one rules-denied write, and one owner create+delete round-trip.
 * Uses only queries that need single-field indexes, so it passes even
 * before the composite indexes finish building — the app itself needs
 * those indexes for notifications/messages queries.
 *
 * Usage: node scripts/smoke-live.mjs   (requires .env.local)
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'

const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const config = {
  apiKey: env['VITE_FIREBASE_' + 'API_KEY'],
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}
if (!config.apiKey || !config.projectId) {
  console.error('Missing VITE_FIREBASE_* values in .env.local')
  process.exit(1)
}

const app = initializeApp(config)
const auth = getAuth(app)
const db = getFirestore(app)
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// 1. Public read of listings (rules: anyone may read).
const listingsSnap = await getDocs(query(collection(db, 'listings'), orderBy('createdAt', 'desc')))
check('public listings read', listingsSnap.size === 35, `${listingsSnap.size} listings`)

// 2. Demo sign-in + profile doc.
const cred = await signInWithEmailAndPassword(auth, 'maya.chen@example.com', 'borrow123')
check('demo sign-in (maya)', cred.user.uid === 'u-maya', `uid ${cred.user.uid}`)
const profile = await getDoc(doc(db, 'users', 'u-maya'))
check('profile doc read', profile.exists() && profile.data().name === 'Maya Chen')

// 3. Rules deny editing someone else's listing.
const others = listingsSnap.docs.find((d) => d.data().ownerId !== 'u-maya')
let denied = false
try {
  await updateDoc(doc(db, 'listings', others.id), { title: 'should not work' })
} catch (err) {
  denied = err.code === 'permission-denied'
}
check('rules deny foreign listing edit', denied)

// 4. Owner create + delete round-trip.
const ref = await addDoc(collection(db, 'listings'), {
  section: 'items',
  listingType: 'borrow',
  title: 'Smoke test listing (auto-deleted)',
  description: 'Created and removed by scripts/smoke-live.mjs.',
  price: 0,
  currency: 'PKR',
  priceUnit: 'day',
  ownerId: 'u-maya',
  status: 'active',
  photos: [],
  location: { city: 'Lahore', area: 'Gulberg', lat: 31.51, lng: 74.35 },
  category: 'tools',
  condition: 'good',
  deposit: 1000,
  dailyFee: 0,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})
await deleteDoc(doc(db, 'listings', ref.id))
check('owner create + delete listing', true, ref.id)

await signOut(auth)
console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
