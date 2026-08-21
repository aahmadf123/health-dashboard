import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { newId, type ScaleEntry } from '../../lib/model'
import {
  displayWeight,
  toCanonicalLb,
  weightValue,
  bmi as bmiOf,
  round1,
} from '../../lib/format'
import { chartColors } from '../../lib/theme'
import { movingAverage } from '../../lib/stats'
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

interface FormState {
  editingId: string | null
  dateTime: string
  weight: string
  bodyFatPct: string
  muscleMassLb: string
  bodyWaterPct: string
  visceralFat: string
  bmr: string
  notes: string
}

function blankForm(): FormState {
  return {
    editingId: null,
    dateTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    weight: '',
    bodyFatPct: '',
    muscleMassLb: '',
    bodyWaterPct: '',
    visceralFat: '',
    bmr: '',
    notes: '',
  }
}

function numOrNull(s: string): number | null {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? n : null
}

export default function WeightTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)
  const units = data.settings.units
  const [form, setForm] = useState<FormState>(blankForm)
  const [showAllFields, setShowAllFields] = useState(false)

  const sorted = useMemo(
    () => [...data.scale].sort((a, b) => b.dateTime.localeCompare(a.dateTime)),
    [data.scale]
  )

  const ma = useMemo(() => movingAverage(data.scale), [data.scale])

  const weightPoints: TrendPoint[] = useMemo(
    () =>
      [...data.scale]
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .map((e) => ({
          t: dayjs(e.dateTime).valueOf(),
          reading: round1(weightValue(e.weightLb, units)),
          avg: round1(weightValue(ma.get(e.id) ?? e.weightLb, units)),
        })),
    [data.scale, ma, units]
  )

  const fatPoints: TrendPoint[] = useMemo(
    () =>
      [...data.scale]
        .filter((e) => e.bodyFatPct != null)
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .map((e) => ({ t: dayjs(e.dateTime).valueOf(), fat: e.bodyFatPct ?? null })),
    [data.scale]
  )

  const goalLb = data.settings.goalWeightLb
  const heightIn = data.settings.heightIn

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const weight = numOrNull(form.weight)
    if (weight === null || weight <= 0) return
    const weightLb = toCanonicalLb(weight, units)
    const iso = dayjs(form.dateTime).toISOString()
    const derivedBmi = heightIn ? round1(bmiOf(weightLb, heightIn)) : null
    const entry: ScaleEntry = {
      id: form.editingId ?? newId(),
      dateTime: iso,
      weightLb: round1(weightLb),
      bmi: derivedBmi,
      bodyFatPct: numOrNull(form.bodyFatPct),
      muscleMassLb: numOrNull(form.muscleMassLb),
      bodyWaterPct: numOrNull(form.bodyWaterPct),
      visceralFat: numOrNull(form.visceralFat),
      bmr: numOrNull(form.bmr),
      notes: form.notes.trim() || undefined,
    }
    update((prev) => {
      const rest = prev.scale.filter((s) => s.id !== entry.id)
      if (form.editingId) {
        const old = prev.scale.find((s) => s.id === form.editingId)
        // Keep imported composition fields the quick form does not expose.
        if (old) {
          Object.assign(entry, {
            muscleMassPct: old.muscleMassPct,
            leanBodyMassLb: old.leanBodyMassLb,
            boneMassLb: old.boneMassLb,
            proteinPct: old.proteinPct,
            metabolicAge: old.metabolicAge,
            skeletalMuscleLb: old.skeletalMuscleLb,
            skeletalMuscleRatePct: old.skeletalMuscleRatePct,
            fatContentLb: old.fatContentLb,
            subcutaneousFatPct: old.subcutaneousFatPct,
            bmi: entry.bmi ?? old.bmi,
          })
        }
      }
      return { ...prev, scale: [...rest, entry] }
    })
    setForm(blankForm())
  }

  const startEdit = (e: ScaleEntry) => {
    setForm({
      editingId: e.id,
      dateTime: dayjs(e.dateTime).format('YYYY-MM-DDTHH:mm'),
      weight: String(round1(weightValue(e.weightLb, units))),
      bodyFatPct: e.bodyFatPct != null ? String(e.bodyFatPct) : '',
      muscleMassLb: e.muscleMassLb != null ? String(e.muscleMassLb) : '',
      bodyWaterPct: e.bodyWaterPct != null ? String(e.bodyWaterPct) : '',
      visceralFat: e.visceralFat != null ? String(e.visceralFat) : '',
      bmr: e.bmr != null ? String(e.bmr) : '',
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (id: string) => {
    update((prev) => ({ ...prev, scale: prev.scale.filter((s) => s.id !== id) }))
  }

  return (
    <div className="space-y-4">
      <Card
        title={form.editingId ? 'Edit reading' : 'Add reading'}
        subtitle="Weight is required; add any body composition numbers your scale shows."
      >
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date and time" className="col-span-2">
            <input
              type="datetime-local"
              required
              value={form.dateTime}
              onChange={(e) => set({ dateTime: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label={`Weight (${units})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="1"
              required
              value={form.weight}
              onChange={(e) => set({ weight: e.target.value })}
              className={inputClass}
              placeholder={units === 'lb' ? '320.5' : '145.5'}
            />
          </Field>
          <Field label="Body fat %">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.bodyFatPct}
              onChange={(e) => set({ bodyFatPct: e.target.value })}
              className={inputClass}
            />
          </Field>
          {showAllFields && (
            <>
              <Field label="Muscle mass (lb)">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.muscleMassLb}
                  onChange={(e) => set({ muscleMassLb: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Body water %">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={form.bodyWaterPct}
                  onChange={(e) => set({ bodyWaterPct: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Visceral fat">
                <input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={form.visceralFat}
                  onChange={(e) => set({ visceralFat: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="BMR (kcal)">
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={form.bmr}
                  onChange={(e) => set({ bmr: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </>
          )}
          <Field label="Notes" className="col-span-2 sm:col-span-4">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Add reading'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blankForm())}>
                Cancel
              </Button>
            )}
            <button
              type="button"
              onClick={() => setShowAllFields((v) => !v)}
              className="ml-auto text-xs text-[var(--accent)] underline-offset-2 hover:underline"
            >
              {showAllFields ? 'Fewer fields' : 'More fields'}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Have a scale export file? Import the whole history at once from the Data tab.
        </p>
      </Card>

      {weightPoints.length > 0 && (
        <Card title={`Weight trend (${units})`}>
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
      )}

      {fatPoints.length > 1 && (
        <Card title="Body fat %">
          <TrendChart
            points={fatPoints}
            series={[{ key: 'fat', name: 'Body fat', color: colors.s2 }]}
            colors={colors}
            unit="%"
            height={200}
          />
        </Card>
      )}

      <Card title="History" subtitle={`${sorted.length} readings`}>
        {sorted.length === 0 ? (
          <EmptyState>
            No readings yet. Add one above or import your scale export from the Data tab.
          </EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Weight</th>
                  <th className={thClass}>BMI</th>
                  <th className={thClass}>Body fat</th>
                  <th className={thClass}>Muscle</th>
                  <th className={thClass}>Water</th>
                  <th className={thClass}>BMR</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--hairline)] last:border-0">
                    <td className={tdClass}>{dayjs(e.dateTime).format('MMM D, YYYY h:mm A')}</td>
                    <td className={`${tdClass} font-semibold`}>
                      {displayWeight(e.weightLb, units)}
                    </td>
                    <td className={tdClass}>{e.bmi ?? '–'}</td>
                    <td className={tdClass}>{e.bodyFatPct != null ? `${e.bodyFatPct}%` : '–'}</td>
                    <td className={tdClass}>
                      {e.muscleMassLb != null ? displayWeight(e.muscleMassLb, units) : '–'}
                    </td>
                    <td className={tdClass}>
                      {e.bodyWaterPct != null ? `${e.bodyWaterPct}%` : '–'}
                    </td>
                    <td className={tdClass}>{e.bmr ?? '–'}</td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-3">
                        <EditButton onClick={() => startEdit(e)} />
                        <DeleteButton onDelete={() => remove(e.id)} />
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
