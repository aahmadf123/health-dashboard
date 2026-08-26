import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { chartColors } from '../../lib/theme'
import { lengthValue, round1, weightValue } from '../../lib/format'
import type { LabMarkerTrendPoint, RollupResponse, TrendsSummary } from '../../lib/sync-types'
import { TrendChart, LegendRow, type TrendPoint } from '../charts'
import { Card, StatTile, EmptyState, inputClass } from '../ui'

// Everything on this tab comes from SQL rollups over the full history in D1,
// rather than from whatever happens to be in this browser. The per-reading
// charts on the other tabs stay as they are, because those must keep working
// offline from localStorage.

const METRICS = [
  { key: 'weight', label: 'Weight' },
  { key: 'bodyFat', label: 'Body fat' },
  { key: 'muscleMass', label: 'Muscle mass' },
  { key: 'systolic', label: 'Systolic' },
  { key: 'diastolic', label: 'Diastolic' },
  { key: 'pulse', label: 'Pulse' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'chest', label: 'Chest' },
  { key: 'sleepHours', label: 'Sleep' },
]

const RANGES = [
  { key: '90d', label: '90 days', days: 90 },
  { key: '1y', label: '1 year', days: 365 },
  { key: 'all', label: 'All', days: 0 },
]

/** The browser's offset, as minutes east of UTC, matching SQLite's modifier. */
function tzMinutes(): number {
  return -new Date().getTimezoneOffset()
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  return (await res.json()) as T
}

