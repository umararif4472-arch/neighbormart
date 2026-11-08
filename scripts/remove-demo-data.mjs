/**
 * Remove ALL demo/seed data from the LIVE Firebase project (Phase 8).
 *
 * What counts as demo data:
 *   - Auth users whose email ends in @example.com (the seed accounts)
 *   - Their profile docs, and every listing / request / review /
 *     message / notification / report / rate-limit doc that references
 *     a demo user or a demo-owned listing.
 *
 * Safety rails:
 *   - DRY RUN by default: prints exactly what would be deleted.
 *   - Pass --confirm to actually delete. There is no undo — take a
 *     Firestore export first if you might want the demo data back.
 *   - Uses the service-account key at
 *     ~/.config/neighbormart/service-account.json (never committed).
 *
 * Usage:
 *   node scripts/remove-demo-data.mjs            # dry run
 *   node scripts/remove-demo-data.mjs --confirm  # really delete
 */
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const confirm = process.argv.includes('--confirm')
const sa = JSON.parse(
  readFileSync(process.env.HOME + '/.config/neighbormart/service-account.json', 'utf8'),
)
initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

// 1. Demo auth users (@example.com).
const demoUsers = []
let nextPageToken
do {
  const page = await auth.listUsers(1000, nextPageToken)
  for (const user of page.users) {
    if (user.email && user.email.endsWith('@example.com')) demoUsers.push(user)
  }
  nextPageToken = page.pageToken
} while (nextPageToken)
const demoIds = new Set(demoUsers.map((u) => u.uid))
console.log(`Demo auth users: ${demoUsers.length}`)
for (const u of demoUsers) console.log(`  ${u.email} (${u.uid})`)

// 2. Everything in Firestore that touches a demo user or their listings.
const demoListingIds = new Set()
for (const uid of demoIds) {
  const snap = await db.collection('listings').where('ownerId', '==', uid).get()
  snap.docs.forEach((d) => demoListingIds.add(d.id))
}
console.log(`Demo listings: ${demoListingIds.size}`)

const collections = [
  'users',
  'requests',
  'reviews',
  'messages',
  'notifications',
  'reports',
  'rateLimits',
]
const toDelete = []
for (const name of collections) {
  const snap = await db.collection(name).get()
  for (const d of snap.docs) {
    const data = d.data()
    const touches =
      demoIds.has(d.id) ||
      demoIds.has(data.ownerId) ||
      demoIds.has(data.borrowerId) ||
      demoIds.has(data.reviewerId) ||
      demoIds.has(data.senderId) ||
      demoIds.has(data.userId) ||
      demoIds.has(data.reportedBy) ||
      demoIds.has(data.targetOwnerId) ||
      demoListingIds.has(data.listingId) ||
      demoListingIds.has(data.targetId)
    if (touches) toDelete.push(d.ref)
  }
}
for (const id of demoListingIds) toDelete.push(db.doc(`listings/${id}`))
console.log(`Firestore docs to delete: ${toDelete.length}`)

if (!confirm) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to delete.')
  process.exit(0)
}

// 3. Delete in batches of 400 (Firestore batch limit is 500).
for (let i = 0; i < toDelete.length; i += 400) {
  const batch = db.batch()
  for (const ref of toDelete.slice(i, i + 400)) batch.delete(ref)
  await batch.commit()
}
if (demoUsers.length > 0) {
  const result = await auth.deleteUsers([...demoIds])
  console.log(`Auth users deleted: ${result.successCount}, failures: ${result.failureCount}`)
}
console.log('Demo data removed. The live project now contains only real user data.')
process.exit(0)
