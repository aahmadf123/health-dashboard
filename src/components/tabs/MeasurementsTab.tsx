import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { newId, type MeasurementEntry } from '../../lib/model'
import { displayLength, lengthValue, toCanonicalIn, round1 } from '../../lib/format'
import { chartColors } from '../../lib/theme'
import { TrendChart, LegendRow, type TrendPoint } from '../charts'
import {
  Card,
  Field,
  Button,
  DeleteButton,
  EditButton,
  EmptyState,
  TableWrap,
  inputClass,
  thClass,
  tdClass,
} from '../ui'

const FIELDS = [
  { key: 'neckIn', label: 'Neck' },
  { key: 'chestIn', label: 'Chest' },
  { key: 'waistIn', label: 'Waist' },
  { key: 'hipsIn', label: 'Hips' },
  { key: 'leftArmIn', label: 'Left arm' },
  { key: 'rightArmIn', label: 'Right arm' },
  { key: 'leftThighIn', label: 'Left thigh' },
  { key: 'rightThighIn', label: 'Right thigh' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

export default function MeasurementsTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)
  const units = data.settings.units
  const lengthUnit = units === 'kg' ? 'cm' : 'in'

  const blank = () => ({
    editingId: null as string | null,
    date: dayjs().format('YYYY-MM-DD'),
    values: Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Record<FieldKey, string>,
    notes: '',
  })
  const [form, setForm] = useState(blank)

  const sorted = useMemo(
    () => [...data.measurements].sort((a, b) => b.date.localeCompare(a.date)),
    [data.measurements]
  )

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      [...data.measurements]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({
          t: dayjs(e.date).valueOf(),
          waist: e.waistIn != null ? round1(lengthValue(e.waistIn, units)) : null,
          hips: e.hipsIn != null ? round1(lengthValue(e.hipsIn, units)) : null,
          chest: e.chestIn != null ? round1(lengthValue(e.chestIn, units)) : null,
        })),
    [data.measurements, units]
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const entry: MeasurementEntry = {
      id: form.editingId ?? newId(),
      date: form.date,
      notes: form.notes.trim() || undefined,
    }
    let any = false
    for (const f of FIELDS) {
      const raw = form.values[f.key].trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0) continue
      entry[f.key] = round1(toCanonicalIn(n, units))
      any = true
    }
    if (!any) return
    update((prev) => ({
      ...prev,
      measurements: [...prev.measurements.filter((m) => m.id !== entry.id), entry].sort(
        (a, b) => a.date.localeCompare(b.date)
      ),
    }))
    setForm(blank())
  }

  const startEdit = (e: MeasurementEntry) => {
    setForm({
      editingId: e.id,
      date: e.date,
      values: Object.fromEntries(
        FIELDS.map((f) => [
          f.key,
          e[f.key] != null ? String(round1(lengthValue(e[f.key] as number, units))) : '',
        ])
      ) as Record<FieldKey, string>,
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <Card
        title={form.editingId ? 'Edit measurements' : 'Add measurements'}
        subtitle={`Tape measurements in ${lengthUnit}. Fill in whichever you take.`}
      >
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date" className="col-span-2">
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <div className="hidden sm:col-span-2 sm:block" />
          {FIELDS.map((f) => (
            <Field key={f.key} label={`${f.label} (${lengthUnit})`}>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={form.values[f.key]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    values: { ...prev.values, [f.key]: e.target.value },
                  }))
                }
                className={inputClass}
              />
            </Field>
          ))}
          <Field label="Notes" className="col-span-2 sm:col-span-4">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Add measurements'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blank())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {trendPoints.length > 1 && (
        <Card title={`Waist, hips, and chest (${lengthUnit})`}>
          <TrendChart
            points={trendPoints}
            series={[
              { key: 'waist', name: 'Waist', color: colors.s1 },
              { key: 'hips', name: 'Hips', color: colors.s2 },
              { key: 'chest', name: 'Chest', color: colors.s3 },
            ]}
            colors={colors}
            unit={lengthUnit}
          />
          <LegendRow
            items={[
              { name: 'Waist', color: colors.s1 },
              { name: 'Hips', color: colors.s2 },
              { name: 'Chest', color: colors.s3 },
            ]}
          />
        </Card>
      )}

      <Card title="History" subtitle={`${sorted.length} entries`}>
        {sorted.length === 0 ? (
          <EmptyState>No measurements yet. Add your first set above.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th className={thClass}>Date</th>
                  {FIELDS.map((f) => (
                    <th key={f.key} className={thClass}>
                      {f.label}
                    </th>
                  ))}
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--hairline)] last:border-0">
                    <td className={tdClass}>{dayjs(e.date).format('MMM D, YYYY')}</td>
                    {FIELDS.map((f) => (
                      <td key={f.key} className={tdClass}>
                        {e[f.key] != null ? displayLength(e[f.key] as number, units) : '–'}
                      </td>
                    ))}
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-3">
                        <EditButton onClick={() => startEdit(e)} />
                        <DeleteButton
                          onDelete={() =>
                            update((prev) => ({
                              ...prev,
                              measurements: prev.measurements.filter((m) => m.id !== e.id),
                            }))
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