export default function TrendsTab({ isDark }: { isDark: boolean }) {
  const { data } = useAppData()
  const colors = chartColors(isDark)
  const units = data.settings.units

  const [metric, setMetric] = useState('weight')
  const [bucket, setBucket] = useState<'week' | 'month'>('week')
  const [range, setRange] = useState('1y')
  const [rollup, setRollup] = useState<RollupResponse | null>(null)
  const [summary, setSummary] = useState<TrendsSummary | null>(null)
  const [markerNames, setMarkerNames] = useState<string[]>([])
  const [marker, setMarker] = useState('')
  const [labPoints, setLabPoints] = useState<LabMarkerTrendPoint[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const days = RANGES.find((r) => r.key === range)?.days ?? 0
      const params = new URLSearchParams({ metric, bucket, tz: String(tzMinutes()) })
      if (days > 0) params.set('from', dayjs().subtract(days, 'day').format('YYYY-MM-DD'))

      const [roll, sum] = await Promise.all([
        getJson<RollupResponse>(`/api/trends/rollup?${params}`),
        getJson<TrendsSummary>('/api/trends/summary'),
      ])
      setRollup(roll)
      setSummary(sum)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load trends')
    } finally {
      setLoading(false)
    }
  }, [metric, bucket, range])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    getJson<{ markers: string[] }>('/api/trends/lab-markers')
      .then((r) => {
        setMarkerNames(r.markers)
        setMarker((m) => m || r.markers[0] || '')
      })
      .catch(() => setMarkerNames([]))
  }, [])

  useEffect(() => {
    if (!marker) return
    getJson<{ points: LabMarkerTrendPoint[] }>(
      `/api/trends/labs?marker=${encodeURIComponent(marker)}`
    )
      .then((r) => setLabPoints(r.points))
      .catch(() => setLabPoints([]))
  }, [marker])

  // Rollups come back in canonical lb and inches, so convert for display the
  // same way every other tab does.
  const convert = useCallback(
    (v: number) => {
      if (!rollup) return v
      if (rollup.unit === 'lb') return weightValue(v, units)
      if (rollup.unit === 'in') return lengthValue(v, units)
      return v
    },
    [rollup, units]
  )

  const displayUnit =
    rollup?.unit === 'lb' ? units : rollup?.unit === 'in' ? (units === 'kg' ? 'cm' : 'in') : rollup?.unit

  const points: TrendPoint[] = useMemo(
    () =>
      (rollup?.buckets ?? []).map((b) => ({
        t: dayjs(b.bucketStart).valueOf(),
        avg: convert(b.avg),
        min: convert(b.min),
        max: convert(b.max),
      })),
    [rollup, convert]
  )

  const series = [
    { key: 'avg', name: 'Average', color: colors.s1 },
    { key: 'min', name: 'Low', color: colors.s3, style: 'dots' as const },
    { key: 'max', name: 'High', color: colors.s2, style: 'dots' as const },
  ]

  const labChartPoints: TrendPoint[] = useMemo(
    () => labPoints.map((p) => ({ t: p.t, value: p.value })),
    [labPoints]
  )

  const labRange = labPoints.length > 0 ? labPoints[labPoints.length - 1] : null
  const labBands =
    labRange && labRange.refLow !== null && labRange.refHigh !== null
      ? [{ from: labRange.refLow, to: labRange.refHigh, color: colors.good }]
      : undefined

  const slope = summary?.weight.slopeLbPerWeek30d
  const slope90 = summary?.weight.slopeLbPerWeek90d
  const bpNow = summary?.bp
  const bpDelta =
    bpNow?.avgSystolic30d != null && bpNow.avgSystolicPrev30d != null
      ? bpNow.avgSystolic30d - bpNow.avgSystolicPrev30d
      : null

  if (error) {
    return (
      <Card title="Trends">
        <EmptyState>
          {error}. These charts are computed on the server, so they need a connection.
          Everything else keeps working offline.
        </EmptyState>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Weight change, last 30 days"
          value={
            slope == null
              ? '--'
              : `${slope > 0 ? '+' : ''}${round1(weightValue(slope, units))} ${units}/wk`
          }
          sub={
            summary ? `From ${summary.weight.readings30d} readings, least-squares fit` : undefined
          }
        />
        <StatTile
          label="Weight change, last 90 days"
          value={
            slope90 == null
              ? '--'
              : `${slope90 > 0 ? '+' : ''}${round1(weightValue(slope90, units))} ${units}/wk`
          }
          sub="Longer window, less noise"
        />
        <StatTile
          label="Blood pressure, 30-day average"
          value={
            bpNow?.avgSystolic30d == null || bpNow.avgDiastolic30d == null
              ? '--'
              : `${Math.round(bpNow.avgSystolic30d)}/${Math.round(bpNow.avgDiastolic30d)}`
          }
          sub={
            bpDelta == null
              ? undefined
              : `${bpDelta > 0 ? '+' : ''}${Math.round(bpDelta)} systolic vs the 30 days before`
          }
        />
      </div>

      <Card
        title="Rollups"
        subtitle="Averaged over your whole history in the database, not just this browser"
        actions={
          <div className="flex flex-wrap gap-2">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className={`${inputClass} w-auto`}
              aria-label="Metric"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as 'week' | 'month')}
              className={`${inputClass} w-auto`}
              aria-label="Bucket size"
            >
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className={`${inputClass} w-auto`}
              aria-label="Range"
            >
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {loading && points.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
        ) : points.length < 2 ? (
          <EmptyState>
            Two or more buckets are needed before a trend means anything. Keep logging and
            this fills in.
          </EmptyState>
        ) : (
          <>
            <TrendChart points={points} series={series} colors={colors} unit={displayUnit} />
            <LegendRow
              items={series.map((s) => ({ name: s.name, color: s.color }))}
              extra={
                <span>
                  {points.length} {bucket === 'week' ? 'weeks' : 'months'}
                </span>
              }
            />
          </>
        )}
      </Card>

      <Card
        title="Lab marker over time"
        subtitle="Every panel in the database, with the reference range shaded"
        actions={
          markerNames.length > 0 ? (
            <select
              value={marker}
              onChange={(e) => setMarker(e.target.value)}
              className={`${inputClass} w-auto`}
              aria-label="Lab marker"
            >
              {markerNames.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {labChartPoints.length < 2 ? (
          <EmptyState>
            Import at least two lab panels from the Data tab to see a marker trend.
          </EmptyState>
        ) : (
          <>
            <TrendChart
              points={labChartPoints}
              series={[{ key: 'value', name: marker, color: colors.s1 }]}
              colors={colors}
              unit={labRange?.unit}
              bands={labBands}
              includeInDomain={
                labRange && labRange.refLow !== null && labRange.refHigh !== null
                  ? [labRange.refLow, labRange.refHigh]
                  : undefined
              }
            />
            <LegendRow
              items={[{ name: marker, color: colors.s1 }]}
              extra={<span>{labChartPoints.length} panels</span>}
            />
          </>
        )}
      </Card>
    </div>
  )
}
