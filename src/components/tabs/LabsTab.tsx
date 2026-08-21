import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { newId, type LabMarker, type LabPanel, type LabStatus } from '../../lib/model'
import { LABS_CATALOG, findPreset } from '../../lib/labs-catalog'
import { statusFromRange } from '../../lib/lab-status'
import { chartColors } from '../../lib/theme'
import { TrendChart, type TrendPoint } from '../charts'
import {
  Card,
  Field,
  Button,
  Badge,
  DeleteButton,
  EmptyState,
  TableWrap,
  inputClass,
  thClass,
  tdClass,
} from '../ui'

function statusBadge(status: LabStatus) {
  switch (status) {
    case 'optimal':
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Optimal
        </Badge>
      )
    case 'average':
      return (
        <Badge className="bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
          In range
        </Badge>
      )
    case 'outOfRange':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
          ⚠ Out of range
        </Badge>
      )
    default:
      return (
        <Badge className="bg-stone-100 text-stone-500 dark:bg-stone-900 dark:text-stone-400">
          –
        </Badge>
      )
  }
}

interface MarkerDraft {
  name: string
  value: string
  unit: string
  refLow: string
  refHigh: string
}

const blankMarker: MarkerDraft = { name: '', value: '', unit: '', refLow: '', refHigh: '' }

