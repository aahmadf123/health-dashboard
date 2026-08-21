import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { newId, type VitalEntry } from '../../lib/model'
import { bpCategory, bpBadgeClass } from '../../lib/bp'
import { chartColors } from '../../lib/theme'
import { TrendChart, LegendRow, type TrendPoint } from '../charts'
import {
  Card,
  Field,
  Button,
  Badge,
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
  systolic: string
  diastolic: string
  pulse: string
  notes: string
}

function blankForm(): FormState {
  return {
    editingId: null,
    dateTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    systolic: '',
    diastolic: '',
    pulse: '',
    notes: '',
  }
}

export default function BpTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)
  const [form, setForm] = useState<FormState>(blankForm)

  const sorted = useMemo(
    () => [...data.vitals].sort((a, b) => b.dateTime.localeCompare(a.dateTime)),
    [data.vitals]
  )

  const bpPoints: TrendPoint[] = useMemo(
    () =>
      [...data.vitals]
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .map((e) => ({
          t: dayjs(e.dateTime).valueOf(),
          systolic: e.systolic,
          diastolic: e.diastolic,
        })),
    [data.vitals]
  )

  const pulsePoints: TrendPoint[] = useMemo(
    () =>
      [...data.vitals]
        .filter((e) => e.pulse != null)
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .map((e) => ({ t: dayjs(e.dateTime).valueOf(), pulse: e.pulse ?? null })),
    [data.vitals]
  )

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const sys = Number(form.systolic)
    const dia = Number(form.diastolic)
    if (!Number.isFinite(sys) || !Number.isFinite(dia) || sys <= 0 || dia <= 0) return
    const pulse = form.pulse.trim() === '' ? null : Number(form.pulse)
    const entry: VitalEntry = {
      id: form.editingId ?? newId(),
      dateTime: dayjs(form.dateTime).toISOString(),
      systolic: sys,
      diastolic: dia,
      pulse: Number.isFinite(pulse as number) ? pulse : null,
      notes: form.notes.trim() || undefined,
    }
    update((prev) => ({
      ...prev,
      vitals: [...prev.vitals.filter((v) => v.id !== entry.id), entry],
    }))
    setForm(blankForm())
  }

  const startEdit = (e: VitalEntry) => {
    setForm({
      editingId: e.id,
      dateTime: dayjs(e.dateTime).format('YYYY-MM-DDTHH:mm'),
      systolic: String(e.systolic),
      diastolic: String(e.diastolic),
      pulse: e.pulse != null ? String(e.pulse) : '',
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const latest = sorted[0]
  const latestCat = latest ? bpCategory(latest.systolic, latest.diastolic) : null

  return (
    <div className="space-y-4">
      <Card
        title={form.editingId ? 'Edit reading' : 'Add reading'}
        subtitle="Enter readings from your blood pressure monitor."
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
          <Field label="Systolic (mmHg)">
            <input
              type="number"
              inputMode="numeric"
              min="40"
              max="300"
              required
              value={form.systolic}
              onChange={(e) => set({ systolic: e.target.value })}
              className={inputClass}
              placeholder="120"
            />
          </Field>
          <Field label="Diastolic (mmHg)">
            <input
              type="number"
              inputMode="numeric"
              min="20"
              max="200"
              required
              value={form.diastolic}
              onChange={(e) => set({ diastolic: e.target.value })}
              className={inputClass}
              placeholder="80"
            />
          </Field>
          <Field label="Pulse (bpm)">
            <input
              type="number"
              inputMode="numeric"
              min="20"
              max="250"
              value={form.pulse}
              onChange={(e) => set({ pulse: e.target.value })}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Notes" className="col-span-2 sm:col-span-3">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className={inputClass}
              placeholder="e.g. after coffee, left arm"
            />
          </Field>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Add reading'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blankForm())}>
                Cancel
              </Button>
            )}
            {latest && latestCat && (
              <span className="ml-auto flex items-center gap-2 text-xs text-[var(--muted)]">
                Latest: {latest.systolic}/{latest.diastolic}
                <Badge className={bpBadgeClass(latestCat.key)}>{latestCat.label}</Badge>
              </span>
            )}
          </div>
        </form>
      </Card>

      {bpPoints.length > 1 && (
        <Card
          title="Blood pressure (mmHg)"
          subtitle="Shaded bands mark the AHA category thresholds (130 and 140 systolic)."
        >
          <TrendChart
            points={bpPoints}
            series={[
              { key: 'systolic', name: 'Systolic', color: colors.s1 },
              { key: 'diastolic', name: 'Diastolic', color: colors.s2 },
            ]}
            colors={colors}
            unit="mmHg"
            yDecimals={0}
            bands={[
              { from: 130, to: 140, color: colors.warning },
              { from: 140, to: 300, color: colors.critical },
            ]}
          />
          <LegendRow
            items={[
              { name: 'Systolic', color: colors.s1 },
              { name: 'Diastolic', color: colors.s2 },
            ]}
          />
        </Card>
      )}

      {pulsePoints.length > 1 && (
        <Card title="Pulse (bpm)">
          <TrendChart
            points={pulsePoints}
            series={[{ key: 'pulse', name: 'Pulse', color: colors.s3 }]}
            colors={colors}
            unit="bpm"
            yDecimals={0}
            height={200}
          />
        </Card>
      )}

      <Card title="History" subtitle={`${sorted.length} readings`}>
        {sorted.length === 0 ? (
          <EmptyState>No readings yet. Add your first one above.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th className={thClass}>Date</th>
                  <th className={thClass}>BP</th>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>Pulse</th>
                  <th className={thClass}>Notes</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => {
                  const cat = bpCategory(e.systolic, e.diastolic)
                  return (
                    <tr key={e.id} className="border-b border-[var(--hairline)] last:border-0">
                      <td className={tdClass}>{dayjs(e.dateTime).format('MMM D, YYYY h:mm A')}</td>
                      <td className={`${tdClass} font-semibold`}>
                        {e.systolic}/{e.diastolic}
                      </td>
                      <td className={tdClass}>
                        <Badge className={bpBadgeClass(cat.key)}>{cat.label}</Badge>
                      </td>
                      <td className={tdClass}>{e.pulse ?? '–'}</td>
                      <td className={`${tdClass} max-w-[16rem] truncate`}>{e.notes ?? ''}</td>
                      <td className={`${tdClass} text-right`}>
                        <div className="flex items-center justify-end gap-3">
                          <EditButton onClick={() => startEdit(e)} />
                          <DeleteButton
                            onDelete={() =>
                              update((prev) => ({
                                ...prev,
                                vitals: prev.vitals.filter((v) => v.id !== e.id),
                              }))
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  )
}
