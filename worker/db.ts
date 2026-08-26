// Row mapping and SQL generation, driven by the shared COLLECTIONS table so
// each collection is described once rather than hand-written seven times over.
//
// Two clocks, and the difference matters:
//   updated_at      comes from the client and drives last-write-wins.
//                   The Worker never overwrites it.
//   server_seen_at  is stamped by the Worker and drives the pull cursor.

import type { CollectionDef } from '../src/lib/collections'
import type { SyncRow } from '../src/lib/sync-types'
import type { LabMarker, Settings } from '../src/lib/model'

type SqlValue = string | number | null

/** Payload columns, plus the derived `ts` for dateTime collections. */
function payloadColumns(def: CollectionDef): string[] {
  const cols = def.columns.map((c) => c.col)
  return def.timeKind === 'dateTime' ? [...cols, 'ts'] : cols
}

function allColumns(def: CollectionDef): string[] {
  return ['id', ...payloadColumns(def), 'updated_at', 'deleted_at', 'server_seen_at']
}

/**
 * Upsert that only overwrites when the incoming row is strictly newer, which
 * is both the last-write-wins rule and the idempotency guarantee: replaying an
 * identical payload changes nothing, so a retry after a dropped connection
 * cannot corrupt anything. RETURNING id reports what was actually written.
 */
export function upsertSql(def: CollectionDef): string {
  const cols = allColumns(def)
  const placeholders = cols.map(() => '?').join(', ')
  const assignments = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')
  return (
    `INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${placeholders}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${assignments} ` +
    `WHERE excluded.updated_at > ${def.table}.updated_at ` +
    `RETURNING id`
  )
}

/** Bind values for upsertSql, in the same column order. */
export function rowToBindings(def: CollectionDef, row: SyncRow, serverNow: number): SqlValue[] {
  const values: SqlValue[] = [row.id]
  for (const c of def.columns) {
    const v = row[c.field]
    if (v === undefined || v === null || v === '') {
      // undefined is not a legal D1 bind value, and '' only ever means "unset"
      // for the optional text fields in this model.
      values.push(v === '' && c.type === 'text' ? '' : null)
    } else if (c.type === 'real') {
      const n = Number(v)
      values.push(Number.isFinite(n) ? n : null)
    } else if (c.type === 'json') {
      values.push(JSON.stringify(v))
    } else {
      values.push(String(v))
    }
  }
  if (def.timeKind === 'dateTime') {
    const iso = row[def.dateField]
    const ts = typeof iso === 'string' ? Date.parse(iso) : NaN
    values.push(Number.isFinite(ts) ? ts : null)
  }
  values.push(row.updatedAt)
  values.push(row.deletedAt ?? null)
  values.push(serverNow)
  return values
}

/** Turn a D1 result row back into the client-facing shape. */
export function dbRowToSync(def: CollectionDef, dbRow: Record<string, unknown>): SyncRow {
  const deletedAt =
    dbRow.deleted_at === null || dbRow.deleted_at === undefined ? null : Number(dbRow.deleted_at)

  const out: SyncRow = {
    id: String(dbRow.id),
    updatedAt: Number(dbRow.updated_at),
    deletedAt,
  }
  // A tombstone carries no payload, so leave the entry fields off entirely.
  if (deletedAt !== null) return out

  for (const c of def.columns) {
    const v = dbRow[c.col]
    if (v === null || v === undefined) {
      // Optional text fields read back as absent rather than an explicit null,
      // which is how JSON.parse reproduces them and what the model expects.
      if (c.type === 'real') out[c.field] = null
      else if (c.type === 'json') out[c.field] = []
    } else if (c.type === 'json') {
      out[c.field] = safeJsonArray(v)
    } else if (c.type === 'real') {
      out[c.field] = Number(v)
    } else {
      out[c.field] = String(v)
    }
  }
  return out
}

