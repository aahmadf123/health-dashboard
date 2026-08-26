// GET /api/trends: rollups computed in SQL.
//
// This is the work a database earns its keep on. The client can only aggregate
// what it happens to be holding, and its one statistic (a moving average in
// src/lib/stats.ts) is O(n^2). D1 aggregates the whole history and returns a
// few dozen buckets instead of thousands of rows.

import { BadRequest } from './validate'
import type { RollupBucket, RollupResponse, TrendsSummary } from '../src/lib/sync-types'

interface MetricDef {
  table: string
  col: string
  /** 'ts' is epoch ms and needs a timezone shift; 'date' is already local. */
  time: 'ts' | 'date'
  unit: string
  label: string
}

// Frozen whitelist. The column and table are interpolated into SQL, so they
// must never come from user input.
const METRICS: Record<string, MetricDef> = {
  weight: { table: 'scale', col: 'weight_lb', time: 'ts', unit: 'lb', label: 'Weight' },
  bodyFat: { table: 'scale', col: 'body_fat_pct', time: 'ts', unit: '%', label: 'Body fat' },
  muscleMass: {
    table: 'scale',
    col: 'muscle_mass_lb',
    time: 'ts',
    unit: 'lb',
    label: 'Muscle mass',
  },
  systolic: { table: 'vitals', col: 'systolic', time: 'ts', unit: 'mmHg', label: 'Systolic' },
  diastolic: { table: 'vitals', col: 'diastolic', time: 'ts', unit: 'mmHg', label: 'Diastolic' },
  pulse: { table: 'vitals', col: 'pulse', time: 'ts', unit: 'bpm', label: 'Pulse' },
  waist: { table: 'measurements', col: 'waist_in', time: 'date', unit: 'in', label: 'Waist' },
  hips: { table: 'measurements', col: 'hips_in', time: 'date', unit: 'in', label: 'Hips' },
  chest: { table: 'measurements', col: 'chest_in', time: 'date', unit: 'in', label: 'Chest' },
  sleepHours: { table: 'sleep', col: 'hours', time: 'date', unit: 'h', label: 'Sleep' },
}

export const TREND_METRICS = Object.keys(METRICS)

/** Minutes east of UTC, as the browser's getTimezoneOffset inverted. */
function tzModifier(url: URL): string {
  const raw = Number(url.searchParams.get('tz') ?? 0)
  if (!Number.isFinite(raw) || Math.abs(raw) > 16 * 60) return '0 minutes'
  return `${Math.trunc(raw)} minutes`
}

export async function handleRollup(url: URL, db: D1Database): Promise<RollupResponse> {
  const metric = url.searchParams.get('metric') ?? 'weight'
  const def = METRICS[metric]
  if (!def) throw new BadRequest(`unknown metric "${metric}"`)

  const bucketParam = url.searchParams.get('bucket') ?? 'week'
  if (bucketParam !== 'week' && bucketParam !== 'month') {
    throw new BadRequest('bucket must be week or month')
  }

  const binds: Array<string | number> = []
  let localDt: string
  if (def.time === 'ts') {
    // Shift epoch ms into the viewer's local day before bucketing, so a reading
    // at 11pm Sunday lands in the week it felt like, not the next one in UTC.
    localDt = "datetime(ts / 1000, 'unixepoch', ?)"
    binds.push(tzModifier(url))
  } else {
    localDt = 'date'
  }

  // Monday of the containing week: advance to Sunday, then back six days.
  const bucketExpr =
    bucketParam === 'month'
      ? `date(local_dt, 'start of month')`
      : `date(local_dt, 'weekday 0', '-6 days')`

  const where = ['deleted_at IS NULL', `${def.col} IS NOT NULL`]
  const from = url.searchParams.get('from')
  if (from) {
    where.push(def.time === 'ts' ? 'ts >= ?' : 'date >= ?')
    if (def.time === 'ts') {
      const parsed = Date.parse(from)
      if (!Number.isFinite(parsed)) throw new BadRequest('from must be YYYY-MM-DD')
      binds.push(parsed)
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new BadRequest('from must be YYYY-MM-DD')
      binds.push(from)
    }
  }

  const sql =
    `WITH src AS (SELECT ${localDt} AS local_dt, ${def.col} AS v ` +
    `FROM ${def.table} WHERE ${where.join(' AND ')}), ` +
    `bucketed AS (SELECT ${bucketExpr} AS bucket, v FROM src), ` +
    `agg AS (SELECT bucket, AVG(v) AS avg_v, MIN(v) AS min_v, MAX(v) AS max_v, ` +
    `COUNT(*) AS n FROM bucketed GROUP BY bucket) ` +
    `SELECT bucket, avg_v, min_v, max_v, n, ` +
    `avg_v - LAG(avg_v) OVER (ORDER BY bucket) AS delta_prev, ` +
    `AVG(avg_v) OVER (ORDER BY bucket ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS smoothed ` +
    `FROM agg ORDER BY bucket`

  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<Record<string, unknown>>()

  const buckets: RollupBucket[] = (results ?? []).map((r) => ({
    bucketStart: String(r.bucket),
    avg: Number(r.avg_v),
    min: Number(r.min_v),
    max: Number(r.max_v),
    n: Number(r.n),
    delta: r.delta_prev === null || r.delta_prev === undefined ? null : Number(r.delta_prev),
    smoothed: r.smoothed === null || r.smoothed === undefined ? null : Number(r.smoothed),
  }))

  return { metric, label: def.label, bucket: bucketParam, unit: def.unit, buckets }
}

