/**
 * Live end-to-end verification (opt-in, NOT part of npm test).
 *
 * Exercises the full marketplace flow against the REAL Firebase backend
 * (project from .env.local) + Cloudinary, using two temporary accounts,
 * mirroring the live service layer (src/services/live/*) call-for-call:
 * rate-limit counter bumps before listing/message creates, the request
 * lifecycle batches, deterministic review ids, the safety report shape.
 * Temp users are created in the privacy-split shape: public fields on
 * users/{uid}, private fields (phone, email, blockedUserIds,
 * homeLocation) on users/{uid}/private/data — and both docs (plus the
 * block step, which now targets the private doc) are cleaned up.
 *
 * Everything created is cleaned up: client-side deletions where the
 * rules allow them (listings, notifications, profiles, Auth users),
 * then an Admin SDK sweep for the collections users may not delete
 * (requests, messages, reviews, reports, rateLimits). A final sweep
 * proves zero temp-run data remains.
 *
 * Usage: node scripts/e2e-live.mjs   (requires .env.local + the
 * service-account key at ~/.config/neighbormart/service-account.json)
 * Exit code is non-zero if any step fails.
 */
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  updateProfile,
} from 'firebase/auth'
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
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore/lite'
import { initializeApp as initializeAdminApp, cert, deleteApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'

// ---------------------------------------------------------------- config
const env = {}
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const config = {
  apiKey: env['VITE_FIREBASE_' + 'API_KEY'],
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}
if (!config.apiKey || !config.projectId || !config.appId) {
  console.error('Missing VITE_FIREBASE_* values in .env.local')
  process.exit(1)
}
const CLOUDINARY_CLOUD = env.VITE_CLOUDINARY_CLOUD_NAME || 'sgwcguwo'
const CLOUDINARY_PRESET = env.VITE_CLOUDINARY_UPLOAD_PRESET || 'neighbormart_listings'
const SA_PATH = process.env.HOME + '/.config/neighbormart/service-account.json'

// ------------------------------------------------------------- utilities
/** Mirror of services/live/firestoreData.ts stripUndefined. */
function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v)
    return out
  }
  return value
}

/** Mirror of utils/rateLimit.ts checkWindow. */
function checkWindow(state, nowIso, limit, windowMs) {
  const now = Date.parse(nowIso)
  const start = state.windowStart ? Date.parse(state.windowStart) : NaN
  if (Number.isNaN(start) || now - start >= windowMs) {
    return { allowed: true, windowStart: nowIso, count: 1 }
  }
  if (state.count >= limit) return { allowed: false, windowStart: state.windowStart, count: state.count }
  return { allowed: true, windowStart: state.windowStart, count: state.count + 1 }
}
const LISTING_RATE_LIMIT = { limit: 10, windowMs: 24 * 60 * 60 * 1000 }
const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 }

/** Mirror of services/live/rateLimit.ts bump() against a given Firestore. */
async function bumpQuota(db, uid, kind, targetId) {
  const ref = doc(db, 'rateLimits', uid)
  const snap = await getDoc(ref)
  const data = snap.exists() ? snap.data() : {}
  const nowIso = new Date().toISOString()
  if (kind === 'listings') {
    const decision = checkWindow(
      {
        count: data.listingsCount ?? 0,
        windowStart: data.listingsWindowStartTs ? data.listingsWindowStartTs.toDate().toISOString() : null,
      },
      nowIso,
      LISTING_RATE_LIMIT.limit,
      LISTING_RATE_LIMIT.windowMs,
    )
    if (!decision.allowed) throw new Error('rate-limited (listings)')
    await setDoc(
      ref,
      {
        listingsCount: decision.count,
        listingsWindowStartTs: Timestamp.fromDate(new Date(decision.windowStart)),
        lastListingId: targetId,
      },
      { merge: true },
    )
  } else {
    const decision = checkWindow(
      {
        count: data.messagesCount ?? 0,
        windowStart: data.messagesWindowStartTs ? data.messagesWindowStartTs.toDate().toISOString() : null,
      },
      nowIso,
      MESSAGE_RATE_LIMIT.limit,
      MESSAGE_RATE_LIMIT.windowMs,
    )
    if (!decision.allowed) throw new Error('rate-limited (messages)')
    await setDoc(
      ref,
      {
        messagesCount: decision.count,
        messagesWindowStartTs: Timestamp.fromDate(new Date(decision.windowStart)),
        lastMessageId: targetId,
      },
      { merge: true },
    )
  }
}

