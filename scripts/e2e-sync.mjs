// End-to-end check of the client sync engine in a real browser.
// Focus: the guarantee that a first sync uploads existing browser data rather
// than being overwritten by an empty database, plus round-tripping to a second
// "device" and propagating a delete.

import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'

const SEED = {
  version: 1,
  settings: {
    units: 'lb',
    theme: 'system',
    heightIn: 71,
    goalWeightLb: 250,
    injectionSchedule: { medication: 'Wegovy (semaglutide)', doseMg: 0.5, intervalDays: 7 },
  },
  scale: [
    { id: 'e2e-s1', dateTime: '2026-06-01T07:00:00.000Z', weightLb: 330.2, bodyFatPct: 43.5 },
    { id: 'e2e-s2', dateTime: '2026-06-08T07:00:00.000Z', weightLb: 327.1, bodyFatPct: 43.0 },
    { id: 'e2e-s3', dateTime: '2026-06-15T07:00:00.000Z', weightLb: 324.4, bodyFatPct: 42.6 },
  ],
  vitals: [{ id: 'e2e-v1', dateTime: '2026-06-01T08:00:00.000Z', systolic: 141, diastolic: 90, pulse: 78 }],
  labs: [],
  injections: [{ id: 'e2e-i1', dateTime: '2026-06-01T09:00:00.000Z', medication: 'Wegovy (semaglutide)', doseMg: 0.5, site: 'Abdomen (left)' }],
  measurements: [{ id: 'e2e-m1', date: '2026-06-01', waistIn: 52.5, hipsIn: 55.0, chestIn: 50.0 }],
  sleep: [{ id: 'e2e-sl1', date: '2026-06-02', hours: 6.5, quality: 3 }],
  journal: [{ id: 'e2e-j1', dateTime: '2026-06-01T21:00:00.000Z', tags: ['Nausea'], severity: 2 }],
}

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function waitForSynced(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('health-dashboard-sync-v1')
      if (!raw) return false
      const m = JSON.parse(raw)
      const pending = Object.values(m.dirty).reduce((n, l) => n + l.length, 0)
      return m.lastSyncedAt !== null && pending === 0 && !m.settings.dirty
    },
    undefined,
    { timeout }
  )
  // The sidecar is written synchronously inside the sync, but the pulled data
  // reaches localStorage one React commit later. Let that flush before reading.
  await page.waitForTimeout(600)
}

// This environment ships a pinned Chromium that may not match the version the
// installed Playwright expects, so launch the one that is actually present.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

