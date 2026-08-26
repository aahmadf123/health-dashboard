// The network half of sync: one round trip that pushes local changes and pulls
// server changes, plus the retry and backoff policy around it.

import type { AppData } from './model'
import { apiFetch } from './api'
import { SYNC_SCHEMA_VERSION, type SyncResponse } from './sync-types'
import {
  applyPull,
  applyPushAck,
  buildPush,
  pendingCount,
  type PushPlan,
  type SyncMeta,
} from './sync-meta'

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'outdated'
  | 'unauthorized'

export interface SyncState {
  status: SyncStatus
  pending: number
  lastSyncedAt: number | null
  quarantined: number
  message?: string
}

/** Backoff between failed attempts, in ms. */
const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000, 60000]

export function backoffDelay(failures: number): number {
  return BACKOFF[Math.min(failures, BACKOFF.length - 1)]
}

async function postSync(since: number, body: unknown): Promise<SyncResponse> {
  const res = await apiFetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new SyncError(`sync failed (${res.status})`, res.status, detail, since)
  }
  return (await res.json()) as SyncResponse
}

export class SyncError extends Error {
  // Written out rather than declared as constructor parameter properties,
  // which erasableSyntaxOnly disallows.
  status: number
  detail: string
  since: number

  constructor(message: string, status: number, detail: string, since: number) {
    super(message)
    this.status = status
    this.detail = detail
    this.since = since
  }
}

export interface SyncOutcome {
  data: AppData
  meta: SyncMeta
  /** True when local data was modified by the pull. */
  dataChanged: boolean
  /** True when more work remains: another push chunk or another pull page. */
  more: boolean
}

/**
 * The network half of a sync round: push what is queued, get back what changed.
 *
 * Push before pull matters on a first run: the local rows reach the server
 * before anything is merged in, so the server's newer-than guard resolves any
 * id collision in favour of what is already on this device.
 *
 * This deliberately returns rather than merging. The caller merges the response
 * into whatever state exists once the request has landed, which may not be the
 * state it was built from; see applySyncResult.
 */
export async function pushPull(
  data: AppData,
  meta: SyncMeta
): Promise<{ plan: PushPlan; res: SyncResponse }> {
  const plan = buildPush(data, meta)

  const res = await postSync(meta.cursor, {
    schemaVersion: SYNC_SCHEMA_VERSION,
    since: meta.cursor,
    changes: plan.changes,
    settings: plan.settings,
  })

  if (res.schemaVersion !== SYNC_SCHEMA_VERSION) {
    // The deployed Worker speaks a format this build does not. Merging anyway
    // could misread it, so stop and let the app keep running from localStorage.
    throw new SyncError('schema mismatch', 409, String(res.schemaVersion), meta.cursor)
  }

  return { plan, res }
}

/**
 * Merge a response into the CURRENT data and metadata.
 *
 * The caller must pass the state as it is now, not the snapshot the request was
 * built from. A user can submit an entry while the request is in flight; merging
 * into the snapshot would drop its dirty marker so it never uploaded, and would
 * overwrite the entry itself on screen.
 *
 * Both helpers below already do the right thing once given current state:
 * applyPushAck only clears a dirty id whose stamp still matches what was sent,
 * and applyPull favours local on a timestamp tie.
 */
export function applySyncResult(
  data: AppData,
  meta: SyncMeta,
  plan: PushPlan,
  res: SyncResponse
): SyncOutcome {
  const acked = applyPushAck(meta, plan, res)
  const pulled = applyPull(data, acked, res)

  return {
    data: pulled.data,
    meta: pulled.meta,
    dataChanged: pulled.changed,
    more: plan.more || !res.complete || pendingCount(pulled.meta) > 0,
  }
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}
