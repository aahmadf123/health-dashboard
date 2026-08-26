// Wire format for POST /api/sync, shared by the client and the Worker.

import type { CollectionKey } from './collections'
import type { Settings } from './model'

/** A synced entry: the model fields plus sync metadata. */
export interface SyncRow {
  id: string
  updatedAt: number
  /** Epoch ms when the row was deleted; absent or null while it is live. */
  deletedAt?: number | null
  [field: string]: unknown
}

export type RowsByCollection = Partial<Record<CollectionKey, SyncRow[]>>

/**
 * Bumped whenever the wire format changes incompatibly. A client that sees a
 * version it does not know stops syncing and keeps working from localStorage,
 * rather than merging data it might misread.
 */
export const SYNC_SCHEMA_VERSION = 1

export interface SyncRequest {
  schemaVersion: number
  /** The last cursor the server handed out; 0 on the very first sync. */
  since: number
  /** Rows created or edited locally since then, tombstones included. */
  changes: RowsByCollection
  /** Local settings, when they changed since the last sync. */
  settings?: (Settings & { updatedAt: number }) | null
}

export interface RejectedRow {
  collection: CollectionKey
  id: string
  reason: string
}

export interface SyncResponse {
  schemaVersion: number
  /**
   * Opaque watermark to send as `since` next time. Not a wall clock: it tracks
   * server_seen_at, so a device with a skewed clock cannot hide its rows from
   * the others.
   */
  cursor: number
  /** False when a page was truncated; pull again immediately. */
  complete: boolean
  /** Rows changed on the server since `since`, deletions included. */
  changes: RowsByCollection
  settings?: (Settings & { updatedAt: number }) | null
  /** Ids actually written, by collection. */
  applied: Partial<Record<CollectionKey, string[]>>
  settingsApplied: boolean
  /**
   * Rows the server refused. One bad row must not wedge the sync forever, so
   * the rest of the batch still applies and the client quarantines these.
   */
  rejected: RejectedRow[]
}

export interface RollupBucket {
  /** First day of the bucket, YYYY-MM-DD in the viewer's local time. */
  bucketStart: string
  avg: number
  min: number
  max: number
  n: number
  /** Change in the average from the previous bucket. */
  delta: number | null
  /** Four-bucket trailing mean of the averages. */
  smoothed: number | null
}

export interface RollupResponse {
  metric: string
  label: string
  bucket: 'week' | 'month'
  /** Canonical unit, always lb or in; the client converts for display. */
  unit: string
  buckets: RollupBucket[]
}

export interface TrendsSummary {
  weight: {
    slopeLbPerWeek30d: number | null
    slopeLbPerWeek90d: number | null
    readings30d: number
  }
  bp: {
    avgSystolic30d: number | null
    avgDiastolic30d: number | null
    avgSystolicPrev30d: number | null
    avgDiastolicPrev30d: number | null
    readings30d: number
  }
}

export interface LabMarkerTrendPoint {
  t: number
  date: string
  value: number
  unit: string
  refLow: number | null
  refHigh: number | null
  status: string
}