try {
  // --- Device A: already has data, database is empty for these ids ----------
  const a = await browser.newContext()
  // Seed before any app code runs, which is exactly how a real existing user
  // arrives: data already in localStorage from the old build, and no sync
  // sidecar yet. Seeding after load instead would race the first sync, which
  // rewrites the sidecar and skips the bootstrap path being tested here.
  await a.addInitScript((seed) => {
    if (!localStorage.getItem('health-dashboard-v1')) {
      localStorage.setItem('health-dashboard-v1', JSON.stringify(seed))
    }
  }, SEED)
  const pageA = await a.newPage()
  await pageA.goto(BASE)
  await waitForSynced(pageA)

  const afterA = await pageA.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1'))
  )
  check(
    'seeded data survives the first sync',
    afterA.scale.length === 3 && afterA.vitals.length === 1 && afterA.sleep.length === 1,
    `scale=${afterA.scale.length} vitals=${afterA.vitals.length} sleep=${afterA.sleep.length}`
  )
  check(
    'settings survive the first sync',
    afterA.settings.heightIn === 71 && afterA.settings.goalWeightLb === 250,
    `heightIn=${afterA.settings.heightIn}`
  )

  const premig = await pageA.evaluate(() =>
    localStorage.getItem('health-dashboard-premigration-backup')
  )
  check('a pre-sync backup snapshot was written', !!premig && premig.includes('e2e-s1'))

  // The echo-loop guard: a settled device must not keep re-dirtying rows.
  const metaA1 = await pageA.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-sync-v1'))
  )
  await pageA.waitForTimeout(2500)
  const metaA2 = await pageA.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-sync-v1'))
  )
  const pendingAfterIdle = Object.values(metaA2.dirty).reduce((n, l) => n + l.length, 0)
  check(
    'no echo loop: an idle synced device stays at zero pending',
    pendingAfterIdle === 0 && !metaA2.settings.dirty,
    `pending=${pendingAfterIdle}`
  )
  check(
    'cursor advanced past zero',
    metaA1.cursor > 0,
    `cursor=${metaA1.cursor}`
  )

  // --- Device B: empty browser, should download everything -----------------
  const b = await browser.newContext()
  const pageB = await b.newPage()
  await pageB.goto(BASE)
  await waitForSynced(pageB)

  const afterB = await pageB.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1'))
  )
  check(
    'a fresh device downloads the full history',
    afterB.scale.length >= 3 && afterB.vitals.length >= 1 && afterB.journal.length >= 1,
    `scale=${afterB.scale.length} vitals=${afterB.vitals.length} journal=${afterB.journal.length}`
  )
  check(
    'settings reach the fresh device',
    afterB.settings.heightIn === 71,
    `heightIn=${afterB.settings.heightIn}`
  )
  check(
    'journal tags round-trip as an array',
    Array.isArray(afterB.journal.find((j) => j.id === 'e2e-j1')?.tags) &&
      afterB.journal.find((j) => j.id === 'e2e-j1').tags[0] === 'Nausea'
  )

  // --- An entry logged on B reaches A --------------------------------------
  // Driven through the real UI. Writing to localStorage directly and reloading
  // would bypass update(), which is where the change diff runs, so nothing
  // would ever be marked dirty.
  const sleepCount = (page) =>
    page.evaluate(() => JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.length)

  await pageB.click('button:has-text("Sleep")')
  await pageB.fill('input[type="date"]', '2026-06-20')
  await pageB.fill('input[placeholder="7.5"]', '7.25')
  await pageB.click('button:has-text("Log night")')
  await waitForSynced(pageB)
  check('the entry logged on device B was saved locally', (await sleepCount(pageB)) === 2)

  await pageA.reload()
  await waitForSynced(pageA)
  const aGotB = await pageA.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.some(
      (s) => s.date === '2026-06-20'
    )
  )
  check('an entry logged on device B reaches device A', aGotB, `A has ${await sleepCount(pageA)} nights`)

  // --- A delete on A reaches B ---------------------------------------------
  await pageA.click('button:has-text("Sleep")')
  // DeleteButton is a two-tap confirm: the first tap arms it.
  await pageA.click('table button:has-text("Delete")')
  await pageA.click('table button:has-text("Confirm")')
  await waitForSynced(pageA)
  check('the delete took effect on device A', (await sleepCount(pageA)) === 1)

  await pageB.reload()
  await waitForSynced(pageB)
  check(
    'a delete on device A removes the row on device B',
    (await sleepCount(pageB)) === 1,
    `B has ${await sleepCount(pageB)} nights`
  )

  // A resurrection check: the deleted row must not come back on the next pull.
  await pageA.reload()
  await waitForSynced(pageA)
  check('the deleted row does not resurrect on a later pull', (await sleepCount(pageA)) === 1)

  // --- Offline: the app keeps working and catches up on reconnect ----------
  await a.setOffline(true)
  await pageA.click('button:has-text("Sleep")')
  await pageA.fill('input[type="date"]', '2026-06-25')
  await pageA.fill('input[placeholder="7.5"]', '6.75')
  await pageA.click('button:has-text("Log night")')
  await pageA.waitForTimeout(1500)

  const offlineSaved = await pageA.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.some(
      (s) => s.date === '2026-06-25'
    )
  )
  check('an entry logged while offline is still saved locally', offlineSaved)

  const offlinePending = await pageA.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('health-dashboard-sync-v1'))
    return Object.values(m.dirty).reduce((n, l) => n + l.length, 0)
  })
  check('the offline entry is queued for upload', offlinePending > 0, `pending=${offlinePending}`)

  await a.setOffline(false)
  await pageA.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitForSynced(pageA)

  await pageB.reload()
  await waitForSynced(pageB)
  const bGotOffline = await pageB.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.some(
      (s) => s.date === '2026-06-25'
    )
  )
  check('the queued entry syncs once the network returns', bGotOffline)

  // --- An edit made while a sync is in flight must survive ------------------
  // Regression: runSync used to merge the response into the snapshot it was
  // built from, so an entry submitted during the round trip lost its dirty
  // marker (never uploaded) and could be wiped off screen by the merge.
  const c = await browser.newContext()
  const pageC = await c.newPage()
  await pageC.goto(BASE)
  await waitForSynced(pageC)
  const beforeCount = await sleepCount(pageC)

  // Hold the next /api/sync open so an edit lands mid-request.
  let release = () => {}
  const held = new Promise((resolve) => {
    release = resolve
  })
  let heldOnce = false
  await pageC.route('**/api/sync', async (route) => {
    if (!heldOnce) {
      heldOnce = true
      await held
    }
    await route.continue()
  })

  // Kick off a sync, then submit an entry while it is stuck in flight.
  await pageC.click('button:has-text("Data")')
  await pageC.click('button:has-text("Sync now")')
  await pageC.waitForTimeout(400)

  await pageC.click('button:has-text("Sleep")')
  await pageC.fill('input[type="date"]', '2026-07-04')
  await pageC.fill('input[placeholder="7.5"]', '8.25')
  await pageC.click('button:has-text("Log night")')
  await pageC.waitForTimeout(300)

  // Also land a remote change, so the held response carries one. Without this
  // the merge has nothing to write back and the on-screen half of the bug stays
  // hidden: it only bites when applyPull actually replaces the data.
  await pageB.click('button:has-text("Sleep")')
  await pageB.fill('input[type="date"]', '2026-07-05')
  await pageB.fill('input[placeholder="7.5"]', '5.5')
  await pageB.click('button:has-text("Log night")')
  await waitForSynced(pageB)

  release()
  await pageC.waitForTimeout(1500)
  await pageC.unroute('**/api/sync')

  const survivedOnScreen = await pageC.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.some(
      (s) => s.date === '2026-07-04'
    )
  )
  check(
    'an entry submitted during a sync round trip is not wiped',
    survivedOnScreen,
    `${beforeCount} -> ${await sleepCount(pageC)} nights`
  )

  await waitForSynced(pageC)
  await pageB.reload()
  await waitForSynced(pageB)
  const reachedB = await pageB.evaluate(() =>
    JSON.parse(localStorage.getItem('health-dashboard-v1')).sleep.some(
      (s) => s.date === '2026-07-04'
    )
  )
  check('that entry still uploads rather than being silently dropped', reachedB)

  // --- The Trends tab renders from the server ------------------------------
  await pageA.click('button:has-text("Trends")')
  await pageA.waitForTimeout(2500)
  const trendsText = await pageA.textContent('main')
  check(
    'the Trends tab renders server rollups',
    trendsText.includes('Rollups') && !trendsText.includes('Trends are unavailable'),
    trendsText.includes('Not enough data') ? 'showed the empty state' : 'chart rendered'
  )
  check(
    'the weight rate-of-change tile has a value',
    /-?\d+(\.\d+)?\s*lb\/wk/.test(trendsText),
    trendsText.match(/-?\d+(\.\d+)?\s*lb\/wk/)?.[0] ?? 'no slope shown'
  )
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
