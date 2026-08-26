// Hand-written validators, matching the style of parseBackup in
// src/lib/export.ts. The dashboard runs with no auth, so this is the only thing
// between an arbitrary request and the database. It is deliberately strict:
// unknown collections are rejected, and every string and array is capped.

import { collectionByKey, COLLECTION_KEYS, type CollectionKey } from '../src/lib/collections'
import { SYNC_SCHEMA_VERSION } from '../src/lib/sync-types'
import type { RowsByCollection, SyncRequest, SyncRow } from '../src/lib/sync-types'
import type { LabMarker, Settings } from '../src/lib/model'

export class BadRequest extends Error {}

/** Rows accepted in one request; the client chunks larger pushes. */
export const MAX_ROWS_PER_COLLECTION = 500
export const MAX_MARKERS_PER_PANEL = 500
export const MAX_TAGS = 64
const MAX_ID_LEN = 128
const MAX_TEXT_LEN = 4000
/** Clock skew allowance. A timestamp further ahead than this is clamped down. */
const MAX_FUTURE_MS = 60 * 1000

function asObject(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new BadRequest(`${what} must be an object`)
  }
  return v as Record<string, unknown>
}

function asId(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_ID_LEN) {
    throw new BadRequest('every row needs a string id of 1 to 128 characters')
  }
  return v
}

function asText(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new BadRequest(`${field} must be a string`)
  if (v.length > MAX_TEXT_LEN) throw new BadRequest(`${field} is too long`)
  return v
}

function asNumber(v: unknown, field: string): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) throw new BadRequest(`${field} must be a finite number`)
  return n
}

function asTimestamp(v: unknown, field: string, now: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new BadRequest(`${field} must be an epoch ms number`)
  // Clamp rather than reject: a device an hour ahead should not be able to pin
  // a row as permanently unbeatable, but nor should it fail to sync at all.
  return Math.floor(Math.min(n, now + MAX_FUTURE_MS))
}

function validateRow(key: CollectionKey, raw: unknown, now: number): SyncRow {
  const def = collectionByKey(key)
  if (!def) throw new BadRequest(`unknown collection "${key}"`)
  const obj = asObject(raw, 'row')
  const row: SyncRow = {
    id: asId(obj.id),
    updatedAt: asTimestamp(obj.updatedAt, 'updatedAt', now),
    deletedAt:
      obj.deletedAt === undefined || obj.deletedAt === null
        ? null
        : asTimestamp(obj.deletedAt, 'deletedAt', now),
  }
  // A tombstone carries no payload; validating absent fields would reject it.
  if (row.deletedAt !== null && row.deletedAt !== undefined) return row

  for (const c of def.columns) {
    const v = obj[c.field]
    if (c.type === 'real') {
      row[c.field] = asNumber(v, c.field)
    } else if (c.type === 'json') {
      row[c.field] = validateTags(v)
    } else {
      row[c.field] = asText(v, c.field)
    }
  }
  if (key === 'labs') {
    row.markers = validateMarkers(obj.markers)
  }
  return row
}

function validateTags(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new BadRequest('tags must be an array')
  if (v.length > MAX_TAGS) throw new BadRequest('too many tags')
  return v.map((t) => {
    if (typeof t !== 'string' || t.length > 200) throw new BadRequest('bad tag')
    return t
  })
}

function validateMarkers(v: unknown): LabMarker[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new BadRequest('markers must be an array')
  if (v.length > MAX_MARKERS_PER_PANEL) throw new BadRequest('too many markers in one panel')
  return v.map((raw) => {
    const m = asObject(raw, 'marker')
    const name = asText(m.name, 'marker name')
    if (!name) throw new BadRequest('every marker needs a name')
    return {
      name,
      value: asNumber(m.value, 'marker value'),
      valueText: asText(m.valueText, 'marker valueText') ?? '',
      unit: asText(m.unit, 'marker unit') ?? '',
      refLow: asNumber(m.refLow, 'refLow'),
      refHigh: asNumber(m.refHigh, 'refHigh'),
      status: (asText(m.status, 'status') ?? 'unknown') as LabMarker['status'],
    }
  })
}

function validateRows(raw: unknown, now: number): RowsByCollection {
  const obj = asObject(raw ?? {}, 'changes')
  const out: RowsByCollection = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!COLLECTION_KEYS.includes(key as CollectionKey)) {
      throw new BadRequest(`unknown collection "${key}"`)
    }
    if (!Array.isArray(value)) throw new BadRequest(`changes.${key} must be an array`)
    if (value.length > MAX_ROWS_PER_COLLECTION) {
      throw new BadRequest(`changes.${key} has more than ${MAX_ROWS_PER_COLLECTION} rows`)
    }
    out[key as CollectionKey] = value.map((r) => validateRow(key as CollectionKey, r, now))
  }
  return out
}

function validateSettings(raw: unknown, now: number): (Settings & { updatedAt: number }) | null {
  if (raw === undefined || raw === null) return null
  const s = asObject(raw, 'settings')
  const schedule = asObject(s.injectionSchedule ?? {}, 'injectionSchedule')
  const units = asText(s.units, 'units')
  const theme = asText(s.theme, 'theme')
  if (units !== 'lb' && units !== 'kg') throw new BadRequest('units must be lb or kg')
  if (theme !== 'system' && theme !== 'light' && theme !== 'dark') {
    throw new BadRequest('theme must be system, light or dark')
  }
  return {
    units,
    theme,
    heightIn: asNumber(s.heightIn, 'heightIn'),
    goalWeightLb: asNumber(s.goalWeightLb, 'goalWeightLb'),
    injectionSchedule: {
      medication: asText(schedule.medication, 'medication') ?? '',
      doseMg: asNumber(schedule.doseMg, 'doseMg') ?? 0,
      intervalDays: asNumber(schedule.intervalDays, 'intervalDays') ?? 7,
    },
    updatedAt: asTimestamp(s.updatedAt, 'settings.updatedAt', now),
  }
}

export function validateSyncRequest(raw: unknown, now: number): SyncRequest {
  const body = asObject(raw, 'request body')

  const version = Number(body.schemaVersion ?? 0)
  if (version !== SYNC_SCHEMA_VERSION) {
    throw new BadRequest(
      `unsupported schemaVersion ${version}; this server speaks ${SYNC_SCHEMA_VERSION}`
    )
  }

  const since = Number(body.since ?? 0)
  if (!Number.isFinite(since) || since < 0) throw new BadRequest('since must be an epoch ms number')

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    since: Math.floor(since),
    changes: validateRows(body.changes, now),
    settings: validateSettings(body.settings, now),
  }
}
