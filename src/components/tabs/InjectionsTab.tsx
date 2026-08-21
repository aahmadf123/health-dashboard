import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAppData } from '../../lib/storage'
import {
  INJECTION_SITES,
  WEGOVY_DOSES_MG,
  newId,
  type InjectionEntry,
  type InjectionSite,
} from '../../lib/model'
import { chartColors } from '../../lib/theme'
import { TrendChart, type TrendPoint } from '../charts'
import {
  Card,
  Field,
  Button,
  Badge,
  DeleteButton,
  EditButton,
  EmptyState,
  StatTile,
  TableWrap,
  inputClass,
  thClass,
  tdClass,
} from '../ui'

dayjs.extend(relativeTime)

interface FormState {
  editingId: string | null
  dateTime: string
  medication: string
  dose: string
  site: InjectionSite | ''
  notes: string
}

export default function InjectionsTab({ isDark }: { isDark: boolean }) {
  const { data, update } = useAppData()
  const colors = chartColors(isDark)
  const schedule = data.settings.injectionSchedule

  const sorted = useMemo(
    () => [...data.injections].sort((a, b) => b.dateTime.localeCompare(a.dateTime)),
    [data.injections]
  )
  const last = sorted[0]

  const suggestedSite: InjectionSite = useMemo(() => {
    if (!last?.site) return INJECTION_SITES[0]
    const idx = INJECTION_SITES.indexOf(last.site)
    return INJECTION_SITES[(idx + 1) % INJECTION_SITES.length]
  }, [last])

  const blankForm = (): FormState => ({
    editingId: null,
    dateTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    medication: schedule.medication,
    dose: String(schedule.doseMg),
    site: suggestedSite,
    notes: '',
  })
  const [form, setForm] = useState<FormState>(blankForm)
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const nextDue = last ? dayjs(last.dateTime).add(schedule.intervalDays, 'day') : null
  const overdue = nextDue ? dayjs().isAfter(nextDue) : false

  const dosePoints: TrendPoint[] = useMemo(
    () =>
      [...data.injections]
        .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
        .map((e) => ({ t: dayjs(e.dateTime).valueOf(), dose: e.doseMg })),
    [data.injections]
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const dose = Number(form.dose)
    if (!Number.isFinite(dose) || dose <= 0 || !form.medication.trim()) return
    const entry: InjectionEntry = {
      id: form.editingId ?? newId(),
      dateTime: dayjs(form.dateTime).toISOString(),
      medication: form.medication.trim(),
      doseMg: dose,
      site: form.site,
      notes: form.notes.trim() || undefined,
    }
    update((prev) => ({
      ...prev,
      injections: [...prev.injections.filter((i) => i.id !== entry.id), entry],
      // Keep the schedule's dose in sync with the most recent logged dose.
      settings: {
        ...prev.settings,
        injectionSchedule: { ...prev.settings.injectionSchedule, doseMg: dose },
      },
    }))
    setForm(blankForm())
  }

  const startEdit = (e: InjectionEntry) => {
    setForm({
      editingId: e.id,
      dateTime: dayjs(e.dateTime).format('YYYY-MM-DDTHH:mm'),
      medication: e.medication,
      dose: String(e.doseMg),
      site: e.site ?? '',
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const updateSchedule = (patch: Partial<typeof schedule>) => {
    update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        injectionSchedule: { ...prev.settings.injectionSchedule, ...patch },
      },
    }))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Next dose due"
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
              ? overdue
                ? `Overdue: was due ${nextDue.fromNow()}`
                : `${nextDue.fromNow()} · every ${schedule.intervalDays} days`
              : 'Log your first injection below'
          }
          subClass={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}
        />
        <StatTile
          label="Current dose"
          value={`${schedule.doseMg} mg`}
          sub={schedule.medication}
        />
        <StatTile
          label="Suggested next site"
          value={<span className="text-lg">{suggestedSite}</span>}
          sub={last?.site ? `Last used: ${last.site}` : 'Rotate sites each week'}
        />
      </div>

      <Card title={form.editingId ? 'Edit injection' : 'Log injection'}>
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
          <Field label="Medication" className="col-span-2">
            <input
              type="text"
              required
              value={form.medication}
              onChange={(e) => set({ medication: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Dose (mg)">
            <select
              value={WEGOVY_DOSES_MG.includes(Number(form.dose)) ? form.dose : 'custom'}
              onChange={(e) =>
                set({ dose: e.target.value === 'custom' ? '' : e.target.value })
              }
              className={inputClass}
            >
              {WEGOVY_DOSES_MG.map((d) => (
                <option key={d} value={String(d)}>
                  {d} mg
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </Field>
          {!WEGOVY_DOSES_MG.includes(Number(form.dose)) && (
            <Field label="Custom dose (mg)">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0.01"
                required
                value={form.dose}
                onChange={(e) => set({ dose: e.target.value })}
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Injection site">
            <select
              value={form.site}
              onChange={(e) => set({ site: e.target.value as InjectionSite | '' })}
              className={inputClass}
            >
              <option value="">Not recorded</option>
              {INJECTION_SITES.map((s) => (
                <option key={s} value={s}>
                  {s}
                  {s === suggestedSite ? ' (suggested)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" className="col-span-2">
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              className={inputClass}
              placeholder="e.g. no side effects"
            />
          </Field>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Log injection'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blankForm())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Schedule" subtitle="Used to compute when your next dose is due.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Medication" className="col-span-2">
            <input
              type="text"
              value={schedule.medication}
              onChange={(e) => updateSchedule({ medication: e.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Current dose (mg)">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={schedule.doseMg}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) updateSchedule({ doseMg: v })
              }}
              className={inputClass}
            />
          </Field>
          <Field label="Every N days">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              value={schedule.intervalDays}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v >= 1) updateSchedule({ intervalDays: v })
              }}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      {dosePoints.length > 1 && (
        <Card title="Dose over time (mg)" subtitle="Each step is a dose change.">
          <TrendChart
            points={dosePoints}
            series={[{ key: 'dose', name: 'Dose', color: colors.s1, style: 'step' }]}
            colors={colors}
            unit="mg"
            yDecimals={2}
            height={200}
          />
        </Card>
      )}

      <Card title="History" subtitle={`${sorted.length} injections`}>
        {sorted.length === 0 ? (
          <EmptyState>No injections logged yet. Log your first one above.</EmptyState>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--hairline)]">
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Medication</th>
                  <th className={thClass}>Dose</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Notes</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--hairline)] last:border-0">
                    <td className={tdClass}>{dayjs(e.dateTime).format('MMM D, YYYY h:mm A')}</td>
                    <td className={tdClass}>{e.medication}</td>
                    <td className={tdClass}>
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {e.doseMg} mg
                      </Badge>
                    </td>
                    <td className={tdClass}>{e.site || '–'}</td>
                    <td className={`${tdClass} max-w-[14rem] truncate`}>{e.notes ?? ''}</td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-3">
                        <EditButton onClick={() => startEdit(e)} />
                        <DeleteButton
                          onDelete={() =>
                            update((prev) => ({
                              ...prev,
                              injections: prev.injections.filter((i) => i.id !== e.id),
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