/** Mirror of services/live/notifications.ts createNotification(). */
async function createNotification(db, userId, type, title, body, refs = {}) {
  const notification = stripUndefined({
    userId,
    type,
    title,
    body,
    requestId: refs.requestId,
    listingId: refs.listingId,
    read: false,
    createdAt: new Date().toISOString(),
  })
  const ref = await addDoc(collection(db, 'notifications'), notification)
  track.notifications.add(ref.id)
  return ref.id
}

/**
 * Mirror of services/live/auth.ts ensureUserProfile() profile body,
 * in the privacy-split shape: the PUBLIC users/{uid} doc carries
 * everything except the private fields, which live in
 * users/{uid}/private/data (see privateBody). showPhone is only a
 * visibility flag, so it stays public with the rest of the profile.
 */
function profileBody(fbUser, name) {
  return stripUndefined({
    name,
    avatarUrl: fbUser.photoURL ?? '',
    bio: '',
    city: '',
    neighborhood: '',
    joinedAt: new Date().toISOString(),
    phoneVerified: false,
    emailVerified: fbUser.emailVerified,
    idVerified: false,
    responseRate: 1,
    avgResponseMinutes: 60,
    stats: {
      successfulLends: 0,
      successfulBorrows: 0,
      salesCompleted: 0,
      rentalsHosted: 0,
      onTimeReturns: 0,
      lateReturns: 0,
    },
    badges: [],
    showPhone: false,
    onboardingCompleted: false,
    interests: [],
  })
}

/** Private half of the split profile (users/{uid}/private/data). */
function privateBody(fbUser) {
  return stripUndefined({
    phone: '',
    email: fbUser.email ?? '',
    homeLocation: { lat: 31.5204, lng: 74.3587 },
  })
}

// ------------------------------------------------------------ run state
const runId = randomBytes(3).toString('hex')
const emailA = `e2e.${runId}a@example.com`
const emailB = `e2e.${runId}b@example.com`
const passwordA = randomBytes(18).toString('base64') + 'aA1!'
const passwordB = randomBytes(18).toString('base64') + 'bB2!'

const appA = initializeApp(config, `e2e-a-${runId}`)
const appB = initializeApp(config, `e2e-b-${runId}`)
const authA = getAuth(appA)
const authB = getAuth(appB)
const dbA = getFirestore(appA)
const dbB = getFirestore(appB)

let uidA = null
let uidB = null
let listingId = null
let requestId = null
let reportId = null
let photoUrl = null

const track = {
  listings: new Set(),
  requests: new Set(),
  messages: new Set(),
  reviews: new Set(),
  notifications: new Set(),
  reports: new Set(),
  users: new Set(),
}
let clientDeleted = 0
let adminDeleted = 0

const results = []
let currentStep = null
function begin(name) {
  currentStep = { name, ok: true, detail: '' }
  results.push(currentStep)
}
function pass(detail = '') {
  currentStep.detail = detail
  console.log(`PASS  ${currentStep.name}${detail ? ` — ${detail}` : ''}`)
}
function fail(detail) {
  currentStep.ok = false
  currentStep.detail = detail
  console.log(`FAIL  ${currentStep.name} — ${detail}`)
}
function errText(e) {
  return `${e?.code ?? e?.name ?? 'error'}: ${e?.message ?? e}`
}

// ----------------------------------------------------------------- flow
async function uploadPhoto() {
  begin('0. Cloudinary unsigned upload (tiny PNG)')
  // A valid 1x1 transparent PNG (68 bytes).
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  )
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'e2e.png')
  form.append('upload_preset', CLOUDINARY_PRESET)
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: form,
  })
  const json = await res.json()
  if (!res.ok || !json.secure_url) throw new Error(`upload failed: ${JSON.stringify(json).slice(0, 200)}`)
  photoUrl = json.secure_url
  const pattern = new RegExp(`^https://res\\.cloudinary\\.com/${CLOUDINARY_CLOUD}/image/upload/`)
  if (!pattern.test(photoUrl)) throw new Error(`URL does not match the rules pattern: ${photoUrl}`)
  pass(photoUrl)
}

