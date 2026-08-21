import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAppData } from '../../lib/storage'
import { JOURNAL_TAGS, newId, type JournalEntry } from '../../lib/model'
import {
  Card,
  Field,
  Button,
  Badge,
  DeleteButton,
  EditButton,
  EmptyState,
  inputClass,
} from '../ui'

const SEVERITY_LABELS = ['', 'Very mild', 'Mild', 'Moderate', 'Strong', 'Severe']

export default function JournalTab() {
  const { data, update } = useAppData()

  const blank = () => ({
    editingId: null as string | null,
    dateTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    tags: [] as string[],
    severity: '',
    notes: '',
  })
  const [form, setForm] = useState(blank)

  const sorted = useMemo(
    () => [...data.journal].sort((a, b) => b.dateTime.localeCompare(a.dateTime)),
    [data.journal]
  )

  const injectionDays = useMemo(
    () => new Set(data.injections.map((i) => dayjs(i.dateTime).format('YYYY-MM-DD'))),
    [data.injections]
  )

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (form.tags.length === 0 && form.notes.trim() === '') return
    const severity = form.severity === '' ? null : Number(form.severity)
    const entry: JournalEntry = {
      id: form.editingId ?? newId(),
      dateTime: dayjs(form.dateTime).toISOString(),
      tags: form.tags,
      severity,
      notes: form.notes.trim() || undefined,
    }
    update((prev) => ({
      ...prev,
      journal: [...prev.journal.filter((j) => j.id !== entry.id), entry].sort((a, b) =>
        a.dateTime.localeCompare(b.dateTime)
      ),
    }))
    setForm(blank())
  }

  const startEdit = (e: JournalEntry) => {
    setForm({
      editingId: e.id,
      dateTime: dayjs(e.dateTime).format('YYYY-MM-DDTHH:mm'),
      tags: [...e.tags],
      severity: e.severity != null ? String(e.severity) : '',
      notes: e.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <Card
        title={form.editingId ? 'Edit entry' : 'How are you feeling?'}
        subtitle="Track symptoms and side effects. Entries on injection days are marked, so you can spot patterns after dose changes."
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date and time" className="col-span-2">
              <input
                type="datetime-local"
                required
                value={form.dateTime}
                onChange={(e) => setForm((f) => ({ ...f, dateTime: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Severity" className="col-span-2">
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                className={inputClass}
              >
                <option value="">Not rated</option>
                {[1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    {s} · {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--ink-2)]">
              Symptoms
            </span>
            <div className="flex flex-wrap gap-1.5">
              {JOURNAL_TAGS.map((tag) => {
                const on = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={on}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--hairline)] bg-transparent text-[var(--ink-2)] hover:bg-[var(--page)]'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={`${inputClass} min-h-20`}
              placeholder="Anything else worth remembering"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">{form.editingId ? 'Save changes' : 'Add entry'}</Button>
            {form.editingId && (
              <Button variant="ghost" onClick={() => setForm(blank())}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Timeline" subtitle={`${sorted.length} entries`}>
        {sorted.length === 0 ? (
          <EmptyState>No journal entries yet.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {sorted.map((e) => {
              const day = dayjs(e.dateTime).format('YYYY-MM-DD')
              const injectionDay = injectionDays.has(day)
              return (
                <li
                  key={e.id}
                  className="rounded-lg border border-[var(--hairline)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--ink)]">
                      {dayjs(e.dateTime).format('ddd, MMM D, YYYY h:mm A')}
                    </span>
                    {injectionDay && (
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        💉 Injection day
                      </Badge>
                    )}
                    {e.severity != null && (
                      <span>
                        Severity {e.severity} · {SEVERITY_LABELS[e.severity]}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <EditButton onClick={() => startEdit(e)} />
                      <DeleteButton
                        onDelete={() =>
                          update((prev) => ({
                            ...prev,
                            journal: prev.journal.filter((j) => j.id !== e.id),
                          }))
                        }
                      />
                    </div>
                  </div>
                  {e.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.tags.map((t) => (
                        <Badge
                          key={t}
                          className="bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {e.notes && <p className="mt-2 text-sm">{e.notes}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
