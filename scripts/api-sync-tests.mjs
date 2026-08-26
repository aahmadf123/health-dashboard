// Direct API assertions for sync invariants that are hard to drive from the UI:
// conflict resolution between two devices, and tombstone handling at the edges.
//
// Run against a dev server: npm run dev, then node scripts/api-sync-tests.mjs

const BASE = process.env.BASE ?? 'http://localhost:5173'
const FUTURE = 9999999999999 // a cursor past everything, so pulls return nothing

const results = []
function check(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function sync(body) {
  const res = await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, since: FUTURE, changes: {}, ...body }),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function pullAll() {
  const res = await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, since: 0, changes: {} }),
  })
  return res.json()
}

const panel = (id, updatedAt, markers, extra = {}) => ({
  id,
  date: '2026-07-15',
  source: 'Rythm',
  updatedAt,
  deletedAt: null,
  markers,
  ...extra,
})

const marker = (name, value) => ({
  name,
  value,
  valueText: String(value),
  unit: '%',
  refLow: 4,
  refHigh: 5.6,
  status: 'unknown',
})

// --- A stale panel write must not touch the newer panel's markers -----------
// Regression: the marker delete and inserts used to run unconditionally, so a
// stale device replaced a newer panel's markers while the panel row itself
// correctly kept the newer version.
await sync({ changes: { labs: [panel('t-p1', 200, [marker('HbA1c', 5.9)])] } })
await sync({ changes: { labs: [panel('t-p1', 100, [marker('Glucose', 99)])] } })

let all = await pullAll()
let p1 = (all.changes.labs ?? []).find((p) => p.id === 't-p1')
check(
  'a stale panel write leaves the newer markers alone',
  p1?.markers?.length === 1 && p1.markers[0].name === 'HbA1c',
  `markers=${JSON.stringify(p1?.markers?.map((m) => m.name))}`
)

// --- A stale tombstone must not strip a live panel's markers ---------------
// Regression: the unconditional delete ran even when the tombstone lost, so a
// panel that stayed live lost every marker permanently.
await sync({ changes: { labs: [panel('t-p2', 200, [marker('Ferritin', 120)])] } })
await sync({
  changes: { labs: [{ id: 't-p2', updatedAt: 100, deletedAt: 100 }] },
})

all = await pullAll()
const p2 = (all.changes.labs ?? []).find((p) => p.id === 't-p2')
check(
  'a stale tombstone leaves a live panel intact',
  p2 && !p2.deletedAt && p2.markers?.length === 1,
  `deleted=${!!p2?.deletedAt} markers=${p2?.markers?.length}`
)

// --- A winning tombstone still deletes ------------------------------------
await sync({ changes: { labs: [{ id: 't-p2', updatedAt: 300, deletedAt: 300 }] } })
all = await pullAll()
const p2after = (all.changes.labs ?? []).find((p) => p.id === 't-p2')
check('a newer tombstone does delete the panel', !!p2after?.deletedAt)

// --- deletedAt: 0 is a legal epoch and must read as a tombstone ------------
// Regression: truthiness checks treated 0 as "live", so such a row was routed
// through payload validation and rejected instead of deleting.
await sync({
  changes: {
    scale: [
      {
        id: 't-s1',
        dateTime: '2026-08-01T07:00:00.000Z',
        weightLb: 300,
        updatedAt: 100,
        deletedAt: null,
      },
    ],
  },
})
const zero = await sync({
  changes: { scale: [{ id: 't-s1', updatedAt: 200, deletedAt: 0 }] },
})
check(
  'deletedAt: 0 is accepted as a tombstone, not rejected as a bad row',
  zero.rejected.length === 0 && (zero.applied.scale ?? []).includes('t-s1'),
  `rejected=${JSON.stringify(zero.rejected)}`
)

all = await pullAll()
const s1 = (all.changes.scale ?? []).find((r) => r.id === 't-s1')
check(
  'a deletedAt: 0 row comes back marked deleted',
  s1 !== undefined && s1.deletedAt === 0,
  `deletedAt=${s1?.deletedAt}`
)

// --- Marker status is whitelisted -----------------------------------------
let badStatusRejected = false
try {
  await sync({
    changes: {
      labs: [
        panel('t-p3', 400, [{ ...marker('X', 1), status: 'totally-made-up' }]),
      ],
    },
  })
} catch (err) {
  badStatusRejected = String(err).includes('400')
}
check('an unknown marker status is rejected', badStatusRejected)

// --- An unparseable `from` is a 400, not a NaN bind ------------------------
const badFrom = await fetch(`${BASE}/api/trends/rollup?metric=weight&from=not-a-date`)
check('an unparseable from is rejected', badFrom.status === 400, `status=${badFrom.status}`)

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
