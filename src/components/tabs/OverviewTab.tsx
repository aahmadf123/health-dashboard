import { useMemo } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAppData } from '../../lib/storage'
import { bpCategory, bpBadgeClass } from '../../lib/bp'
import { displayWeight, weightValue, round1 } from '../../lib/format'
import { chartColors } from '../../lib/theme'
import { TrendChart, LegendRow, type TrendPoint } from '../charts'
import { Card, Badge, StatTile, EmptyState, Button } from '../ui'
import { movingAverage } from '../../lib/stats'
import type { TabKey } from '../../App'

dayjs.extend(relativeTime)

function delta(nowLb: number, thenLb: number | null): number | null {
  return thenLb === null ? null : nowLb - thenLb
}

function deltaText(d: number | null, units: 'lb' | 'kg'): string {
  if (d === null) return '–'
  const v = round1(weightValue(Math.abs(d), units))
  if (v === 0) return 'no change'
  return `${d < 0 ? '↓' : '↑'} ${v} ${units}`
}

export default function OverviewTab({
  isDark,
  goTo,
}: {
  isDark: boolean
  goTo: (tab: TabKey) => void
}) {
  const { data } = useAppData()
  const colors = chartColors(isDark)
  const units = data.settings.units

  const scaleSorted = useMemo(
    () => [...data.scale].sort((a, b) => a.dateTime.localeCompare(b.dateTime)),
    [data.scale]
  )
  const latest = scaleSorted[scaleSorted.length - 1]
  const first = scaleSorted[0]

  const weightAt = (daysAgo: number): number | null => {
    const cutoff = dayjs().subtract(daysAgo, 'day')
    const before = scaleSorted.filter((e) => !dayjs(e.dateTime).isAfter(cutoff))
    return before.length > 0 ? before[before.length - 1].weightLb : null
  }

  const d7 = latest ? delta(latest.weightLb, weightAt(7)) : null
  const d30 = latest ? delta(latest.weightLb, weightAt(30)) : null
  const total = latest && first && first.id !== latest.id ? latest.weightLb - first.weightLb : null

  const latestVital = useMemo(
    () =>
      [...data.vitals].sort((a, b) => b.dateTime.localeCompare(a.dateTime))[0] ?? null,
    [data.vitals]
  )
  const vitalCat = latestVital ? bpCategory(latestVital.systolic, latestVital.diastolic) : null

  const lastInjection = useMemo(
    () =>
      [...data.injections].sort((a, b) => b.dateTime.localeCompare(a.dateTime))[0] ?? null,
    [data.injections]
  )
  const nextDue = lastInjection
    ? dayjs(lastInjection.dateTime).add(data.settings.injectionSchedule.intervalDays, 'day')
    : null
  const overdue = nextDue ? dayjs().isAfter(nextDue) : false

  const lastPanel = useMemo(
    () => [...data.labs].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
    [data.labs]
  )
  const flagged = lastPanel
    ? lastPanel.markers.filter((m) => m.status === 'outOfRange').length
    : 0

  const ma = useMemo(() => movingAverage(data.scale), [data.scale])
  const weightPoints: TrendPoint[] = useMemo(
    () =>
      scaleSorted.map((e) => ({
        t: dayjs(e.dateTime).valueOf(),
        reading: round1(weightValue(e.weightLb, units)),
        avg: round1(weightValue(ma.get(e.id) ?? e.weightLb, units)),
      })),
    [scaleSorted, ma, units]
  )

  const goalLb = data.settings.goalWeightLb
  const empty =
    data.scale.length === 0 &&
    data.vitals.length === 0 &&
    data.labs.length === 0 &&
    data.injections.length === 0

  return (
    <div className="space-y-4">
      {empty && (
        <Card title="Welcome to your health dashboard">
          <p className="text-sm text-[var(--ink-2)]">
            Everything you track lives only in this browser: weight and body composition,
            blood pressure, blood test results, medication injections, measurements, sleep,
            and a symptom journal. Start by importing your scale export or Rythm results on
            the Data tab, or add a reading by hand on any tab.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => goTo('data')}>Import your data</Button>
            <Button variant="ghost" onClick={() => goTo('weight')}>
              Add a weight reading
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Current weight"
          value={latest ? displayWeight(latest.weightLb, units) : '–'}
          sub={
            latest
              ? `7 days: ${deltaText(d7, units)} · 30 days: ${deltaText(d30, units)}${
                  total !== null ? ` · total: ${deltaText(total, units)}` : ''
                }`
              : 'No readings yet'
          }
        />
        <StatTile
          label="BMI"
          value={latest?.bmi ?? '–'}
          sub={latest ? `As of ${dayjs(latest.dateTime).format('MMM D')}` : undefined}
        />
        <StatTile
          label="Blood pressure"
          value={latestVital ? `${latestVital.systolic}/${latestVital.diastolic}` : '–'}
          sub={
            latestVital && vitalCat ? (
              <span className="flex flex-wrap items-center gap-1">
                <Badge className={bpBadgeClass(vitalCat.key)}>{vitalCat.label}</Badge>
                <span>{dayjs(latestVital.dateTime).format('MMM D')}</span>
              </span>
            ) : (
              'No readings yet'
            )
          }
        />
        <StatTile
          label="Next injection"
          value={
            nextDue ? (
              <span className={overdue ? 'text-red-600 dark:text-red-400' : ''}>
                {nextDue.format('ddd, MMM D')}
              </span>
            ) : (
              '–'
            )
          }
          sub={
            nextDue
              ? `${overdue ? 'Overdue, was due' : 'Due'} ${nextDue.fromNow()} · ${
                  data.settings.injectionSchedule.doseMg
                } mg`
              : 'Not logged yet'
          }
          subClass={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}
        />
      </div>

      {weightPoints.length > 1 ? (
        <Card
          title={`Weight trend (${units})`}
          actions={
            <Button variant="ghost" onClick={() => goTo('weight')}>
              Details
            </Button>
          }
        >
          <TrendChart
            points={weightPoints}
            series={[
              { key: 'reading', name: 'Reading', color: colors.s1, style: 'dots' },
              { key: 'avg', name: '7-day average', color: colors.s1 },
            ]}
            colors={colors}
            unit={units}
            goal={
              goalLb != null
                ? { value: round1(weightValue(goalLb, units)), label: 'Goal' }
                : null
            }
          />
          <LegendRow
            items={[{ name: 'Dots are single readings; the line is the 7-day average', color: colors.s1 }]}
          />
        </Card>
      ) : (
        !empty && (
          <Card title="Weight trend">
            <EmptyState>Add a few weight readings to see the trend here.</EmptyState>
          </Card>
        )
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card
          title="Latest blood test"
          actions={
            <Button variant="ghost" onClick={() => goTo('labs')}>
              All results
            </Button>
          }
        >
          {lastPanel ? (
            <div className="text-sm">
              <p>
                <span className="font-semibold">{dayjs(lastPanel.date).format('MMM D, YYYY')}</span>
                <span className="text-[var(--muted)]"> · {lastPanel.source} · {lastPanel.markers.length} markers</span>
              </p>
              {flagged > 0 ? (
                <div className="mt-2 space-y-1">
                  <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                    ⚠ {flagged} out of range
                  </Badge>
                  <ul className="mt-1 list-inside list-disc text-xs text-[var(--ink-2)]">
                    {lastPanel.markers
                      .filter((m) => m.status === 'outOfRange')
                      .slice(0, 5)
                      .map((m) => (
                        <li key={m.name}>
                          {m.name}: {m.valueText} {m.unit}
                        </li>
                      ))}
                    {flagged > 5 && <li>and {flagged - 5} more…</li>}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                  All markers in range.
                </p>
              )}
            </div>
          ) : (
            <EmptyState>Import or add your blood test results to see them here.</EmptyState>
          )}
        </Card>

        <Card
          title="Quick add"
          subtitle="Jump straight to the right form."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => goTo('weight')}>+ Weight</Button>
            <Button variant="ghost" onClick={() => goTo('bp')}>+ Blood pressure</Button>
            <Button variant="ghost" onClick={() => goTo('injections')}>+ Injection</Button>
            <Button variant="ghost" onClick={() => goTo('sleep')}>+ Sleep</Button>
            <Button variant="ghost" onClick={() => goTo('journal')}>+ Journal</Button>
            <Button variant="ghost" onClick={() => goTo('measurements')}>+ Measurements</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