export default function LabsTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)

  const [panelDate, setPanelDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [panelSource, setPanelSource] = useState('Rythm')
  const [drafts, setDrafts] = useState<MarkerDraft[]>([])
  const [marker, setMarker] = useState<MarkerDraft>(blankMarker)
  const [trendMarker, setTrendMarker] = useState('')
  const [openPanel, setOpenPanel] = useState<string | null>(null)

  const panels = useMemo(
    () => [...data.labs].sort((a, b) => b.date.localeCompare(a.date)),
    [data.labs]
  )

  const allMarkerNames = useMemo(() => {
    const names = new Set<string>()
    for (const p of data.labs) for (const m of p.markers) names.add(m.name)
    return [...names].sort()
  }, [data.labs])

  const trendPoints: TrendPoint[] = useMemo(() => {
    if (!trendMarker) return []
    const pts: TrendPoint[] = []
    for (const p of [...data.labs].sort((a, b) => a.date.localeCompare(b.date))) {
      const m = p.markers.find((x) => x.name === trendMarker)
      if (m && m.value !== null) pts.push({ t: dayjs(p.date).valueOf(), value: m.value })
    }
    return pts
  }, [data.labs, trendMarker])

  const trendRef = useMemo(() => {
    if (!trendMarker) return null
    for (let i = data.labs.length - 1; i >= 0; i--) {
      const m = data.labs[i].markers.find((x) => x.name === trendMarker)
      if (m) return m
    }
    return null
  }, [data.labs, trendMarker])

  const onPickPreset = (name: string) => {
    if (!name) return
    const preset = findPreset(name)
    setMarker({
      name,
      value: '',
      unit: preset?.unit ?? '',
      refLow: preset?.refLow != null ? String(preset.refLow) : '',
      refHigh: preset?.refHigh != null ? String(preset.refHigh) : '',
    })
  }

  const addMarkerDraft = () => {
    if (!marker.name.trim() || !marker.value.trim()) return
    setDrafts((d) => [...d.filter((x) => x.name !== marker.name), marker])
    setMarker(blankMarker)
  }

  const savePanel = () => {
    const pending = [...drafts]
    if (marker.name.trim() && marker.value.trim()) {
      pending.push(marker)
    }
    if (pending.length === 0 || !panelDate) return
    const markers: LabMarker[] = pending.map((d) => {
      const numMatch = d.value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
      const value = numMatch ? Number(numMatch[0]) : null
      const refLow = d.refLow.trim() === '' ? null : Number(d.refLow)
      const refHigh = d.refHigh.trim() === '' ? null : Number(d.refHigh)
      return {
        name: d.name.trim(),
        value,
        valueText: d.value.trim(),
        unit: d.unit.trim(),
        refLow: Number.isFinite(refLow as number) ? refLow : null,
        refHigh: Number.isFinite(refHigh as number) ? refHigh : null,
        status: statusFromRange(
          value,
          Number.isFinite(refLow as number) ? refLow : null,
          Number.isFinite(refHigh as number) ? refHigh : null
        ),
      }
    })
    update((prev) => {
      const existing = prev.labs.find(
        (p) => p.date === panelDate && p.source === panelSource
      )
      let labs: LabPanel[]
      if (existing) {
        labs = prev.labs.map((p) => {
          if (p.id !== existing.id) return p
          const merged = [...p.markers]
          for (const m of markers) {
            const i = merged.findIndex((x) => x.name.toLowerCase() === m.name.toLowerCase())
            if (i >= 0) merged[i] = m
            else merged.push(m)
          }
          return { ...p, markers: merged }
        })
      } else {
        labs = [...prev.labs, { id: newId(), date: panelDate, source: panelSource, markers }]
      }
      labs.sort((a, b) => a.date.localeCompare(b.date))
      return { ...prev, labs }
    })
    setDrafts([])
    setMarker(blankMarker)
  }

  return (
    <div className="space-y-4">
      <Card
        title="Add blood test results"
        subtitle="Pick markers from the list (units and reference ranges prefill) or type your own. You can also import a Rythm CSV from the Data tab."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Test date">
            <input
              type="date"
              value={panelDate}
              onChange={(e) => setPanelDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Source">
            <input
              type="text"
              value={panelSource}
              onChange={(e) => setPanelSource(e.target.value)}
              className={inputClass}
              placeholder="Rythm"
            />
          </Field>
          <Field label="Preset marker" className="col-span-2">
            <select
              value=""
              onChange={(e) => onPickPreset(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a marker…</option>
              {LABS_CATALOG.map((cat) => (
                <optgroup key={cat.category} label={cat.category}>
                  {cat.markers.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Marker name" className="col-span-2">
            <input
              type="text"
              value={marker.name}
              onChange={(e) => setMarker((m) => ({ ...m, name: e.target.value }))}
              className={inputClass}
              placeholder="e.g. Total Cholesterol"
            />
          </Field>
          <Field label="Value">
            <input
              type="text"
              inputMode="decimal"
              value={marker.value}
              onChange={(e) => setMarker((m) => ({ ...m, value: e.target.value }))}
              className={inputClass}
              placeholder="e.g. 243"
            />
          </Field>
          <Field label="Unit">
            <input
              type="text"
              value={marker.unit}
              onChange={(e) => setMarker((m) => ({ ...m, unit: e.target.value }))}
              className={inputClass}
              placeholder="mg/dL"
            />
          </Field>
          <Field label="Range low">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={marker.refLow}
              onChange={(e) => setMarker((m) => ({ ...m, refLow: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Range high">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={marker.refHigh}
              onChange={(e) => setMarker((m) => ({ ...m, refHigh: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={addMarkerDraft}>
              + Add another marker
            </Button>
          </div>
        </div>

        {drafts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {drafts.map((d) => (
              <Badge
                key={d.name}
                className="bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
              >
                {d.name}: {d.value} {d.unit}
                <button
                  type="button"
                  onClick={() => setDrafts((x) => x.filter((y) => y.name !== d.name))}
                  className="ml-1 font-bold"
                  aria-label={`Remove ${d.name}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-3">
          <Button onClick={savePanel}>Save results</Button>
        </div>
      </Card>

      {allMarkerNames.length > 0 && (
        <Card title="Marker trend" subtitle="Compare a marker across test dates.">
          <select
            value={trendMarker}
            onChange={(e) => setTrendMarker(e.target.value)}
            className={`${inputClass} max-w-sm`}
          >
            <option value="">Choose a marker…</option>
            {allMarkerNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {trendMarker && trendPoints.length > 0 && (
            <div className="mt-3">
              <TrendChart
                points={trendPoints}
                series={[{ key: 'value', name: trendMarker, color: colors.s1 }]}
                colors={colors}
                unit={trendRef?.unit}
                yDecimals={2}
                height={220}
                bands={
                  trendRef && trendRef.refLow !== null && trendRef.refHigh !== null
                    ? [{ from: trendRef.refLow, to: trendRef.refHigh, color: colors.good }]
                    : []
                }
                includeInDomain={
                  trendRef
                    ? [trendRef.refLow, trendRef.refHigh].filter(
                        (v): v is number => v !== null
                      )
                    : []
                }
              />
              {trendRef && trendRef.refLow !== null && trendRef.refHigh !== null && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Green band: reference range {trendRef.refLow}–{trendRef.refHigh} {trendRef.unit}
                </p>
              )}
              {trendPoints.length === 1 && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  One result so far; the trend fills in as you add more tests.
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Test history" subtitle={`${panels.length} panels`}>
        {panels.length === 0 ? (
          <EmptyState>
            No blood test results yet. Add them above or import a Rythm CSV from the Data tab.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {panels.map((p) => {
              const flagged = p.markers.filter((m) => m.status === 'outOfRange').length
              const open = openPanel === p.id
              return (
                <div
                  key={p.id}
                  className="rounded-lg border border-[var(--hairline)]"
                >
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpenPanel(open ? null : p.id)}
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <span aria-hidden>{open ? '▾' : '▸'}</span>
                      {dayjs(p.date).format('MMM D, YYYY')}
                      <span className="font-normal text-[var(--muted)]">· {p.source}</span>
                    </button>
                    <span className="text-xs text-[var(--muted)]">
                      {p.markers.length} markers
                    </span>
                    {flagged > 0 && (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                        ⚠ {flagged} out of range
                      </Badge>
                    )}
                    <div className="ml-auto">
                      <DeleteButton
                        label="Delete panel"
                        onDelete={() =>
                          update((prev) => ({
                            ...prev,
                            labs: prev.labs.filter((x) => x.id !== p.id),
                          }))
                        }
                      />
                    </div>
                  </div>
                  {open && (
                    <TableWrap>
                      <table className="w-full border-t border-[var(--hairline)]">
                        <thead>
                          <tr className="border-b border-[var(--hairline)]">
                            <th className={thClass}>Marker</th>
                            <th className={thClass}>Value</th>
                            <th className={thClass}>Range</th>
                            <th className={thClass}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...p.markers]
                            .sort((a, b) => {
                              const rank = (s: LabStatus) => (s === 'outOfRange' ? 0 : 1)
                              return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)
                            })
                            .map((m) => (
                              <tr
                                key={m.name}
                                className="border-b border-[var(--hairline)] last:border-0"
                              >
                                <td className={`${tdClass} whitespace-normal`}>{m.name}</td>
                                <td className={`${tdClass} font-semibold`}>
                                  {m.valueText} {m.unit}
                                </td>
                                <td className={tdClass}>
                                  {m.refLow !== null && m.refHigh !== null
                                    ? `${m.refLow}–${m.refHigh}`
                                    : m.refLow !== null
                                      ? `> ${m.refLow}`
                                      : m.refHigh !== null
                                        ? `< ${m.refHigh}`
                                        : '–'}
                                </td>
                                <td className={tdClass}>{statusBadge(m.status)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
