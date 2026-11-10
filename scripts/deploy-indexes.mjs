/**
 * Create any missing Firestore composite indexes from firestore.indexes.json
 * via the Firestore Admin REST API (same service-account pattern as
 * deploy-rules.mjs — firebase-tools rejects SA auth on this setup).
 *
 * One command:  node scripts/deploy-indexes.mjs
 * Idempotent: indexes that already exist (same field spec) are skipped.
 * Polls each new index until its state is READY (or CREATING after the
 * wait budget — check the Firebase console if so).
 */
import { readFileSync } from 'node:fs'

const PROJECT = 'neighbormart-7eff0'
const DB = `projects/${PROJECT}/databases/(default)`
const sa = JSON.parse(
  readFileSync(process.env.HOME + '/.config/neighbormart/service-account.json', 'utf8'),
)
const { GoogleAuth } = await import('google-auth-library')
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})
const token = await (await auth.getClient()).getAccessToken().then((r) => r.token)
const api = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok)
    throw new Error(`${method} ${url} → ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

const spec = JSON.parse(
  readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
)
const wanted = spec.indexes ?? []
const keyOf = (idx) =>
  idx.fields
    .filter((f) => f.fieldPath !== '__name__') // the API appends __name__ implicitly
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? ''}`)
    .join('|')

// Existing indexes, grouped by collectionGroup.
const existingByGroup = new Map()
for (const idx of wanted) {
  const group = idx.collectionGroup
  if (existingByGroup.has(group)) continue
  const res = await api(
    'GET',
    `https://firestore.googleapis.com/v1/${DB}/collectionGroups/${group}/indexes`,
  )
  existingByGroup.set(group, new Set((res.indexes ?? []).map(keyOf)))
}

const created = []
for (const idx of wanted) {
  const group = idx.collectionGroup
  if (existingByGroup.get(group).has(keyOf(idx))) {
    console.log(`exists:  ${group} [${keyOf(idx)}]`)
    continue
  }
  let res
  try {
    res = await api(
      'POST',
      `https://firestore.googleapis.com/v1/${DB}/collectionGroups/${group}/indexes`,
      { queryScope: idx.queryScope ?? 'COLLECTION', fields: idx.fields },
    )
  } catch (e) {
    if (String(e.message).includes('→ 409')) {
      console.log(`exists (409): ${group} [${keyOf(idx)}]`)
      continue
    }
    throw e
  }
  console.log(`created: ${group} [${keyOf(idx)}] → ${res.name ?? '(operation)'} state=${res.state ?? 'CREATING'}`)
  if (res.name) created.push(res.name)
}

// Poll created indexes until READY (max ~5 min; tiny collections build fast).
const deadline = Date.now() + 5 * 60 * 1000
for (const name of created) {
  let state = 'CREATING'
  while (Date.now() < deadline) {
    const res = await api('GET', `https://firestore.googleapis.com/v1/${name}`)
    state = res.state
    if (state === 'READY') break
    await new Promise((r) => setTimeout(r, 10000))
  }
  console.log(`index ${name.split('/').pop()}: ${state}`)
  if (state !== 'READY') process.exitCode = 2
}
console.log('Done.')