function safeJsonArray(v: unknown): string[] {
  try {
    const parsed = JSON.parse(String(v))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// -- Lab markers -------------------------------------------------------------
// A panel and its markers sync as one unit, matching how the importer's
// mergeLabPanels already treats them, so markers carry no timestamps of their
// own and are replaced wholesale whenever their panel is written.

/**
 * Both marker statements are guarded on the panel upsert having won.
 *
 * The upsert writes `updated_at = <incoming>` only when the incoming row is
 * newer, so comparing the stored value against the incoming one says whether
 * our write landed. Keeping the test in SQL means the guard stays inside the
 * same batch, which is one transaction; reading the winners back first would
 * split it.
 *
 * Without this, a stale device syncing after a newer one would leave the newer
 * panel row intact but replace its markers with stale ones, or, for a stale
 * tombstone, strip every marker from a panel that is still live.
 */
export const DELETE_MARKERS_SQL =
  'DELETE FROM lab_markers WHERE panel_id = ?1 ' +
  'AND EXISTS (SELECT 1 FROM labs WHERE id = ?1 AND updated_at = ?2)'

export const INSERT_MARKER_SQL =
  'INSERT OR REPLACE INTO lab_markers ' +
  '(panel_id, name, value, value_text, unit, ref_low, ref_high, status) ' +
  'SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 ' +
  'WHERE EXISTS (SELECT 1 FROM labs WHERE id = ?1 AND updated_at = ?9)'

export function markerBindings(
  panelId: string,
  m: LabMarker,
  panelUpdatedAt: number
): SqlValue[] {
  return [
    panelId,
    m.name,
    m.value === null || m.value === undefined ? null : Number(m.value),
    m.valueText ?? '',
    m.unit ?? '',
    m.refLow === null || m.refLow === undefined ? null : Number(m.refLow),
    m.refHigh === null || m.refHigh === undefined ? null : Number(m.refHigh),
    m.status ?? 'unknown',
    panelUpdatedAt,
  ]
}

export function dbRowToMarker(dbRow: Record<string, unknown>): LabMarker {
  return {
    name: String(dbRow.name),
    value: dbRow.value === null || dbRow.value === undefined ? null : Number(dbRow.value),
    valueText: String(dbRow.value_text ?? ''),
    unit: String(dbRow.unit ?? ''),
    refLow: dbRow.ref_low === null || dbRow.ref_low === undefined ? null : Number(dbRow.ref_low),
    refHigh:
      dbRow.ref_high === null || dbRow.ref_high === undefined ? null : Number(dbRow.ref_high),
    status: String(dbRow.status ?? 'unknown') as LabMarker['status'],
  }
}

// -- Settings ----------------------------------------------------------------

export const UPSERT_SETTINGS_SQL =
  'INSERT INTO settings (id, units, theme, height_in, goal_weight_lb, ' +
  'schedule_medication, schedule_dose_mg, schedule_interval_days, updated_at, server_seen_at) ' +
  'VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
  'ON CONFLICT(id) DO UPDATE SET units = excluded.units, theme = excluded.theme, ' +
  'height_in = excluded.height_in, goal_weight_lb = excluded.goal_weight_lb, ' +
  'schedule_medication = excluded.schedule_medication, ' +
  'schedule_dose_mg = excluded.schedule_dose_mg, ' +
  'schedule_interval_days = excluded.schedule_interval_days, ' +
  'updated_at = excluded.updated_at, server_seen_at = excluded.server_seen_at ' +
  'WHERE excluded.updated_at > settings.updated_at ' +
  'RETURNING id'

export function settingsBindings(
  s: Settings & { updatedAt: number },
  serverNow: number
): SqlValue[] {
  return [
    s.units,
    s.theme,
    s.heightIn ?? null,
    s.goalWeightLb ?? null,
    s.injectionSchedule.medication,
    s.injectionSchedule.doseMg,
    s.injectionSchedule.intervalDays,
    s.updatedAt,
    serverNow,
  ]
}

export function dbRowToSettings(dbRow: Record<string, unknown>): Settings & { updatedAt: number } {
  return {
    units: String(dbRow.units) as Settings['units'],
    theme: String(dbRow.theme) as Settings['theme'],
    heightIn:
      dbRow.height_in === null || dbRow.height_in === undefined ? null : Number(dbRow.height_in),
    goalWeightLb:
      dbRow.goal_weight_lb === null || dbRow.goal_weight_lb === undefined
        ? null
        : Number(dbRow.goal_weight_lb),
    injectionSchedule: {
      medication: String(dbRow.schedule_medication),
      doseMg: Number(dbRow.schedule_dose_mg),
      intervalDays: Number(dbRow.schedule_interval_days),
    },
    updatedAt: Number(dbRow.updated_at),
  }
}
