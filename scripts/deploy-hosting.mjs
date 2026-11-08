/**
 * Deploy dist/ to Firebase Hosting via the REST API.
 *
 * Why this exists: firebase-tools rejects service-account auth on this
 * setup, but the Hosting REST API accepts it. This is the one-command
 * deploy:  npm run build && node scripts/deploy-hosting.mjs
 *
 * Uses the service-account key at ~/.config/neighbormart/service-account.json
 * (never committed). Deploys firebase.json's hosting config (rewrites +
 * headers) with the files in dist/.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { join, relative } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const SITE = 'neighbormart-7eff0'
const DIST = new URL('../dist', import.meta.url).pathname
const sa = JSON.parse(
  readFileSync(process.env.HOME + '/.config/neighbormart/service-account.json', 'utf8'),
)
initializeApp({ credential: cert(sa) })
void getAuth // (imported so firebase-admin initializes its auth stack)

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

// 1. Collect files + gzipped sha256 hashes (what populateFiles expects).
const files = {}
const gzipped = new Map()
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else {
      const path = '/' + relative(DIST, full)
      const gz = gzipSync(readFileSync(full))
      const hash = createHash('sha256').update(gz).digest('hex')
      files[path] = hash
      gzipped.set(hash, gz)
    }
  }
}
walk(DIST)
console.log(`Files: ${Object.keys(files).length}`)

// 2. Create the version with firebase.json's hosting config.
const firebaseJson = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'))
const hosting = firebaseJson.hosting ?? {}
// Translate firebase.json's shape to the REST API's (glob/path, header maps).
const apiConfig = {
  rewrites: (hosting.rewrites ?? []).map((r) => ({ glob: r.source, path: r.destination })),
  headers: (hosting.headers ?? []).map((h) => ({
    glob: h.source,
    headers: Object.fromEntries((h.headers ?? []).map((kv) => [kv.key, kv.value])),
  })),
}
const version = await api(
  'POST',
  `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/versions`,
  {
    config: apiConfig,
  },
)
console.log('Version:', version.name)

// 3. Populate: learn which files the server still needs, upload those.
const populated = await api(
  'POST',
  `https://firebasehosting.googleapis.com/v1beta1/${version.name}:populateFiles`,
  {
    files,
  },
)
const required = populated.uploadRequiredHashes ?? []
console.log(`Uploading ${required.length} new/changed files…`)
for (const hash of required) {
  const res = await fetch(`${populated.uploadUrl}/${hash}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
    body: gzipped.get(hash),
  })
  if (!res.ok) throw new Error(`upload ${hash} → ${res.status}`)
}

// 4. Finalize + release.
await api(
  'PATCH',
  `https://firebasehosting.googleapis.com/v1beta1/${version.name}?update_mask=status`,
  {
    status: 'FINALIZED',
  },
)
const releaseRes = await fetch(
  `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/releases?versionName=${encodeURIComponent(version.name)}`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  },
)
if (!releaseRes.ok)
  throw new Error(`release → ${releaseRes.status}: ${(await releaseRes.text()).slice(0, 300)}`)
console.log(`Deployed: https://${SITE}.web.app`)
