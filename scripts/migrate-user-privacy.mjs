/**
 * Move private profile fields off the public users/{uid} doc
 * (privacy split, Workstream C).
 *
 * The sensitive fields — phone, email, blockedUserIds and the precise
 * homeLocation — move to users/{uid}/private/data, which the Firestore
 * rules make readable by the owner (and admins) and writable only by
 * the owner. Everything else on the public doc (name, city/area,
 * verification flags, stats, badges, role, …) is left untouched.
 *
 * Safety rails:
 *   - DRY RUN by default: prints exactly which user docs carry which
 *     private fields and what would move — field NAMES and counts
 *     only, never the values (no phone numbers or emails are printed).
 *   - Pass --apply to actually write. There is no undo for the public
 *     doc field deletes (the values survive in the private doc).
 *   - Idempotent: safe to re-run. Users with nothing left to move are
 *     skipped, and the private doc is written with merge, so a partial
 *     earlier run converges instead of duplicating or clobbering.
 *   - Uses the service-account key at
 *     ~/.config/neighbormart/service-account.json (never committed,
 *     never printed). The Admin SDK bypasses Security Rules.
 *
 * Order of operations per user (on --apply): write the private doc
 * FIRST, then delete the fields from the public doc — a crash mid-user
 * leaves the data duplicated (safe, clients prefer the private doc),
 * never lost.
 *
 * Usage:
 *   node scripts/migrate-user-privacy.mjs           # dry run
 *   node scripts/migrate-user-privacy.mjs --apply   # really migrate
 */
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')
const sa = JSON.parse(
  readFileSync(process.env.HOME + '/.config/neighbormart/service-account.json', 'utf8'),
)
initializeApp({ credential: cert(sa) })
const db = getFirestore()

/** The exact private field list — keep in sync with firestore.rules
 *  (privateDataValid) and the client workstream's split shape. */
const PRIVATE_FIELDS = ['phone', 'email', 'blockedUserIds', 'homeLocation']

const snap = await db.collection('users').get()
console.log(
  `${apply ? 'APPLY' : 'DRY RUN'} — scanning ${snap.size} user docs for private fields ` +
    `(${PRIVATE_FIELDS.join(', ')}) …\n`,
)

let scanned = 0
let toMove = 0
let skipped = 0
let alreadyPrivate = 0
const fieldCounts = Object.fromEntries(PRIVATE_FIELDS.map((f) => [f, 0]))

for (const docSnap of snap.docs) {
  scanned += 1
  const data = docSnap.data()
  // A field counts as present when the key exists with a defined value
  // (seed/live writers strip undefined, so this matches stored data).
  const present = PRIVATE_FIELDS.filter((f) => data[f] !== undefined)
  const privateRef = docSnap.ref.collection('private').doc('data')
  const privateSnap = await privateRef.get()
  if (privateSnap.exists) alreadyPrivate += 1

  if (present.length === 0) {
    skipped += 1
    console.log(
      `  skip  ${docSnap.id} — nothing to move` +
        (privateSnap.exists ? ' (private doc already exists)' : ''),
    )
    continue
  }

  toMove += 1
  for (const f of present) fieldCounts[f] += 1
  console.log(
    `  ${apply ? 'move ' : 'would move'}  ${docSnap.id} — fields: ${present.join(', ')}` +
      (privateSnap.exists ? ' (private doc exists — will merge)' : ''),
  )
  if (!apply) continue

  const moved = {}
  for (const f of present) moved[f] = data[f]
  await privateRef.set(moved, { merge: true })
  const deletes = {}
  for (const f of present) deletes[f] = FieldValue.delete()
  await docSnap.ref.update(deletes)
}

console.log('\nSummary:')
console.log(`  user docs scanned:        ${scanned}`)
console.log(`  docs with a private doc:  ${alreadyPrivate}`)
console.log(`  docs ${apply ? 'migrated' : 'to migrate'}:         ${toMove}`)
console.log(`  docs skipped (clean):     ${skipped}`)
console.log('  field counts (docs carrying each field):')
for (const f of PRIVATE_FIELDS) console.log(`    ${f}: ${fieldCounts[f]}`)
if (!apply) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to migrate.')
}
process.exit(0)
