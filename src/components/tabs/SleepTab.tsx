import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { newId, type SleepEntry } from '../../lib/model'
import { chartColors } from '../../lib/theme'
import { TrendChart, type TrendPoint } from '../charts'
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

const QUALITY_LABELS = ['', 'Very poor', 'Poor', 'OK', 'Good', 'Excellent']

export default function SleepTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)

  const blank = () => ({
    editingId: null as string | null,
    date: dayjs().format('YYYY-MM-DD'),
    hours: '',
    quality: '',
    notes: '',
  })
  const [form, setForm] = useState(blank)

  const sorted = useMemo(
    () => [...data.sleep].sort((a, b) => b.date.localeCompare(a.date)),
    [data.sleep]
  )

  const points: TrendPoint[] = useMemo(
    () =>
      [...data.sleep]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({ t: dayjs(e.date).valueOf(), hours: e.hours })),
    [data.sleep]
  )

  const avg7 = useMemo(() => {
    const cutoff = dayjs().subtract(7, 'day')
    const recent = data.sleep.filter((e) => dayjs(e.date).isAfter(cutoff))
    if (recent.length === 0) return null
    return recent.reduce((s, e) => s + e.hours, 0) / recent.length
  }, [data.sleep])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const hours = Number(form.hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return
    const quality = form.quality === '' ? null : Number(form.quality)
    const entry: SleepEntry = {
      id: form.editingId ?? newId(),
      date: form.date,
      hours,
      quality,
      notes: form.notes.trim() || undefined,
    }
    update((prev) => ({
      ...prev,
      sleep: [...prev.sleep.filter((s) => s.id !== entry.id), entry].sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }))
    setForm(blank())
  }

  const startEdit = (e: SleepEntry) => {
    setForm({
      editingId: e.id,
      date: e.date,
      hours: String(e.hours),
      quality: e.quality != null ? String(e.quality) : '',
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <Card
        title={form.editingId ? 'Edit night' : 'Log a night'}
        subtitle={
          avg7 != null
            ? `7-day average: ${avg7.toFixed(1)} hours`
            : 'Log hours slept for the night ending on this date.'
        }
      >
        <form onSubmit={submit} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date (morning)">
            <input
              type="date"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Hours slept">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min="0"
              max="24"
              required
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              className={inputClass}
              placeholder="7.5"
            />
          </Field>
          <Field label="Quality">
            <select
              value={form.quality}
              onChange={(e) => setForm((f) => ({ ...f, quality: e.target.value }))}
              className={inputClass}
            >
              <option value="">Not rated</option>
              {[1, 2, 3, 4, 5].map((q) => (
                <option key={q} value={q}>
                  {q} · {QUALITY_LABELS[q]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Log night'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blank())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      {points.length > 1 && (
        <Card title="Hours slept">
          <TrendChart
            points={points}
            series={[{ key: 'hours', name: 'Hours', color: colors.s1 }]}
            colors={colors}
            unit="h"
            height={220}
          />
        </Card>
      )}

      <Card title="History" subtitle={`${sorted.length} nights`}>
        {sorted.length === 0 ? (
          <EmptyState>No sleep logged yet.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Hours</th>
                  <th className={thClass}>Quality</th>
                  <th className={thClass}>Notes</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--hairline)] last:border-0">
                    <td className={tdClass}>{dayjs(e.date).format('ddd, MMM D, YYYY')}</td>
                    <td className={`${tdClass} font-semibold`}>{e.hours}</td>
                    <td className={tdClass}>
                      {e.quality != null ? `${e.quality} · ${QUALITY_LABELS[e.quality]}` : '–'}
                    </td>
                    <td className={`${tdClass} max-w-[16rem] truncate`}>{e.notes ?? ''}</td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-3">
                        <EditButton onClick={() => startEdit(e)} />
                        <DeleteButton
                          onDelete={() =>
                            update((prev) => ({
                              ...prev,
                              sleep: prev.sleep.filter((s) => s.id !== e.id),
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
