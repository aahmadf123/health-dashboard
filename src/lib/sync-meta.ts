// The sync sidecar: per-entry timestamps, the dirty set and tombstones.
//
// This lives in its own localStorage key rather than inside AppData, for two
// reasons. AppData stays exactly `version: 1`, so loadData(), the backup JSON
// format, parseBackup, mergeBackup and the importer dedupe helpers are all
// untouched. And tombstones need somewhere to live: a deleted entry is gone
// from every AppData array by definition, so its id has no home there.
//
// Everything here is a pure function over plain data, so the tricky parts are
// testable without React or a network.

import type { AppData, Settings } from './model'
import { COLLECTIONS, type CollectionKey } from './collections'
import type { RejectedRow, RowsByCollection, SyncResponse, SyncRow } from './sync-types'

export const SYNC_META_KEY = 'health-dashboard-sync-v1'

/**
 * A one-time snapshot taken before this device first uploads anything, so there
 * is an offline undo for the one moment that feels irreversible. The Data tab
 * offers it for download while it exists.
 */
export const PREMIGRATION_KEY = 'health-dashboard-premigration-backup'

/** Stamps for one entry: updatedAt, and deletedAt once it is a tombstone. */
export interface RowMeta {
  u: number
  d?: number
}

export interface SyncMeta {
  version: 1
  /** Opaque server watermark from the last successful pull. */
  cursor: number
  rows: Record<CollectionKey, Record<string, RowMeta>>
  dirty: Record<CollectionKey, string[]>
  settings: { u: number; dirty: boolean }
  /** Rows the server refused, so the client stops retrying them forever. */
  quarantine: RejectedRow[]
  lastSyncedAt: number | null
}

function emptyByCollection<T>(make: () => T): Record<CollectionKey, T> {
  const out = {} as Record<CollectionKey, T>
  for (const def of COLLECTIONS) out[def.key] = make()
  return out
}

export function emptyMeta(): SyncMeta {
  return {
    version: 1,
    cursor: 0,
    rows: emptyByCollection(() => ({}) as Record<string, RowMeta>),
    dirty: emptyByCollection(() => [] as string[]),
    settings: { u: 0, dirty: false },
    quarantine: [],
    lastSyncedAt: null,
  }
}

function entriesOf(data: AppData, key: CollectionKey): Array<{ id: string }> {
  return (data[key] ?? []) as Array<{ id: string }>
}

/**
 * First run on a device that already has data: stamp everything as locally
 * modified so the first push uploads it all. Combined with the server's
 * newer-than upsert guard, local data wins against anything already in D1 with
 * the same id. This is what makes "deploy, open the app, lose everything"
 * impossible.
 */
export function bootstrapMeta(data: AppData, now: number): SyncMeta {
  const meta = emptyMeta()
  let hasData = false
  for (const def of COLLECTIONS) {
    for (const entry of entriesOf(data, def.key)) {
      meta.rows[def.key][entry.id] = { u: now }
      meta.dirty[def.key].push(entry.id)
      hasData = true
    }
  }

  // Settings are only worth pushing when this device has real data behind them.
  // A brand new device holds nothing but defaults, and stamping those with the
  // current time would make them beat the real settings and wipe the height and
  // goal weight everywhere. Leaving it at 0 lets the server's settings win.
  meta.settings = hasData ? { u: now, dirty: true } : { u: 0, dirty: false }
  return meta
}

/**
 * Diff the previous AppData against the next one and stamp what changed.
 *
 * Every mutation in the app funnels through update() in storage.tsx, and no tab
 * mutates a stored entry in place, so comparing by object identity is enough:
 * a rebuilt entry means an edit, an id that vanished means a delete. That is
 * why none of the nine tabs need to change.
 */
