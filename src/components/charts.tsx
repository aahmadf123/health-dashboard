import type { ReactNode } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import dayjs from 'dayjs'
import type { ChartColors } from '../lib/palette'

// Shared time-series chart built to the dataviz mark specs: 2px lines, hairline
// grid, recessive axes, hover tooltip by default, one y-axis per chart.

export interface SeriesDef {
  key: string
  name: string
  color: string
  /** 'line' (default), 'dots' (readings only), or 'step' (dose changes). */
  style?: 'line' | 'dots' | 'step'
}

export interface BandDef {
  from: number
  to: number
  color: string
}

export interface TrendPoint {
  t: number
  [key: string]: number | null | undefined
}

interface TrendChartProps {
  points: TrendPoint[]
  series: SeriesDef[]
  colors: ChartColors
  unit?: string
  goal?: { value: number; label: string } | null
  bands?: BandDef[]
  /** Extra values the y-domain must cover (e.g. a reference range). */
  includeInDomain?: number[]
  height?: number
  yDecimals?: number
  connectNulls?: boolean
}

function niceDomain(values: number[], pad = 0.08): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return [min - 1, max + 1]
  const span = max - min
  let lo = min - span * pad
  // Padding must not push the axis below zero for all-positive data.
  if (min >= 0 && lo < 0) lo = 0
  return [lo, max + span * pad]
}

function ChartTooltip({
  active,
  payload,
  label,
  colors,
  unit,
  yDecimals,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: number
  colors: ChartColors
  unit?: string
  yDecimals: number
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-sm"
      style={{ background: colors.surface, borderColor: colors.grid, color: colors.ink }}
    >
      <div className="mb-1 font-medium" style={{ color: colors.ink2 }}>
        {dayjs(label).format(
          dayjs(label).hour() === 0 && dayjs(label).minute() === 0
            ? 'MMM D, YYYY'
            : 'MMM D, YYYY h:mm A'
        )}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">
            {typeof p.value === 'number' ? p.value.toFixed(yDecimals) : p.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

export function TrendChart({
  points,
  series,
  colors,
  unit,
  goal = null,
  bands = [],
  includeInDomain = [],
  height = 260,
  yDecimals = 1,
  connectNulls = true,
}: TrendChartProps) {
  const values: number[] = []
  for (const p of points) {
    for (const s of series) {
      const v = p[s.key]
      if (typeof v === 'number') values.push(v)
    }
  }
  if (goal) values.push(goal.value)
  for (const v of includeInDomain) {
    if (Number.isFinite(v)) values.push(v)
  }
  const [lo, hi] = niceDomain(values)
  // Ticks need enough decimals to stay distinct on a tight domain.
  const tickDecimals = hi - lo < 3 ? 1 : 0
  const clippedBands = bands
    .map((b) => ({ ...b, from: Math.max(b.from, lo), to: Math.min(b.to, hi) }))
    .filter((b) => b.from < b.to)

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={colors.grid} strokeWidth={1} vertical={false} />
          {clippedBands.map((b, i) => (
            <ReferenceArea
              key={i}
              y1={b.from}
              y2={b.to}
              fill={b.color}
              fillOpacity={0.07}
              stroke="none"
            />
          ))}
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={(t: number) => dayjs(t).format('MMM D')}
            stroke={colors.axis}
            tick={{ fill: colors.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: colors.axis }}
            tickMargin={6}
          />
          <YAxis
            width={44}
            domain={[lo, hi]}
            tickFormatter={(v: number) => v.toFixed(tickDecimals)}
            stroke={colors.axis}
            tick={{ fill: colors.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<ChartTooltip colors={colors} unit={unit} yDecimals={yDecimals} />}
            cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
          />
          {goal && (
            <ReferenceLine
              y={goal.value}
              stroke={colors.muted}
              strokeDasharray="5 4"
              label={{
                value: goal.label,
                position: 'insideBottomLeft',
                fill: colors.muted,
                fontSize: 11,
              }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              type={s.style === 'step' ? 'stepAfter' : 'monotone'}
              stroke={s.style === 'dots' ? 'none' : s.color}
              strokeWidth={2}
              dot={
                s.style === 'dots'
                  ? { r: 3, fill: s.color, fillOpacity: 0.45, strokeWidth: 0 }
                  : s.style === 'step'
                    ? { r: 3.5, fill: s.color, strokeWidth: 0 }
                    : points.length <= 40
                      ? { r: 2.5, fill: s.color, strokeWidth: 0 }
                      : false
              }
              activeDot={{ r: 4.5, fill: s.color, stroke: colors.surface, strokeWidth: 2 }}
              connectNulls={connectNulls}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Simple legend row; render only when a chart has 2+ distinct series. */
export function LegendRow({
  items,
  extra,
}: {
  items: Array<{ name: string; color: string }>
  extra?: ReactNode
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
      {items.map((it) => (
        <span key={it.name} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: it.color }}
            aria-hidden
          />
          {it.name}
        </span>
      ))}
      {extra}
    </div>
  )
}