async function signUp(auth, db, email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName: name })
  await setDoc(doc(db, 'users', cred.user.uid), profileBody(cred.user, name))
  // Privacy split: private fields go to the private doc, never the
  // public one (owner-only rules — this session IS the owner).
  await setDoc(doc(db, 'users', cred.user.uid, 'private', 'data'), privateBody(cred.user))
  track.users.add(cred.user.uid)
  // Mirror onboarding completion (profile update by the owner).
  await updateDoc(doc(db, 'users', cred.user.uid), {
    city: 'Lahore',
    neighborhood: 'DHA Phase 5',
    onboardingCompleted: true,
  })
  return cred.user.uid
}

async function stepSignUps() {
  begin('1. Sign up A + B (email/password) and create profile docs')
  uidA = await signUp(authA, dbA, emailA, passwordA, 'E2E Owner A')
  uidB = await signUp(authB, dbB, emailB, passwordB, 'E2E Renter B')
  const snapA = await getDoc(doc(dbA, 'users', uidA))
  const snapB = await getDoc(doc(dbB, 'users', uidB))
  if (!snapA.exists() || !snapB.exists()) throw new Error('profile doc missing after sign-up')
  // Privacy split assertions: no private field may sit on the public
  // doc, and the private doc must carry them for the owner to read.
  for (const [snap, db, uid, label] of [
    [snapA, dbA, uidA, 'A'],
    [snapB, dbB, uidB, 'B'],
  ]) {
    const pub = snap.data()
    for (const field of ['phone', 'email', 'blockedUserIds', 'homeLocation']) {
      if (field in pub)
        throw new Error(`public profile ${label} still carries private field ${field}`)
    }
    const priv = await getDoc(doc(db, 'users', uid, 'private', 'data'))
    if (!priv.exists()) throw new Error(`private doc missing for ${label}`)
    if (typeof priv.data().email !== 'string' || !priv.data().homeLocation) {
      throw new Error(`private doc for ${label} is missing email/homeLocation`)
    }
  }
  pass(`uids ${uidA.slice(0, 8)}… / ${uidB.slice(0, 8)}… (split shape verified)`)
}

async function stepCreateListing() {
  begin("2. A creates a listing (quota bump, then setDoc; section 'items', rent, PKR)")
  const ownerSnap = await getDoc(doc(dbA, 'users', uidA))
  const owner = ownerSnap.data()
  // Privacy split: the precise homeLocation now lives in the owner's
  // private doc (A reads its own — the rules allow owner reads).
  const ownerPrivateSnap = await getDoc(doc(dbA, 'users', uidA, 'private', 'data'))
  const ownerPrivate = ownerPrivateSnap.data()
  const now = new Date().toISOString()
  const ref = doc(collection(dbA, 'listings'))
  listingId = ref.id
  await bumpQuota(dbA, uidA, 'listings', listingId)
  await setDoc(
    ref,
    stripUndefined({
      ownerId: uidA,
      section: 'items',
      listingType: 'rent',
      title: 'E2E Cordless Drill (live test)',
      description: 'Temporary end-to-end verification listing. Removed by the test run.',
      price: 1500,
      currency: env.VITE_DEFAULT_CURRENCY || 'PKR',
      priceUnit: 'day',
      negotiable: false,
      photos: [photoUrl],
      location: { ...ownerPrivate.homeLocation, city: owner.city, area: owner.neighborhood },
      status: 'active',
      createdAt: now,
      updatedAt: now,
      views: 0,
      details: {
        category: 'Tools',
        condition: 'Good — works great',
        depositAmount: 5000,
        maxDurationDays: 7,
        pickupPreference: 'pickup',
        pickupInstructions: 'Pick up from DHA Phase 5, Lahore.',
      },
    }),
  )
  track.listings.add(listingId)
  const back = await getDoc(doc(dbA, 'listings', listingId))
  if (!back.exists() || back.data().status !== 'active') throw new Error('listing not readable as active')
  pass(`listing ${listingId}`)
}

async function stepBrowse() {
  begin("3. B browses active listings and sees A's listing")
  const snap = await getDocs(query(collection(dbB, 'listings'), orderBy('createdAt', 'desc')))
  const ids = snap.docs.map((d) => d.id)
  if (!ids.includes(listingId)) throw new Error(`listing not in browse results (${snap.size} docs)`)
  pass(`${snap.size} listings visible`)
}

