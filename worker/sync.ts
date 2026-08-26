// POST /api/sync: push local changes and pull server changes in one round trip.
//
// The pull cursor tracks server_seen_at, never updated_at. Using updated_at
// would mean a device whose clock runs slow writes rows stamped in the past,
// which another device's cursor has already passed, so those rows would never
// be delivered to it.

import { COLLECTIONS } from '../src/lib/collections'
import type { CollectionKey } from '../src/lib/collections'
import type {
  RejectedRow,
  RowsByCollection,
  SyncRequest,
  SyncResponse,
  SyncRow,
} from '../src/lib/sync-types'
import type { LabMarker } from '../src/lib/model'
import { SYNC_SCHEMA_VERSION } from '../src/lib/sync-types'
import {
  DELETE_MARKERS_SQL,
  INSERT_MARKER_SQL,
  UPSERT_SETTINGS_SQL,
  dbRowToMarker,
  dbRowToSettings,
  dbRowToSync,
  markerBindings,
  rowToBindings,
  settingsBindings,
  upsertSql,
} from './db'

/** Rows returned per collection per pull before the response is truncated. */
const PULL_LIMIT = 2000

/**
 * The cursor is held this far behind the read, so a push that commits just
 * after the pull's SELECT is still redelivered next time. Redelivery is free
 * because the client merge is idempotent; a missed row would not be.
 */
const CURSOR_LAG_MS = 1000

/** Statements per D1 batch. Each batch is one transaction. */
const BATCH_SIZE = 50

export async function handleSync(req: SyncRequest, db: D1Database): Promise<SyncResponse> {
  const now = Date.now()
  const { applied, settingsApplied, rejected } = await applyChanges(req, db, now)
  const pull = await readChanges(db, req.since, now)
  const settings = await readSettings(db, req.since)

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    cursor: pull.cursor,
    complete: pull.complete,
    changes: pull.changes,
    settings,
    applied,
    settingsApplied,
    rejected,
  }
}

// -- Push --------------------------------------------------------------------

async function applyChanges(
  req: SyncRequest,
  db: D1Database,
  now: number
): Promise<{
  applied: Partial<Record<CollectionKey, string[]>>
  settingsApplied: boolean
  rejected: RejectedRow[]
}> {
  const statements: D1PreparedStatement[] = []
  const rejected: RejectedRow[] = []
  // Which collection each RETURNING-bearing statement belongs to, so the
  // results can be attributed back after the batch runs.
  const owners: Array<CollectionKey | null> = []

  for (const def of COLLECTIONS) {
    const rows = req.changes[def.key]
    if (!rows?.length) continue
    const upsert = db.prepare(upsertSql(def))

    for (const row of rows) {
      // A live row must satisfy the table's CHECK constraints. Catching that
      // here rejects the one bad row instead of failing the whole transaction.
      const problem = rowProblem(def.key, row)
      if (problem) {
        rejected.push({ collection: def.key, id: row.id, reason: problem })
        continue
      }

      statements.push(upsert.bind(...rowToBindings(def, row, now)))
      owners.push(def.key)

        if (row.deletedAt === null || row.deletedAt === undefined) {
          const insert = db.prepare(INSERT_MARKER_SQL)
          for (const m of markers) {
            statements.push(insert.bind(...markerBindings(row.id, m)))
            owners.push(null)
          }
        }
      }
    }
  }

  let settingsIndex = -1
  if (req.settings) {
    settingsIndex = statements.length
    statements.push(db.prepare(UPSERT_SETTINGS_SQL).bind(...settingsBindings(req.settings, now)))
    owners.push(null)
  }

  const applied: Partial<Record<CollectionKey, string[]>> = {}
  if (statements.length === 0) return { applied, settingsApplied: false, rejected }

  // Chunked so one oversized first upload does not become one giant
  // transaction. Each chunk lands or rolls back whole, which is what makes the
  // client's retry safe.
  const results: D1Result[] = []
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = await db.batch(statements.slice(i, i + BATCH_SIZE))
    results.push(...chunk)
  }

  results.forEach((res, i) => {
    const owner = owners[i]
    if (!owner) return
    // RETURNING yields a row only when the upsert's newer-than guard passed, so
    // an empty result means the server copy already won.
    const written = (res.results as Array<{ id: string }> | undefined) ?? []
    if (written.length === 0) return
    const list = applied[owner] ?? []
    for (const r of written) list.push(String(r.id))
    applied[owner] = list
  })

  const settingsApplied =
    settingsIndex >= 0 &&
    (((results[settingsIndex]?.results as unknown[] | undefined) ?? []).length > 0)

  return { applied, settingsApplied, rejected }
}

