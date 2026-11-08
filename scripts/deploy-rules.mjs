/**
 * Deploy firestore.rules via the Firebase Rules REST API.
 *
 * Why this exists: firebase-tools rejects service-account auth on this
 * setup, but the Rules REST API accepts it (same pattern as
 * deploy-hosting.mjs). One command:  node scripts/deploy-rules.mjs
 *
 * Uses the service-account key at ~/.config/neighbormart/service-account.json
 * (never committed). Creates a new ruleset from firestore.rules and
 * points the cloud.firestore release at it. Rules take about a minute
 * to propagate.
 */
import { readFileSync } from 'node:fs'

const PROJECT = 'neighbormart-7eff0'
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

const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
const ruleset = await api(
  'POST',
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
  {
    source: {
      files: [{ name: 'firestore.rules', content: source }],
    },
  },
)
console.log('Ruleset created:', ruleset.name)

const releaseName = `projects/${PROJECT}/releases/cloud.firestore`
try {
  const updated = await api('PATCH', `https://firebaserules.googleapis.com/v1/${releaseName}`, {
    release: { name: releaseName, rulesetName: ruleset.name },
  })
  console.log('Release updated:', updated.rulesetName)
} catch (e) {
  // First deploy for a project may need a create instead of an update.
  const created = await api('POST', `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`, {
    name: releaseName,
    rulesetName: ruleset.name,
  })
  console.log('Release created:', created.rulesetName)
}
console.log('Done — allow ~60s for propagation.')
