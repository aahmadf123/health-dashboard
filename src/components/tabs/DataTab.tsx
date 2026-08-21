import { useRef, useState } from 'react'
import { useAppData } from '../../lib/storage'
import { emptyData } from '../../lib/model'
import {
  buildBackup,
  parseBackup,
  mergeBackup,
  downloadFile,
  stampedName,
  scaleCsv,
  vitalsCsv,
  labsCsv,
  injectionsCsv,
  measurementsCsv,
  sleepCsv,
  journalCsv,
} from '../../lib/export'
import { toCanonicalLb, weightValue, round1 } from '../../lib/format'
import { Card, Field, Button, inputClass } from '../ui'

type Notice = { kind: 'ok' | 'error'; text: string } | null

function FilePicker({
  label,
  accept,
  onFile,
}: {
  label: string
  accept: string
  onFile: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      <Button onClick={() => ref.current?.click()}>{label}</Button>
    </>
  )
}

export default function DataTab() {
  const { data, update, replace } = useAppData()
  const [scaleNotice, setScaleNotice] = useState<Notice>(null)
  const [labsNotice, setLabsNotice] = useState<Notice>(null)
  const [backupNotice, setBackupNotice] = useState<Notice>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const units = data.settings.units

  const importScale = async (file: File) => {
    try {
      // Loaded on demand so the spreadsheet parser stays out of the main bundle.
      const { parseScaleFile, mergeScaleEntries } = await import('../../lib/parse-scale')
      const buf = await file.arrayBuffer()
      const { entries, skippedRows } = parseScaleFile(buf)
      update((prev) => {
        const { merged, added, duplicates } = mergeScaleEntries(prev.scale, entries)
        setScaleNotice({
          kind: 'ok',
          text: `Imported ${added} new readings (${duplicates} already present${
            skippedRows ? `, ${skippedRows} rows skipped` : ''
          }).`,
        })
        return { ...prev, scale: merged }
      })
    } catch (err) {
      setScaleNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  const importLabs = async (file: File) => {
    try {
      const { parseLabsFile, mergeLabPanels } = await import('../../lib/parse-labs')
      const buf = await file.arrayBuffer()
      const { panels, skippedRows } = parseLabsFile(buf)
      const markerCount = panels.reduce((s, p) => s + p.markers.length, 0)
      update((prev) => {
        const { merged, addedPanels, updatedPanels } = mergeLabPanels(prev.labs, panels)
        setLabsNotice({
          kind: 'ok',
          text: `Imported ${markerCount} results across ${panels.length} test date${
            panels.length === 1 ? '' : 's'
          } (${addedPanels} new, ${updatedPanels} updated${
            skippedRows ? `, ${skippedRows} rows skipped` : ''
          }).`,
        })
        return { ...prev, labs: merged }
      })
    } catch (err) {
      setLabsNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  const importBackup = async (file: File) => {
    try {
      const text = await file.text()
      const imported = parseBackup(text)
      if (importMode === 'replace') {
        replace(imported)
      } else {
        update((prev) => mergeBackup(prev, imported))
      }
      setBackupNotice({ kind: 'ok', text: 'Backup imported successfully.' })
    } catch (err) {
      setBackupNotice({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  const noticeEl = (n: Notice) =>
    n && (
      <p
        className={`mt-2 text-sm ${
          n.kind === 'ok'
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400'
        }`}
      >
        {n.text}
      </p>
    )

  const counts: Array<[string, number]> = [
    ['Scale readings', data.scale.length],
    ['Blood pressure readings', data.vitals.length],
    ['Lab panels', data.labs.length],
    ['Injections', data.injections.length],
    ['Measurements', data.measurements.length],
    ['Sleep nights', data.sleep.length],
    ['Journal entries', data.journal.length],
  ]

  return (
    <div className="space-y-4">
      <Card
        title="Where your data lives"
        subtitle="Everything is stored in this browser only. Nothing is uploaded to any server, so download a backup now and then, and use it to move your data to another device."
      >
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {counts.map(([label, n]) => (
            <li key={label} className="rounded-lg bg-[var(--page)] px-3 py-2">
              <span className="block text-lg font-semibold tabular-nums">{n}</span>
              <span className="text-xs text-[var(--muted)]">{label}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Import scale data"
        subtitle="Upload the .xlsx or .csv export from your smart scale app (Body Composition Data). Re-importing is safe: readings you already have are skipped."
      >
        <FilePicker label="Choose scale file…" accept=".xlsx,.xls,.csv" onFile={importScale} />
        {noticeEl(scaleNotice)}
      </Card>

      <Card
        title="Import blood test results"
        subtitle="Upload the CSV export of your Rythm results. Results are grouped by test date; re-importing updates existing values."
      >
        <FilePicker label="Choose results CSV…" accept=".csv,.xlsx" onFile={importLabs} />
        {noticeEl(labsNotice)}
      </Card>

      <Card
        title="Backup and restore"
        subtitle="The backup file contains every entry and setting. Keep a copy somewhere safe (cloud drive, email to yourself) and re-import it to restore or to move devices."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() =>
              downloadFile(
                stampedName('health-dashboard-backup', 'json'),
                buildBackup(data),
                'application/json'
              )
            }
          >
            Download backup (JSON)
          </Button>
          <span className="mx-1 text-[var(--muted)]">·</span>
          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
            className={`${inputClass} w-auto`}
          >
            <option value="merge">Merge with current data</option>
            <option value="replace">Replace current data</option>
          </select>
          <FilePicker label="Import backup…" accept=".json" onFile={importBackup} />
        </div>
        {noticeEl(backupNotice)}
      </Card>

      <Card title="Export as CSV" subtitle="Spreadsheet-friendly exports, one file per section.">
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => downloadFile(stampedName('weight', 'csv'), scaleCsv(data), 'text/csv')}>
            Weight
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('blood-pressure', 'csv'), vitalsCsv(data), 'text/csv')}>
            Blood pressure
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('labs', 'csv'), labsCsv(data), 'text/csv')}>
            Labs
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('injections', 'csv'), injectionsCsv(data), 'text/csv')}>
            Injections
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('measurements', 'csv'), measurementsCsv(data), 'text/csv')}>
            Measurements
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('sleep', 'csv'), sleepCsv(data), 'text/csv')}>
            Sleep
          </Button>
          <Button variant="ghost" onClick={() => downloadFile(stampedName('journal', 'csv'), journalCsv(data), 'text/csv')}>
            Journal
          </Button>
        </div>
      </Card>

      <Card title="Profile" subtitle="Height is used to compute BMI for manual entries; goal weight draws the goal line on the weight chart.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Height (in)">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={data.settings.heightIn ?? ''}
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                update((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, heightIn: Number.isFinite(v as number) ? v : null },
                }))
              }}
              className={inputClass}
              placeholder="e.g. 70"
            />
          </Field>
          <Field label={`Goal weight (${units})`}>
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={
                data.settings.goalWeightLb != null
                  ? round1(weightValue(data.settings.goalWeightLb, units))
                  : ''
              }
              onChange={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                update((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    goalWeightLb:
                      v != null && Number.isFinite(v) ? round1(toCanonicalLb(v, units)) : null,
                  },
                }))
              }}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card title="Danger zone">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  'Delete ALL data from this browser? Download a backup first if you want to keep anything.'
                )
              ) {
                replace(emptyData())
              }
            }}
          >
            Clear all data
          </Button>
          <span className="text-xs text-[var(--muted)]">
            Removes everything stored in this browser. This cannot be undone.
          </span>
        </div>
      </Card>
    </div>
  )
}