function rowProblem(key: CollectionKey, row: SyncRow): string | null {
  if (row.deletedAt !== null && row.deletedAt !== undefined) return null // tombstones carry no payload
    row[field] === undefined || row[field] === null || row[field] === ''
      ? `${field} is required`
      : null

  switch (key) {
    case 'scale':
      return need('dateTime') ?? need('weightLb') ?? isoProblem(row.dateTime)
    case 'vitals':
      return need('dateTime') ?? need('systolic') ?? need('diastolic') ?? isoProblem(row.dateTime)
    case 'labs':
      return need('date') ?? need('source')
    case 'injections':
      return need('dateTime') ?? need('medication') ?? need('doseMg') ?? isoProblem(row.dateTime)
    case 'measurements':
      return need('date')
    case 'sleep':
      return need('date') ?? need('hours')
    case 'journal':
      return need('dateTime') ?? isoProblem(row.dateTime)
    default:
      return 'unknown collection'
  }
}

/** The derived `ts` column is NOT NULL for live rows, so the ISO must parse. */
function isoProblem(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(Date.parse(v))
    ? null
    : 'dateTime is not a parseable timestamp'
}

// -- Pull --------------------------------------------------------------------

async function readChanges(
  db: D1Database,
  since: number,
  now: number
): Promise<{ changes: RowsByCollection; cursor: number; complete: boolean }> {
  const ceiling = now
  const changes: RowsByCollection = {}

  const results = await Promise.all(
    COLLECTIONS.map((def) =>
      db
        .prepare(
          `SELECT * FROM ${def.table} WHERE server_seen_at > ? AND server_seen_at <= ? ` +
            `ORDER BY server_seen_at, id LIMIT ?`
        )
        .bind(since, ceiling, PULL_LIMIT)
        .all<Record<string, unknown>>()
    )
  )

  let complete = true
  let truncatedAt = Infinity

  COLLECTIONS.forEach((def, i) => {
    const rows = results[i].results ?? []
    if (rows.length > 0) changes[def.key] = rows.map((r) => dbRowToSync(def, r))
    if (rows.length === PULL_LIMIT) {
      complete = false
      const last = Number(rows[rows.length - 1].server_seen_at)
      if (last < truncatedAt) truncatedAt = last
    }
  })

  const panels = changes.labs
  if (panels?.length) await attachMarkers(db, panels)

  const cursor = complete ? Math.max(0, ceiling - CURSOR_LAG_MS) : truncatedAt - 1
  return { changes, cursor, complete }
}

async function attachMarkers(db: D1Database, panels: SyncRow[]): Promise<void> {
  const live = panels.filter((p) => !p.deletedAt)
  if (live.length === 0) return

  const byPanel = new Map<string, LabMarker[]>()
  // Bound the IN list so a large lab history cannot blow the parameter limit.
  for (let i = 0; i < live.length; i += 100) {
    const slice = live.slice(i, i + 100)
    const { results } = await db
      .prepare(
        `SELECT * FROM lab_markers WHERE panel_id IN (${slice.map(() => '?').join(', ')})`
      )
      .bind(...slice.map((p) => p.id))
      .all<Record<string, unknown>>()

    for (const row of results ?? []) {
      const panelId = String(row.panel_id)
      const list = byPanel.get(panelId)
      if (list) list.push(dbRowToMarker(row))
      else byPanel.set(panelId, [dbRowToMarker(row)])
    }
  }
  for (const p of live) p.markers = byPanel.get(p.id) ?? []
}

async function readSettings(db: D1Database, since: number) {
  const row = await db
    .prepare('SELECT * FROM settings WHERE id = 1 AND server_seen_at > ?')
    .bind(since)
    .first<Record<string, unknown>>()
  return row ? dbRowToSettings(row) : null
}