async function stepCreateRequest() {
  begin('4. B creates a request on the listing (status pending)')
  const day = 24 * 60 * 60 * 1000
  const period = {
    start: new Date(Date.now() + day).toISOString().slice(0, 10),
    end: new Date(Date.now() + 4 * day).toISOString().slice(0, 10),
  }
  const ref = await addDoc(
    collection(dbB, 'requests'),
    stripUndefined({
      listingId,
      borrowerId: uidB,
      ownerId: uidA,
      period,
      note: 'E2E test request — need it for a weekend project.',
      offerAmount: null,
      slot: null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      respondedAt: null,
      dueAt: null,
      returnedAt: null,
      issue: null,
    }),
  )
  requestId = ref.id
  track.requests.add(requestId)
  const back = await getDoc(doc(dbB, 'requests', requestId))
  if (!back.exists() || back.data().status !== 'pending') throw new Error('request not pending')
  pass(`request ${requestId}, period ${period.start} → ${period.end}`)
}

async function stepApprove() {
  begin('5. A approves the request; notification written for B')
  const reqSnap = await getDoc(doc(dbA, 'requests', requestId))
  const req = reqSnap.data()
  await updateDoc(doc(dbA, 'requests', requestId), {
    status: 'approved',
    respondedAt: new Date().toISOString(),
    dueAt: req.period.end,
  })
  await createNotification(
    dbA,
    uidB,
    'request-approved',
    'Request approved',
    `Your request for "E2E Cordless Drill (live test)" was approved.`,
    { requestId, listingId },
  )
  const back = await getDoc(doc(dbA, 'requests', requestId))
  if (back.data().status !== 'approved') throw new Error('request not approved')
  pass('status approved + 1 notification for B')
}

async function stepPickup() {
  begin('6. B confirms pickup (request active; listing active → rented, one batch)')
  const batch = writeBatch(dbB)
  batch.update(doc(dbB, 'requests', requestId), { status: 'active' })
  batch.update(doc(dbB, 'listings', listingId), {
    status: 'rented',
    updatedAt: new Date().toISOString(),
  })
  await batch.commit()
  const listing = await getDoc(doc(dbB, 'listings', listingId))
  if (listing.data().status !== 'rented') throw new Error('listing not rented after pickup')
  pass('request active, listing rented')
}

async function stepReturn() {
  begin('7. Return (mirror markReturned: request + listing + BOTH user stats, one batch)')
  const borrowerSnap = await getDoc(doc(dbA, 'users', uidB))
  const ownerSnap = await getDoc(doc(dbA, 'users', uidA))
  const borrower = borrowerSnap.data()
  const owner = ownerSnap.data()
  const now = new Date().toISOString()
  const reqSnap = await getDoc(doc(dbA, 'requests', requestId))
  const onTime = reqSnap.data().dueAt ? Date.parse(now) <= Date.parse(reqSnap.data().dueAt) + 86_399_000 : true
  const borrowerStats = { ...borrower.stats, successfulBorrows: borrower.stats.successfulBorrows + 1 }
  if (onTime) borrowerStats.onTimeReturns += 1
  else borrowerStats.lateReturns += 1
  const ownerStats = { ...owner.stats, successfulLends: owner.stats.successfulLends + 1, rentalsHosted: owner.stats.rentalsHosted + 1 }

  try {
    const batch = writeBatch(dbA)
    batch.update(doc(dbA, 'requests', requestId), { status: 'returned', returnedAt: now })
    batch.update(doc(dbA, 'listings', listingId), { status: 'active', updatedAt: now })
    batch.update(doc(dbA, 'users', uidB), { stats: borrowerStats })
    batch.update(doc(dbA, 'users', uidA), { stats: ownerStats })
    await batch.commit()
    pass('full mirror batch committed (request returned, listing active, both stats)')
  } catch (e) {
    // The rules only let a user update their OWN profile doc, so the
    // cross-user stats write in services/live/requests.ts markReturned
    // cannot commit from a single client session. Record the failure,
    // then fall back to the lifecycle-only batch so the rest of the
    // flow can still be exercised.
    fail(`mirrored markReturned batch rejected (${errText(e)}); lifecycle-only fallback applied — see report`)
    const batch = writeBatch(dbA)
    batch.update(doc(dbA, 'requests', requestId), { status: 'returned', returnedAt: now })
    batch.update(doc(dbA, 'listings', listingId), { status: 'active', updatedAt: now })
    batch.update(doc(dbA, 'users', uidA), { stats: ownerStats })
    await batch.commit()
  }
  const back = await getDoc(doc(dbA, 'requests', requestId))
  if (back.data().status !== 'returned') throw new Error('request did not reach returned')
}