export function diffAndStamp(
  prev: AppData,
  next: AppData,
  meta: SyncMeta,
  now: number
): SyncMeta {
  let changed = false
  const rows = { ...meta.rows }
  const dirty = { ...meta.dirty }

  for (const def of COLLECTIONS) {
    const before = entriesOf(prev, def.key)
    const after = entriesOf(next, def.key)
    if (before === after) continue

    const beforeById = new Map(before.map((e) => [e.id, e]))
    const afterById = new Map(after.map((e) => [e.id, e]))

    const stamps = { ...rows[def.key] }
    const dirtySet = new Set(dirty[def.key])
    let touched = false

    for (const [id, entry] of afterById) {
      if (beforeById.get(id) !== entry) {
        stamps[id] = { u: now }
        dirtySet.add(id)
        touched = true
      }
    }
    for (const id of beforeById.keys()) {
      if (!afterById.has(id)) {
        stamps[id] = { u: now, d: now }
        dirtySet.add(id)
        touched = true
      }
    }

    if (touched) {
      rows[def.key] = stamps
      dirty[def.key] = [...dirtySet]
      changed = true
    }
  }

  // Settings is compared field by field rather than by identity: the Injections
  // tab rebuilds the settings object on every submit even when nothing in it
  // actually changed.
  if (!sameSettings(prev.settings, next.settings)) {
    return { ...meta, rows, dirty, settings: { u: now, dirty: true } }
  }

  return changed ? { ...meta, rows, dirty } : meta
}

function sameSettings(a: Settings, b: Settings): boolean {
  return (
    a.units === b.units &&
    a.theme === b.theme &&
    (a.heightIn ?? null) === (b.heightIn ?? null) &&
    (a.goalWeightLb ?? null) === (b.goalWeightLb ?? null) &&
    a.injectionSchedule.medication === b.injectionSchedule.medication &&
    a.injectionSchedule.doseMg === b.injectionSchedule.doseMg &&
    a.injectionSchedule.intervalDays === b.injectionSchedule.intervalDays
  )
}

// -- Push --------------------------------------------------------------------

/** Rows per push. Keeps a large first upload off the D1 statement limits. */
export const PUSH_CHUNK = 200

export interface PushPlan {
  changes: RowsByCollection
  settings: (Settings & { updatedAt: number }) | null
  /** What was sent, with the stamp it carried, so the ack can be verified. */
  sent: Partial<Record<CollectionKey, Array<[string, number]>>>
  /** True when more dirty rows remain after this chunk. */
  more: boolean
}

export function buildPush(data: AppData, meta: SyncMeta, limit = PUSH_CHUNK): PushPlan {
  const changes: RowsByCollection = {}
  const sent: Partial<Record<CollectionKey, Array<[string, number]>>> = {}
  let budget = limit
  let more = false

  for (const def of COLLECTIONS) {
    const ids = meta.dirty[def.key]
    if (!ids.length) continue
    if (budget <= 0) {
      more = true
      break
    }

    const byId = new Map(entriesOf(data, def.key).map((e) => [e.id, e]))
    const take = ids.slice(0, budget)
    if (take.length < ids.length) more = true
    budget -= take.length

    const rows: SyncRow[] = []
    const record: Array<[string, number]> = []

    for (const id of take) {
      const stamp = meta.rows[def.key][id]
      if (!stamp) continue
      record.push([id, stamp.u])
      if (stamp.d) {
        rows.push({ id, updatedAt: stamp.u, deletedAt: stamp.d })
      } else {
        const entry = byId.get(id)
        // The entry is gone but was never tombstoned; skip rather than guess.
        if (!entry) continue
        rows.push({ ...entry, updatedAt: stamp.u, deletedAt: null })
      }
    }

    if (rows.length) {
      changes[def.key] = rows
      sent[def.key] = record
    }
  }

  const settings = meta.settings.dirty
    ? { ...data.settings, updatedAt: meta.settings.u }
    : null

  return { changes, settings, sent, more }
}

/**
 * Clear dirty ids the server acknowledged, but only where the stamp still
 * matches what was sent. An edit made while the request was in flight keeps its
 * id dirty so the next push carries it.
 */
export function applyPushAck(meta: SyncMeta, plan: PushPlan, res: SyncResponse): SyncMeta {
  const dirty = { ...meta.dirty }
  const rows = { ...meta.rows }

  for (const def of COLLECTIONS) {
    const record = plan.sent[def.key]
    if (!record) continue
    const stampSent = new Map(record)
    // A row the server skipped as older still counts as settled: resending it
    // would be refused again for the same reason.
    const settled = new Set(stampSent.keys())
    const rejectedIds = new Set(
      res.rejected.filter((r) => r.collection === def.key).map((r) => r.id)
    )

    dirty[def.key] = dirty[def.key].filter((id) => {
      if (rejectedIds.has(id)) return false // moved to quarantine below
      if (!settled.has(id)) return true
      return meta.rows[def.key][id]?.u !== stampSent.get(id)
    })

    // Drop tombstone bookkeeping once the server has it, so the sidecar does
    // not grow without bound.
    const stamps = { ...rows[def.key] }
    let pruned = false
    for (const [id] of record) {
      if (stamps[id]?.d && !dirty[def.key].includes(id)) {
        delete stamps[id]
        pruned = true
      }
    }
    if (pruned) rows[def.key] = stamps
  }

  const settings =
    plan.settings && meta.settings.u === plan.settings.updatedAt
      ? { u: meta.settings.u, dirty: false }
      : meta.settings

  const quarantine = res.rejected.length
    ? dedupeQuarantine([...meta.quarantine, ...res.rejected])
    : meta.quarantine

  return { ...meta, rows, dirty, settings, quarantine }
}

