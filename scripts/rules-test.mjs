/**
 * Ad-hoc Firestore rules verification (Phase 3) — NOT part of npm test.
 *
 * Prerequisites: the Firestore emulator running with this repo's rules:
 *   firebase emulators:start --only firestore --project demo-neighbormart
 * Then:
 *   node scripts/rules-test.mjs
 *
 * Verifies the rules that matter most: public reads, owner-only listing
 * edits, valid status transitions, no self-booking, participant-only
 * request/message access, one-review-per-deal, and the privacy split
 * (users/{uid}/private/data is owner read/write, admin read-only, and
 * invisible to everyone else).
 */
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-neighbormart',
  firestore: { rules, host: '127.0.0.1', port: 8080 },
})

let passed = 0
async function check(name, promise, shouldPass) {
  try {
    if (shouldPass) await assertSucceeds(promise)
    else await assertFails(promise)
    passed += 1
    console.log(`  ok  ${name}`)
  } catch {
    console.error(`FAIL  ${name} (expected ${shouldPass ? 'ALLOW' : 'DENY'})`)
    process.exitCode = 1
  }
}

await testEnv.clearFirestore()

// Seed a listing + request with rules disabled.
const admin = testEnv.withSecurityRulesDisabled().firestore()
await setDoc(doc(admin, 'listings/l1'), {
  ownerId: 'u-maya',
  section: 'items',
  listingType: 'borrow',
  title: 'Test drill',
  status: 'active',
})
await setDoc(doc(admin, 'requests/r1'), {
  listingId: 'l1',
  borrowerId: 'u-tom',
  ownerId: 'u-maya',
  status: 'pending',
})
// Privacy split fixtures: an admin profile (isAdmin() reads the
// caller's own users doc for role == 'admin') and Maya's private doc.
await setDoc(doc(admin, 'users/u-admin'), { name: 'Admin', role: 'admin' })
await setDoc(doc(admin, 'users/u-maya/private/data'), {
  phone: '+92 300 0000000',
  email: 'maya@example.com',
  blockedUserIds: ['u-leo'],
  homeLocation: { lat: 31.4624, lng: 74.442 },
})

const anon = testEnv.unauthenticatedContext().firestore()
const mayaDb = testEnv.authenticatedContext('u-maya').firestore()
const tomDb = testEnv.authenticatedContext('u-tom').firestore()
const leoDb = testEnv.authenticatedContext('u-leo').firestore()
const adminDb = testEnv.authenticatedContext('u-admin').firestore()

console.log('listings')
await check('guest can read a listing', getDoc(doc(anon, 'listings/l1')), true)
await check(
  'non-owner cannot edit a listing title',
  updateDoc(doc(leoDb, 'listings/l1'), { title: 'Hijacked' }),
  false,
)
await check(
  'owner can edit own listing title',
  updateDoc(doc(mayaDb, 'listings/l1'), { title: 'Better drill' }),
  true,
)
await check(
  'owner cannot jump active -> reviewed-like bogus status',
  updateDoc(doc(mayaDb, 'listings/l1'), { status: 'bogus' }),
  false,
)
await check(
  'participant can flip active -> rented (pickup)',
  updateDoc(doc(tomDb, 'listings/l1'), { status: 'rented', updatedAt: 'now' }),
  true,
)
await check(
  'participant cannot flip status AND edit content together',
  updateDoc(doc(tomDb, 'listings/l1'), { status: 'active', title: 'sneaky' }),
  false,
)