async function sendOneMessage(auth, db, senderUid, otherUid, body) {
  const ref = doc(collection(db, 'messages'))
  await bumpQuota(db, senderUid, 'messages', ref.id)
  await setDoc(
    ref,
    stripUndefined({ requestId, senderId: senderUid, body, createdAt: new Date().toISOString() }),
  )
  track.messages.add(ref.id)
  await createNotification(db, otherUid, 'message-received', 'New message', body.slice(0, 80), {
    requestId,
    listingId,
  })
  return ref.id
}

async function stepChat() {
  begin('8. Chat: A and B each send a message (quota bump before each)')
  await sendOneMessage(authA, dbA, uidA, uidB, 'Hi! The drill is ready when you are.')
  await sendOneMessage(authB, dbB, uidB, uidA, 'Great — picking it up this evening, thanks!')
  const snap = await getDocs(query(collection(dbA, 'messages'), where('requestId', '==', requestId)))
  if (snap.size !== 2) throw new Error(`expected 2 messages, found ${snap.size}`)
  pass('2 messages + 2 message notifications')
}

async function createReview(db, reviewerUid, revieweeUid, role, rating, comment) {
  const reviewId = `${requestId}_${reviewerUid}`
  await setDoc(
    doc(db, 'reviews', reviewId),
    stripUndefined({
      requestId,
      listingId,
      reviewerId: reviewerUid,
      revieweeId: revieweeUid,
      reviewerRole: role,
      rating,
      comment,
      createdAt: new Date().toISOString(),
    }),
  )
  track.reviews.add(reviewId)
  await createNotification(db, revieweeUid, 'review-received', 'You got a review', `${rating} stars on the drill deal.`, {
    requestId,
    listingId,
  })
}

async function stepReviews() {
  begin('9. Reviews both ways (deterministic ids, ratings 5 and 4); request → reviewed')
  await createReview(dbB, uidB, uidA, 'borrower', 5, 'Smooth pickup, drill exactly as described.')
  await createReview(dbA, uidA, uidB, 'lender', 4, 'Returned on time and in good shape.')
  // Mirror maybeCompleteReview: both reviews exist → reviewed.
  await updateDoc(doc(dbA, 'requests', requestId), { status: 'reviewed' })
  const back = await getDoc(doc(dbA, 'requests', requestId))
  if (back.data().status !== 'reviewed') throw new Error('request not reviewed')
  pass('2 reviews + 2 notifications, request reviewed')
}

async function stepReport() {
  begin("10. B reports A's listing (reports collection, status 'open')")
  const ref = doc(collection(dbB, 'reports'))
  reportId = ref.id
  const report = {
    id: reportId,
    kind: 'listing',
    targetId: listingId,
    targetOwnerId: uidA,
    reportedBy: uidB,
    reason: 'fake',
    details: 'E2E live verification report — filed by the automated test, removed in cleanup.',
    status: 'open',
    createdAt: new Date().toISOString(),
  }
  await setDoc(ref, stripUndefined(report))
  track.reports.add(reportId)
  pass(`report ${reportId}`)
}

async function stepBlock() {
  begin("11. B blocks A (own private doc blockedUserIds), then unblocks")
  // Privacy split: the block list lives in users/{uid}/private/data —
  // B writes/reads its OWN private doc (owner-only rules).
  const privRef = doc(dbB, 'users', uidB, 'private', 'data')
  await updateDoc(privRef, { blockedUserIds: [uidA] })
  let snap = await getDoc(privRef)
  if (!(snap.data().blockedUserIds ?? []).includes(uidA)) throw new Error('block did not persist')
  await updateDoc(privRef, { blockedUserIds: [] })
  snap = await getDoc(privRef)
  if ((snap.data().blockedUserIds ?? []).length !== 0) throw new Error('unblock did not persist')
  pass('block + unblock verified (private doc)')
}

