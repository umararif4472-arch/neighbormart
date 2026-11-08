#!/usr/bin/env node
/**
 * Grant or revoke the NeighborMart admin role (Phase 9, Part B).
 *
 * Admin is the `role: 'admin'` field on the user's Firestore profile
 * doc — the same field the security rules check (`isAdmin()`). Clients
 * can never write their own role (the rules reject role changes), so
 * this script — run with the service account — is the only way in.
 *
 * Usage:
 *   node scripts/grant-admin.mjs --list
 *   node scripts/grant-admin.mjs --email someone@gmail.com
 *   node scripts/grant-admin.mjs --email someone@gmail.com --remove
 *
 * Removing the LAST admin is refused. The service-account key is read
 * from ~/.config/neighbormart/service-account.json and never printed.
 */
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const sa = JSON.parse(
  readFileSync(process.env.HOME + '/.config/neighbormart/service-account.json', 'utf8'),
)
initializeApp({ credential: cert(sa) })
const auth = getAuth()
const db = getFirestore()

const args = process.argv.slice(2)
const email = args[args.indexOf('--email') + 1] ?? null
const remove = args.includes('--remove')
const list = args.includes('--list')

async function admins() {
  const snap = await db.collection('users').where('role', '==', 'admin').get()
  const rows = []
  for (const doc of snap.docs) {
    let mail = doc.data().email ?? ''
    if (!mail) {
      try {
        mail = (await auth.getUser(doc.id)).email ?? ''
      } catch {
        mail = '(unknown)'
      }
    }
    rows.push({ uid: doc.id, email: mail, name: doc.data().name ?? '' })
  }
  return rows
}

if (list) {
  const rows = await admins()
  console.log(rows.length === 0 ? 'No admins yet.' : `Admins (${rows.length}):`)
  for (const r of rows) console.log(`  ${r.email} — ${r.name} (${r.uid})`)
  process.exit(0)
}

if (!email) {
  console.error('Usage: node scripts/grant-admin.mjs --email <email> [--remove] | --list')
  process.exit(1)
}

const user = await auth.getUserByEmail(email).catch(() => null)
if (!user) {
  console.error(
    `No Firebase Auth account for ${email}. They must sign in once at the live site first.`,
  )
  process.exit(1)
}
const ref = db.collection('users').doc(user.uid)
const snap = await ref.get()
if (!snap.exists) {
  console.error(`Auth account exists but no profile doc for uid ${user.uid} — sign in once more.`)
  process.exit(1)
}

if (!remove) {
  await ref.update({ role: 'admin' })
  console.log(`✅ ${email} (${user.uid}) is now an admin.`)
} else {
  const rows = await admins()
  if (rows.length <= 1 && rows.some((r) => r.uid === user.uid)) {
    console.error('Refused: that would remove the LAST admin.')
    process.exit(1)
  }
  await ref.update({ role: FieldValue.delete() })
  console.log(`✅ Admin removed for ${email} (${user.uid}).`)
}
process.exit(0)