function dedupeQuarantine(list: RejectedRow[]): RejectedRow[] {
  const seen = new Map<string, RejectedRow>()
  for (const r of list) seen.set(`${r.collection}:${r.id}`, r)
  return [...seen.values()]
}

// -- Pull --------------------------------------------------------------------

/**
 * Merge the server's changes into local data.
 *
 * Two rules here are the whole safety story, and neither may ever be relaxed:
 *
 *   1. This never clears an array and never assigns over AppData. It only
 *      applies row-level inserts, replacements and removals.
 *   2. A row that is merely absent from the response never deletes anything.
 *      Local rows are removed only in response to an explicit tombstone.
 *
 * Together they mean an empty database answering a first pull produces exactly
 * zero mutations, so the existing browser data cannot be wiped by syncing.
 */
export function applyPull(
  data: AppData,
  meta: SyncMeta,
  res: SyncResponse
): { data: AppData; meta: SyncMeta; changed: boolean } {
  let nextData = data
  const rows = { ...meta.rows }
  const dirty = { ...meta.dirty }
  let changed = false

  for (const def of COLLECTIONS) {
    const incoming = res.changes[def.key]
    if (!incoming?.length) continue

    const current = entriesOf(nextData, def.key)
    const byId = new Map(current.map((e) => [e.id, e]))
    const stamps = { ...rows[def.key] }
    const dirtySet = new Set(dirty[def.key])
    let touched = false

    for (const row of incoming) {
      const local = stamps[row.id]
      // Ties favour local, which stops a row this device just pushed from
      // bouncing straight back in and being re-marked dirty.
      if (local && local.u >= row.updatedAt) continue

      if (row.deletedAt) {
        if (byId.delete(row.id)) touched = true
        delete stamps[row.id]
        dirtySet.delete(row.id)
      } else {
        const { updatedAt: _u, deletedAt: _d, ...entry } = row
        byId.set(row.id, entry as { id: string })
        stamps[row.id] = { u: row.updatedAt }
        dirtySet.delete(row.id)
        touched = true
      }
    }

    if (touched) {
      const sorted = [...byId.values()].sort((a, b) =>
        String((a as Record<string, unknown>)[def.dateField] ?? '').localeCompare(
          String((b as Record<string, unknown>)[def.dateField] ?? '')
        )
      )
      nextData = { ...nextData, [def.key]: sorted }
      rows[def.key] = stamps
      dirty[def.key] = [...dirtySet]
      changed = true
    }
  }

  let settings = meta.settings
  if (res.settings && res.settings.updatedAt > meta.settings.u) {
    const { updatedAt, ...rest } = res.settings
    nextData = { ...nextData, settings: rest }
    settings = { u: updatedAt, dirty: false }
    changed = true
  }

  return {
    data: nextData,
    meta: { ...meta, rows, dirty, settings, cursor: res.cursor, lastSyncedAt: Date.now() },
    changed,
  }
}

// -- Persistence -------------------------------------------------------------

export function loadMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SyncMeta
    if (parsed?.version !== 1) return null
    const base = emptyMeta()
    return {
      ...base,
      ...parsed,
      rows: { ...base.rows, ...parsed.rows },
      dirty: { ...base.dirty, ...parsed.dirty },
      settings: { ...base.settings, ...parsed.settings },
      quarantine: parsed.quarantine ?? [],
    }
  } catch {
    return null
  }
}

export function saveMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta))
  } catch (err) {
    console.error('Failed to save sync state', err)
  }
}

export function pendingCount(meta: SyncMeta): number {
  let n = meta.settings.dirty ? 1 : 0
  for (const def of COLLECTIONS) n += meta.dirty[def.key].length
  return n
}