// -------------------------------------------------------------- cleanup
async function clientCleanup() {
  // Notifications: recipients may delete their own (rules).
  for (const [db, uid] of [
    [dbA, uidA],
    [dbB, uidB],
  ]) {
    if (!uid) continue
    try {
      const snap = await getDocs(query(collection(db, 'notifications'), where('userId', '==', uid)))
      for (const d of snap.docs) {
        await deleteDoc(d.ref)
        clientDeleted += 1
      }
    } catch (e) {
      console.log(`  cleanup note: notifications for ${uid.slice(0, 8)}… — ${errText(e)}`)
    }
  }
  // Listing: owner may delete.
  if (listingId && authA.currentUser) {
    try {
      await deleteDoc(doc(dbA, 'listings', listingId))
      clientDeleted += 1
    } catch (e) {
      console.log(`  cleanup note: listing delete — ${errText(e)}`)
    }
  }
  // Profile docs: owners may delete their own — the private doc too
  // (privacy split: private delete is owner-only in the rules).
  for (const [db, auth, uid] of [
    [dbA, authA, uidA],
    [dbB, authB, uidB],
  ]) {
    if (!uid || !auth.currentUser) continue
    try {
      await deleteDoc(doc(db, 'users', uid, 'private', 'data'))
      clientDeleted += 1
    } catch (e) {
      console.log(`  cleanup note: private doc delete — ${errText(e)}`)
    }
    try {
      await deleteDoc(doc(db, 'users', uid))
      clientDeleted += 1
    } catch (e) {
      console.log(`  cleanup note: profile delete — ${errText(e)}`)
    }
  }
  // Auth users (fresh sessions, so deleteUser is allowed).
  for (const auth of [authA, authB]) {
    if (!auth.currentUser) continue
    try {
      await deleteUser(auth.currentUser)
    } catch (e) {
      console.log(`  cleanup note: auth deleteUser — ${errText(e)}`)
    }
  }
}

async function adminSweepAndVerify() {
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'))
  const adminApp = initializeAdminApp({ credential: cert(sa) }, `e2e-admin-${runId}`)
  const adminAuth = getAdminAuth(adminApp)
  const adb = getAdminFirestore(adminApp)
  try {
    const uids = [uidA, uidB].filter(Boolean)
    const deleteQuery = async (coll, field, value) => {
      if (value == null) return 0
      const snap = await adb.collection(coll).where(field, '==', value).get()
      let n = 0
      for (const d of snap.docs) {
        await d.ref.delete()
        n += 1
      }
      return n
    }
    const deleteDocById = async (coll, id) => {
      if (!id) return 0
      const ref = adb.collection(coll).doc(id)
      const snap = await ref.get()
      if (!snap.exists) return 0
      await ref.delete()
      return 1
    }

    // Requests, messages, reviews, reports and rateLimits cannot be
    // deleted by clients (rules: delete false) — remove them here.
    for (const uid of uids) {
      adminDeleted += await deleteQuery('requests', 'borrowerId', uid)
      adminDeleted += await deleteQuery('requests', 'ownerId', uid)
      adminDeleted += await deleteQuery('notifications', 'userId', uid)
      adminDeleted += await deleteQuery('listings', 'ownerId', uid)
      adminDeleted += await deleteDocById('rateLimits', uid)
      // Privacy split: the private doc is a subcollection doc — the
      // users/{uid} delete above/below does NOT cascade to it.
      const privRef = adb.doc(`users/${uid}/private/data`)
      if ((await privRef.get()).exists) {
        await privRef.delete()
        adminDeleted += 1
      }
      adminDeleted += await deleteDocById('users', uid)
    }
    adminDeleted += await deleteQuery('messages', 'requestId', requestId)
    adminDeleted += await deleteQuery('reviews', 'requestId', requestId)
    adminDeleted += await deleteQuery('reports', 'reportedBy', uidB)
    adminDeleted += await deleteDocById('reports', reportId)
    adminDeleted += await deleteDocById('requests', requestId)
    adminDeleted += await deleteDocById('listings', listingId)

    // Auth users: delete any leftover temp accounts.
    for (const email of [emailA, emailB]) {
      try {
        const user = await adminAuth.getUserByEmail(email)
        await adminAuth.deleteUser(user.uid)
      } catch (e) {
        if (e?.code !== 'auth/user-not-found') throw e
      }
    }

    // ---- verification sweep: nothing tied to this run may remain ----
    const counts = {}
    const countQuery = async (coll, field, value) => {
      if (value == null) return 0
      const snap = await adb.collection(coll).where(field, '==', value).get()
      return snap.size
    }
    counts.listings = 0
    counts.requests = 0
    counts.notifications = 0
    for (const uid of uids) {
      counts.listings += await countQuery('listings', 'ownerId', uid)
      counts.requests += await countQuery('requests', 'borrowerId', uid)
      counts.requests += await countQuery('requests', 'ownerId', uid)
      counts.notifications += await countQuery('notifications', 'userId', uid)
      counts.rateLimits = (counts.rateLimits ?? 0) + ((await adb.collection('rateLimits').doc(uid).get()).exists ? 1 : 0)
      counts.users = (counts.users ?? 0) + ((await adb.collection('users').doc(uid).get()).exists ? 1 : 0)
      counts.privateDocs =
        (counts.privateDocs ?? 0) + ((await adb.doc(`users/${uid}/private/data`).get()).exists ? 1 : 0)
    }
    counts.messages = await countQuery('messages', 'requestId', requestId)
    counts.reviews = await countQuery('reviews', 'requestId', requestId)
    counts.reports = await countQuery('reports', 'reportedBy', uidB)
    let exampleComAuth = 0
    let nextPageToken
    do {
      const page = await adminAuth.listUsers(1000, nextPageToken)
      exampleComAuth += page.users.filter((u) => (u.email ?? '').endsWith('@example.com')).length
      nextPageToken = page.pageToken
    } while (nextPageToken)
    counts.authExampleCom = exampleComAuth
    return counts
  } finally {
    await deleteApp(adminApp)
  }
}

