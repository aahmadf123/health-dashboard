// Verifies the token path that the README documents: with API_TOKEN set on the
// Worker, the app must ask for a token, stop retrying, and then work once one is
// stored. Both sync and the Trends endpoints are covered.
//
//   echo 'API_TOKEN=test-secret-123' > .dev.vars
//   npm run dev
//   node scripts/auth-check.mjs
//
// Remember to delete .dev.vars afterwards, or the rest of the suite will 401.

import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const results = []
const check = (n, p, d='') => { results.push(p); console.log(`${p?'PASS':'FAIL'}  ${n}${d?`  (${d})`:''}`) }

// 1. No token stored: the app must say so rather than retrying forever.
const c1 = await b.newContext()
const p1 = await c1.newPage()
await p1.goto('http://localhost:5173')
await p1.waitForTimeout(4000)
const status1 = await p1.evaluate(() => document.body.innerText)
check('without a token the UI asks for one', /Token needed/i.test(status1),
  status1.match(/Token needed|Sync failed|Offline|Synced/)?.[0] ?? 'no status')

let attempts = 0
p1.on('request', r => { if (r.url().includes('/api/sync')) attempts++ })
await p1.waitForTimeout(5000)
check('a 401 stops the retry loop', attempts === 0, `${attempts} retries in 5s`)

// 2. Token stored before load: sync must succeed.
const c2 = await b.newContext()
await c2.addInitScript(() => localStorage.setItem('health-dashboard-api-token', 'test-secret-123'))
const p2 = await c2.newPage()
await p2.goto('http://localhost:5173')
await p2.waitForTimeout(5000)
const meta = await p2.evaluate(() => localStorage.getItem('health-dashboard-sync-v1'))
check('with a token stored, sync succeeds', !!meta && JSON.parse(meta).lastSyncedAt !== null,
  meta ? `lastSyncedAt=${JSON.parse(meta).lastSyncedAt}` : 'no sidecar')

// 3. Trends endpoints authenticate too (Codex called these out separately).
await p2.click('button:has-text("Trends")')
await p2.waitForTimeout(3000)
const trends = await p2.textContent('main')
check('the Trends tab authenticates as well', !trends.includes('Trends are unavailable'),
  trends.includes('Rollups') ? 'rendered' : 'no rollups card')

await b.close()
const failed = results.filter(r => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed === 0 ? 0 : 1)
