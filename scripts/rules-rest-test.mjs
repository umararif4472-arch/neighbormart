/**
 * Firestore rules verification over the emulator's REST API (Phase 3).
 *
 * Why REST instead of @firebase/rules-unit-testing: that library uploads
 * rules over HTTP/2, which this sandbox's network intercepts and breaks;
 * the emulator itself serves HTTP/1.1 fine. The emulator evaluates the
 * rules loaded at startup (the repo's firestore.rules) against unsigned
 * emulator JWTs — the same evaluation a real client gets.
 *
 * Prerequisites: JDK 21+ on PATH, then
 *   firebase emulators:start --only firestore --project demo-neighbormart
 * Run:
 *   node scripts/rules-rest-test.mjs
 */
const BASE = 'http://127.0.0.1:8080/v1/projects/demo-neighbormart/databases/(default)/documents'

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
function tokenFor(uid) {
  if (!uid) return null
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    uid,
    iat: 0,
    exp: 9999999999,
    aud: 'demo-neighbormart',
    iss: 'https://securetoken.google.com/demo-neighbormart',
  })}.`
}

const S = (v) => ({ stringValue: v })
const I = (v) => ({ integerValue: String(v) })
const B = (v) => ({ booleanValue: v })

async function call(method, path, { uid, fields, mask, createOnly } = {}) {
  const params = new URLSearchParams()
  if (mask) for (const f of mask) params.append('updateMask.fieldPaths', f)
  if (createOnly) params.set('currentDocument.exists', 'false')
  const url = `${BASE}/${path}${params.toString() ? `?${params}` : ''}`
  const headers = { 'Content-Type': 'application/json' }
  if (uid === 'owner') headers.Authorization = 'Bearer owner'
  else if (uid) headers.Authorization = `Bearer ${tokenFor(uid)}`
  const res = await fetch(url, {
    method,
    headers,
    body: fields ? JSON.stringify({ fields }) : undefined,
  })
  return res.status
}

let failures = 0
async function check(name, statusPromise, shouldPass) {
  const status = await statusPromise
  const ok = shouldPass ? status >= 200 && status < 300 : status >= 400
  if (ok) console.log(`  ok  ${name} (${status})`)
  else {
    failures += 1
    console.error(`FAIL  ${name} — got ${status}, expected ${shouldPass ? 'ALLOW' : 'DENY'}`)
  }
}

// --- Seed with the owner bypass -------------------------------------------
await call('PATCH', 'listings/l1', {
  uid: 'owner',
  fields: {
    ownerId: S('u-maya'),
    section: S('items'),
    listingType: S('borrow'),
    title: S('Test drill'),
    status: S('active'),
  },
})
await call('PATCH', 'requests/r1', {
  uid: 'owner',
  fields: {
    listingId: S('l1'),
    borrowerId: S('u-tom'),
    ownerId: S('u-maya'),
    status: S('pending'),
  },
})
await call('PATCH', 'requests/r3', {
  uid: 'owner',
  fields: {
    listingId: S('l1'),
    borrowerId: S('u-tom'),
    ownerId: S('u-maya'),
    status: S('pending'),
  },
})
await call('PATCH', 'notifications/n1', {
  uid: 'owner',
  fields: { userId: S('u-maya'), title: S('Hi'), read: B(false) },
})

console.log('listings')
await check('guest can read a listing', call('GET', 'listings/l1', {}), true)
await check(
  'non-owner cannot edit a listing title',
  call('PATCH', 'listings/l1', { uid: 'u-leo', fields: { title: S('Hijacked') }, mask: ['title'] }),
  false,
)
await check(
  'owner can edit own listing title',
  call('PATCH', 'listings/l1', {
    uid: 'u-maya',
    fields: { title: S('Better drill') },
    mask: ['title'],
  }),
  true,
)
await check(
  'owner cannot set a bogus status',
  call('PATCH', 'listings/l1', { uid: 'u-maya', fields: { status: S('bogus') }, mask: ['status'] }),
  false,
)
await check(
  'participant can flip active -> rented (pickup)',
  call('PATCH', 'listings/l1', {
    uid: 'u-tom',
    fields: { status: S('rented'), updatedAt: S('2026-11-08T00:00:00.000Z') },
    mask: ['status', 'updatedAt'],
  }),
  true,
)
await check(
  'participant cannot flip status AND edit content together',
  call('PATCH', 'listings/l1', {
    uid: 'u-tom',
    fields: { status: S('active'), title: S('sneaky') },
    mask: ['status', 'title'],
  }),
  false,
)

console.log('requests')
await check(
  'self-booking is rejected',
  call('PATCH', 'requests/r2', {
    uid: 'u-maya',
    createOnly: true,
    fields: {
      listingId: S('l1'),
      borrowerId: S('u-maya'),
      ownerId: S('u-maya'),
      status: S('pending'),
    },
  }),
  false,
)
await check('stranger cannot read a request', call('GET', 'requests/r1', { uid: 'u-leo' }), false)
await check(
  'owner can approve (pending -> approved)',
  call('PATCH', 'requests/r1', {
    uid: 'u-maya',
    fields: { status: S('approved') },
    mask: ['status'],
  }),
  true,
)
await check(
  'borrower cannot approve their own request',
  call('PATCH', 'requests/r3', {
    uid: 'u-tom',
    fields: { status: S('approved') },
    mask: ['status'],
  }),
  false,
)
await check(
  'owner cannot cancel (borrower-only)',
  call('PATCH', 'requests/r3', {
    uid: 'u-maya',
    fields: { status: S('cancelled') },
    mask: ['status'],
  }),
  false,
)
await check(
  'borrower can cancel their pending request',
  call('PATCH', 'requests/r3', {
    uid: 'u-tom',
    fields: { status: S('cancelled') },
    mask: ['status'],
  }),
  true,
)

console.log('reviews')
const reviewFields = (reviewer, reviewee, rating) => ({
  requestId: S('r1'),
  listingId: S('l1'),
  reviewerId: S(reviewer),
  revieweeId: S(reviewee),
  rating: I(rating),
  comment: S('Solid'),
})
await check(
  'reviewer can create their one review',
  call('PATCH', 'reviews/r1_u-tom', {
    uid: 'u-tom',
    createOnly: true,
    fields: reviewFields('u-tom', 'u-maya', 5),
  }),
  true,
)
await check(
  'the same review cannot be created twice',
  call('PATCH', 'reviews/r1_u-tom', {
    uid: 'u-tom',
    createOnly: true,
    fields: reviewFields('u-tom', 'u-maya', 1),
  }),
  false,
)
await check(
  'a review cannot be edited afterwards',
  call('PATCH', 'reviews/r1_u-tom', { uid: 'u-tom', fields: { rating: I(1) }, mask: ['rating'] }),
  false,
)
await check(
  'rating outside 1-5 is rejected',
  call('PATCH', 'reviews/r1_u-maya', {
    uid: 'u-maya',
    createOnly: true,
    fields: reviewFields('u-maya', 'u-tom', 9),
  }),
  false,
)

console.log('messages + notifications')
await check(
  'participant can post in the request thread',
  call('PATCH', 'messages/m1', {
    uid: 'u-tom',
    createOnly: true,
    fields: { requestId: S('r1'), senderId: S('u-tom'), body: S('See you at 6!') },
  }),
  true,
)
await check(
  'stranger cannot post in the thread',
  call('PATCH', 'messages/m2', {
    uid: 'u-leo',
    createOnly: true,
    fields: { requestId: S('r1'), senderId: S('u-leo'), body: S('me too') },
  }),
  false,
)
await check(
  'recipient can read their notification',
  call('GET', 'notifications/n1', { uid: 'u-maya' }),
  true,
)
await check('another user cannot read it', call('GET', 'notifications/n1', { uid: 'u-tom' }), false)

console.log(failures === 0 ? '\nALL RULES CHECKS PASSED' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