/**
 * Rate of change as a least-squares slope rather than "value now minus value
 * 30 days ago", which the Overview tab approximates today and which is noisy
 * because it reads two single measurements.
 */
export async function handleSummary(db: D1Database): Promise<TrendsSummary> {
  const now = Date.now()
  const day = 86_400_000

  const slope = async (days: number) => {
    const since = now - days * day
    const row = await db
      .prepare(
        'SELECT (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) / ' +
          'NULLIF(COUNT(*) * SUM(x * x) - SUM(x) * SUM(x), 0) * 7.0 AS slope, COUNT(*) AS n ' +
          'FROM (SELECT (ts - ?) / 86400000.0 AS x, weight_lb AS y FROM scale ' +
          'WHERE deleted_at IS NULL AND weight_lb IS NOT NULL AND ts >= ?)'
      )
      .bind(since, since)
      .first<{ slope: number | null; n: number }>()
    return { slope: row?.slope ?? null, n: row?.n ?? 0 }
  }

  const bpWindow = async (fromDays: number, toDays: number) => {
    const row = await db
      .prepare(
        'SELECT AVG(systolic) AS sys, AVG(diastolic) AS dia, COUNT(*) AS n FROM vitals ' +
          'WHERE deleted_at IS NULL AND ts >= ? AND ts < ?'
      )
      .bind(now - fromDays * day, now - toDays * day)
      .first<{ sys: number | null; dia: number | null; n: number }>()
    return { sys: row?.sys ?? null, dia: row?.dia ?? null, n: row?.n ?? 0 }
  }

  const [s30, s90, bpNow, bpPrev] = await Promise.all([
    slope(30),
    slope(90),
    bpWindow(30, 0),
    bpWindow(60, 30),
  ])

  return {
    weight: {
      slopeLbPerWeek30d: s30.slope,
      slopeLbPerWeek90d: s90.slope,
      readings30d: s30.n,
    },
    bp: {
      avgSystolic30d: bpNow.sys,
      avgDiastolic30d: bpNow.dia,
      avgSystolicPrev30d: bpPrev.sys,
      avgDiastolicPrev30d: bpPrev.dia,
      readings30d: bpNow.n,
    },
  }
}

/**
 * One lab marker across every panel. The Labs tab builds this today by scanning
 * every panel client-side; the normalized lab_markers table makes it a single
 * indexed query over the whole history.
 */
export async function handleLabTrend(url: URL, db: D1Database) {
  const marker = url.searchParams.get('marker')
  if (!marker) throw new BadRequest('marker is required')

  const { results } = await db
    .prepare(
      'SELECT p.date AS date, m.value AS value, m.unit AS unit, m.ref_low AS ref_low, ' +
        'm.ref_high AS ref_high, m.status AS status ' +
        'FROM lab_markers m JOIN labs p ON p.id = m.panel_id ' +
        'WHERE m.name = ? AND p.deleted_at IS NULL AND m.value IS NOT NULL ORDER BY p.date'
    )
    .bind(marker)
    .all<Record<string, unknown>>()

  return {
    marker,
    points: (results ?? []).map((r) => ({
      t: Date.parse(String(r.date)),
      date: String(r.date),
      value: Number(r.value),
      unit: String(r.unit ?? ''),
      refLow: r.ref_low === null || r.ref_low === undefined ? null : Number(r.ref_low),
      refHigh: r.ref_high === null || r.ref_high === undefined ? null : Number(r.ref_high),
      status: String(r.status),
    })),
  }
}

/** Distinct marker names, for the Trends tab's marker picker. */
export async function handleLabMarkerNames(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      'SELECT DISTINCT m.name AS name FROM lab_markers m JOIN labs p ON p.id = m.panel_id ' +
        'WHERE p.deleted_at IS NULL ORDER BY m.name'
    )
    .all<{ name: string }>()
  return (results ?? []).map((r) => r.name)
}