console.log('requests')
await check(
  'borrower cannot book their own listing (self-booking)',
  setDoc(doc(mayaDb, 'requests/r2'), {
    listingId: 'l1',
    borrowerId: 'u-maya',
    ownerId: 'u-maya',
    status: 'pending',
  }),
  false,
)
await check('stranger cannot read someone else’s request', getDoc(doc(leoDb, 'requests/r1')), false)
await check(
  'owner can approve (pending -> approved)',
  updateDoc(doc(mayaDb, 'requests/r1'), { status: 'approved' }),
  true,
)
await check(
  'borrower cannot approve their own request',
  updateDoc(doc(tomDb, 'requests/r1'), { status: 'approved' }),
  false,
)
await check(
  'owner cannot cancel (borrower-only transition)',
  updateDoc(doc(mayaDb, 'requests/r1'), { status: 'cancelled' }),
  false,
)

console.log('reviews')
await check(
  'reviewer can create their one review',
  setDoc(doc(tomDb, 'reviews/r1_u-tom'), {
    requestId: 'r1',
    listingId: 'l1',
    reviewerId: 'u-tom',
    revieweeId: 'u-maya',
    rating: 5,
    comment: 'Great drill',
  }),
  true,
)
await check(
  'the same review id cannot be created twice (one per deal)',
  setDoc(doc(tomDb, 'reviews/r1_u-tom'), {
    requestId: 'r1',
    listingId: 'l1',
    reviewerId: 'u-tom',
    revieweeId: 'u-maya',
    rating: 1,
    comment: 'Changed my mind',
  }),
  false,
)
await check(
  'rating outside 1-5 is rejected',
  setDoc(doc(mayaDb, 'reviews/r1_u-maya'), {
    requestId: 'r1',
    listingId: 'l1',
    reviewerId: 'u-maya',
    revieweeId: 'u-tom',
    rating: 9,
    comment: 'Too many stars',
  }),
  false,
)

console.log('messages + notifications')
await check(
  'participant can post in the request thread',
  setDoc(doc(tomDb, 'messages/m1'), {
    requestId: 'r1',
    senderId: 'u-tom',
    body: 'See you at 6!',
    createdAt: 'now',
  }),
  true,
)
await check(
  'stranger cannot post in the thread',
  setDoc(doc(leoDb, 'messages/m2'), {
    requestId: 'r1',
    senderId: 'u-leo',
    body: 'me too',
    createdAt: 'now',
  }),
  false,
)
await check(
  'recipient can read their own notification',
  (async () => {
    await setDoc(doc(admin, 'notifications/n1'), { userId: 'u-maya', read: false })
    return getDoc(doc(mayaDb, 'notifications/n1'))
  })(),
  true,
)
await check(
  'another user cannot read that notification',
  getDoc(doc(tomDb, 'notifications/n1')),
  false,
)

console.log('private profile data (privacy split)')
const mayaPrivate = (db) => doc(db, 'users/u-maya/private/data')
await check('anonymous cannot read a private doc', getDoc(mayaPrivate(anon)), false)
await check('another signed-in user cannot read it', getDoc(mayaPrivate(tomDb)), false)
await check('owner can read their own private doc', getDoc(mayaPrivate(mayaDb)), true)
await check(
  'owner can write their own private doc',
  updateDoc(mayaPrivate(mayaDb), { phone: '+92 300 1111111' }),
  true,
)
await check(
  'another signed-in user cannot write it',
  updateDoc(mayaPrivate(tomDb), { phone: '+92 300 9999999' }),
  false,
)
await check('admin can read a private doc', getDoc(mayaPrivate(adminDb)), true)
await check(
  'admin cannot write a private doc (owner-only writes)',
  updateDoc(mayaPrivate(adminDb), { phone: '+92 300 9999999' }),
  false,
)
await check(
  'owner cannot smuggle a non-private field into the private doc',
  setDoc(mayaPrivate(mayaDb), { phone: '+92 300 1111111', role: 'admin' }),
  false,
)
await check(
  'no doc other than `data` may exist under private/',
  getDoc(doc(mayaDb, 'users/u-maya/private/other')),
  false,
)

console.log(`\n${passed} checks passed${process.exitCode ? ' — FAILURES present' : ''}`)
await testEnv.cleanup()
process.exit(process.exitCode ?? 0)
