/**
 * One-time demo-data seed for the live Firebase backend (Phase 3).
 *
 * Writes the exact same dataset the mock backend seeds in memory —
 * 9 Lahore neighbors, 35 listings, their requests, reviews, messages,
 * and notifications — into Firestore, and creates matching Firebase
 * Auth accounts so the demo people can actually sign in:
 *
 *   email:    firstname.lastname@example.com   (e.g. maya.chen@example.com)
 *   password: $DEMO_SEED_PASSWORD             (DEMO ONLY — see below)
 *
 * Auth uids are pinned to the seed ids (u-maya, u-joan, …) so every
 * cross-reference in the dataset lines up with the profile docs.
 *
 * Usage:
 *   1. Firebase Console → Project settings → Service accounts →
 *      "Generate new private key" — save the JSON somewhere private.
 *   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npm run seed:firestore
 *
 * Safe to re-run: documents are overwritten with the same ids and
 * existing Auth accounts are updated, not duplicated. The Admin SDK
 * bypasses Security Rules, so run this BEFORE opening the app to the
 * public, and never ship these demo accounts in a real launch.
 */
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import {
  seedListings,
  seedMessages,
  seedNotifications,
  seedRequests,
  seedReviews,
  seedUsers,
} from '../src/data/seed'

// Phase 8: no hard-coded demo password. Set DEMO_SEED_PASSWORD in your
// shell (any throwaway value) — the accounts it creates are DEMO ONLY
// and must be removed before a real launch (scripts/remove-demo-data.mjs).
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD
if (!DEMO_PASSWORD) {
  console.error(
    'DEMO_SEED_PASSWORD is not set. Refusing to seed demo accounts without an explicit password.',
  )
  process.exit(2)
}
if (process.env.ALLOW_DEMO_SEED !== '1') {
  console.error(
    'Refusing to seed demo data. Re-run with ALLOW_DEMO_SEED=1 if this is a dev/demo project.',
  )
  process.exit(2)
}

function demoEmail(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '')
  return `${slug}@example.com`
}

/** Firestore rejects undefined values; strip them like the live services do. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

async function main(): Promise<void> {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set — point it at the service-account JSON you downloaded from the Firebase console.',
    )
  }
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8')) as {
    project_id: string
    client_email: string
    private_key: string
  }

  initializeApp({ credential: cert(serviceAccount) })
  const auth = getAuth()
  const db = getFirestore()
  console.log(`Seeding project ${serviceAccount.project_id} …`)

  const users = seedUsers()
  const listings = seedListings(users)
  const requests = seedRequests()
  const reviews = seedReviews()
  const messages = seedMessages()
  const notifications = seedNotifications()
  const ownerByListing = new Map(listings.map((l) => [l.id, l.ownerId]))

  // 1) Auth accounts + profile docs.
  for (const user of users) {
    const email = demoEmail(user.name)
    try {
      await auth.createUser({
        uid: user.id,
        email,
        password: DEMO_PASSWORD,
        displayName: user.name,
        photoURL: user.avatarUrl || undefined,
        emailVerified: user.emailVerified,
      })
      console.log(`  auth  created ${email} (${user.id})`)
    } catch (error) {
      if (
        (error as { code?: string }).code === 'auth/uid-already-exists' ||
        (error as { code?: string }).code === 'auth/email-already-exists'
      ) {
        await auth.updateUser(user.id, {
          displayName: user.name,
          photoURL: user.avatarUrl || undefined,
        })
        console.log(`  auth  exists  ${email} (${user.id}) — updated`)
      } else {
        throw error
      }
    }
    const { id: _id, ...profile } = user
    // The profile spread carries the seeded phone + showPhone (Phase 5);
    // email is the only extra field the app model doesn't hold.
    await db.doc(`users/${user.id}`).set(stripUndefined({ ...profile, email }))
  }

  // 2) Listings.
  for (const listing of listings) {
    const { id, ...data } = listing
    await db.doc(`listings/${id}`).set(stripUndefined(data))
  }
  console.log(`  data  ${listings.length} listings`)

  // 3) Requests (with the denormalized ownerId the live service writes).
  for (const request of requests) {
    const { id, ...data } = request
    await db
      .doc(`requests/${id}`)
      .set(stripUndefined({ ...data, ownerId: ownerByListing.get(request.listingId) ?? '' }))
  }
  console.log(`  data  ${requests.length} requests`)

  // 4) Reviews under the deterministic live ids (`${requestId}_${reviewerId}`).
  for (const review of reviews) {
    const { id: _seedId, ...data } = review
    await db.doc(`reviews/${review.requestId}_${review.reviewerId}`).set(stripUndefined(data))
  }
  console.log(`  data  ${reviews.length} reviews`)

  // 5) Messages + notifications under their seed ids.
  for (const message of messages) {
    const { id, ...data } = message
    await db.doc(`messages/${id}`).set(stripUndefined(data))
  }
  for (const notification of notifications) {
    const { id, ...data } = notification
    await db.doc(`notifications/${id}`).set(stripUndefined(data))
  }
  console.log(`  data  ${messages.length} messages, ${notifications.length} notifications`)

  console.log('\nDone. Demo sign-ins (password = DEMO_SEED_PASSWORD for all):')
  for (const user of users) console.log(`  ${demoEmail(user.name)}  — ${user.name}`)
  console.log('\nThese are demo accounts for a demo project — remove them before a real launch.')
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