// ------------------------------------------------------------------ main
let sweepCounts = null
let sweepError = null
try {
  await uploadPhoto()
} catch (e) {
  fail(errText(e))
}
const flowSteps = [
  stepSignUps,
  stepCreateListing,
  stepBrowse,
  stepCreateRequest,
  stepApprove,
  stepPickup,
  stepReturn,
  stepChat,
  stepReviews,
  stepReport,
  stepBlock,
]
for (const stepFn of flowSteps) {
  try {
    await stepFn()
  } catch (e) {
    fail(errText(e))
  }
}

begin('12. Cleanup (client deletes + Admin sweep) and final verification')
try {
  await clientCleanup()
  sweepCounts = await adminSweepAndVerify()
  const remaining = Object.values(sweepCounts).reduce((a, b) => a + b, 0)
  if (remaining !== 0) {
    fail(`leftovers remain: ${JSON.stringify(sweepCounts)}`)
  } else {
    pass(`client deleted ${clientDeleted} docs, admin sweep deleted ${adminDeleted} docs; remaining ${JSON.stringify(sweepCounts)}`)
  }
} catch (e) {
  sweepError = e
  fail(errText(e))
}

const createdTotal =
  track.listings.size +
  track.requests.size +
  track.messages.size +
  track.reviews.size +
  track.notifications.size +
  track.reports.size +
  track.users.size
console.log('\n================ E2E LIVE SUMMARY ================')
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
console.log(`\nDocs created (tracked): ${createdTotal} ` +
  `(listings ${track.listings.size}, requests ${track.requests.size}, messages ${track.messages.size}, ` +
  `reviews ${track.reviews.size}, notifications ${track.notifications.size}, reports ${track.reports.size}, profiles ${track.users.size})`)
console.log(`Docs deleted: ${clientDeleted + adminDeleted} (client ${clientDeleted}, admin sweep ${adminDeleted}) + 2 auth users`)
if (sweepCounts) console.log(`Remaining temp-run docs by collection: ${JSON.stringify(sweepCounts)}`)
console.log('Note: the uploaded test photo remains in Cloudinary (unsigned uploads cannot delete); it is not referenced by any live document.')
const failures = results.filter((r) => !r.ok).length
console.log(failures === 0 ? '\nVERDICT: PASS' : `\nVERDICT: FAIL (${failures} failing step(s))`)
process.exit(failures === 0 ? 0 : 1)
