import dayjs from 'dayjs'
import { emptyData, type AppData } from './model'

// Backup export/import and CSV export. Everything is client-side; files are
// generated in the browser and downloaded directly.

export interface BackupFile {
  app: 'health-dashboard'
  exportedAt: string
  data: AppData
}

export function buildBackup(data: AppData): string {
  const backup: BackupFile = {
    app: 'health-dashboard',
    exportedAt: new Date().toISOString(),
    data,
  }
  return JSON.stringify(backup, null, 2)
}

export function parseBackup(text: string): AppData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const obj = raw as Partial<BackupFile> & Partial<AppData>
  // Accept either a full backup file or a bare AppData object.
  const candidate = (obj.app === 'health-dashboard' && obj.data ? obj.data : raw) as Partial<AppData>
  if (typeof candidate !== 'object' || candidate === null || candidate.version !== 1) {
    throw new Error('This does not look like a Health Dashboard backup file.')
  }
  const base = emptyData()
  const lists = [
    'scale',
    'vitals',
    'labs',
    'injections',
    'measurements',
    'sleep',
    'journal',
  ] as const
  const result: AppData = {
    ...base,
    settings: { ...base.settings, ...(candidate.settings ?? {}) },
  }
  for (const key of lists) {
    const value = candidate[key]
    if (!Array.isArray(value)) {
      throw new Error(`Backup is missing the "${key}" list.`)
    }
    // Assigning through a record keeps TS happy about the heterogeneous lists.
    ;(result as unknown as Record<string, unknown>)[key] = value
  }
  result.settings.injectionSchedule = {
    ...base.settings.injectionSchedule,
    ...(candidate.settings?.injectionSchedule ?? {}),
  }
  return result
}

/** Merge two datasets, deduplicating list entries by id (imported wins). */
export function mergeBackup(current: AppData, imported: AppData): AppData {
  const mergeById = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const map = new Map<string, T>()
    for (const item of a) map.set(item.id, item)
    for (const item of b) map.set(item.id, item)
    return [...map.values()]
  }
  return {
    version: 1,
    settings: imported.settings,
    scale: mergeById(current.scale, imported.scale).sort((a, b) =>
      a.dateTime.localeCompare(b.dateTime)
    ),
    vitals: mergeById(current.vitals, imported.vitals).sort((a, b) =>
      a.dateTime.localeCompare(b.dateTime)
    ),
    labs: mergeById(current.labs, imported.labs).sort((a, b) => a.date.localeCompare(b.date)),
    injections: mergeById(current.injections, imported.injections).sort((a, b) =>
      a.dateTime.localeCompare(b.dateTime)
    ),
    measurements: mergeById(current.measurements, imported.measurements).sort((a, b) =>
      a.date.localeCompare(b.date)
    ),
    sleep: mergeById(current.sleep, imported.sleep).sort((a, b) => a.date.localeCompare(b.date)),
    journal: mergeById(current.journal, imported.journal).sort((a, b) =>
      a.dateTime.localeCompare(b.dateTime)
    ),
  }
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
}

export function scaleCsv(data: AppData): string {
  return toCsv(
    [
      'date_time', 'weight_lb', 'bmi', 'body_fat_pct', 'muscle_mass_lb', 'muscle_mass_pct',
      'body_water_pct', 'lean_body_mass_lb', 'bone_mass_lb', 'protein_pct', 'visceral_fat',
      'bmr', 'metabolic_age', 'skeletal_muscle_lb', 'skeletal_muscle_rate_pct',
      'fat_content_lb', 'subcutaneous_fat_pct', 'notes',
    ],
    data.scale.map((e) => [
      e.dateTime, e.weightLb, e.bmi, e.bodyFatPct, e.muscleMassLb, e.muscleMassPct,
      e.bodyWaterPct, e.leanBodyMassLb, e.boneMassLb, e.proteinPct, e.visceralFat,
      e.bmr, e.metabolicAge, e.skeletalMuscleLb, e.skeletalMuscleRatePct,
      e.fatContentLb, e.subcutaneousFatPct, e.notes,
    ])
  )
}

export function vitalsCsv(data: AppData): string {
  return toCsv(
    ['date_time', 'systolic', 'diastolic', 'pulse', 'notes'],
    data.vitals.map((e) => [e.dateTime, e.systolic, e.diastolic, e.pulse, e.notes])
  )
}

export function labsCsv(data: AppData): string {
  const rows: unknown[][] = []
  for (const panel of data.labs) {
    for (const m of panel.markers) {
      const range =
        m.refLow !== null && m.refHigh !== null
          ? `${m.refLow} - ${m.refHigh}`
          : m.refLow !== null
            ? `> ${m.refLow}`
            : m.refHigh !== null
              ? `< ${m.refHigh}`
              : ''
      rows.push([m.name, m.valueText, m.unit, range, m.status, panel.date, panel.source])
    }
  }
  return toCsv(['marker', 'value', 'unit', 'reference_range', 'status', 'time', 'source'], rows)
}

export function injectionsCsv(data: AppData): string {
  return toCsv(
    ['date_time', 'medication', 'dose_mg', 'site', 'notes'],
    data.injections.map((e) => [e.dateTime, e.medication, e.doseMg, e.site, e.notes])
  )
}

export function measurementsCsv(data: AppData): string {
  return toCsv(
    ['date', 'neck_in', 'chest_in', 'waist_in', 'hips_in', 'left_arm_in', 'right_arm_in',
      'left_thigh_in', 'right_thigh_in', 'notes'],
    data.measurements.map((e) => [
      e.date, e.neckIn, e.chestIn, e.waistIn, e.hipsIn, e.leftArmIn, e.rightArmIn,
      e.leftThighIn, e.rightThighIn, e.notes,
    ])
  )
}

export function sleepCsv(data: AppData): string {
  return toCsv(
    ['date', 'hours', 'quality_1_to_5', 'notes'],
    data.sleep.map((e) => [e.date, e.hours, e.quality, e.notes])
  )
}

export function journalCsv(data: AppData): string {
  return toCsv(
    ['date_time', 'tags', 'severity_1_to_5', 'notes'],
    data.journal.map((e) => [e.dateTime, e.tags.join('; '), e.severity, e.notes])
  )
}

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function stampedName(prefix: string, ext: string): string {
  return `${prefix}-${dayjs().format('YYYYMMDD-HHmmss')}.${ext}`
}
