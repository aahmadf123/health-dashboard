import { read, utils } from 'xlsx'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { newId, type ScaleEntry } from './model'
import { kgToLb } from './format'

dayjs.extend(customParseFormat)

// Parses smart scale "Body Composition Data" exports (.xlsx or .csv).
// Layout: a title row, then a header row (Number, Date and Time, Weight(lb), ...),
// then data rows with units embedded in the values ("321.9lb", "59.7%", "- -").

const HEADER_MAP: Record<string, keyof ScaleEntry> = {
  'weight(lb)': 'weightLb',
  'bmi': 'bmi',
  'body fat': 'bodyFatPct',
  'muscle mass': 'muscleMassLb',
  'muscle mass %': 'muscleMassPct',
  'body water': 'bodyWaterPct',
  'lean body mass': 'leanBodyMassLb',
  'bone mass': 'boneMassLb',
  'protein': 'proteinPct',
  'visceral fat': 'visceralFat',
  'bmr': 'bmr',
  'metabolic age': 'metabolicAge',
  'skeletal muscle': 'skeletalMuscleLb',
  'skeletal muscle rate %': 'skeletalMuscleRatePct',
  'fat content': 'fatContentLb',
  'subcutaneous fat': 'subcutaneousFatPct',
}

function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseNumeric(raw: unknown): number | null {
  const s = String(raw ?? '').trim()
  if (!s || s === '- -' || s === '--' || s === '-') return null
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

const DATE_FORMATS = [
  'YYYY.MM.DD hh:mm A',
  'YYYY.MM.DD HH:mm',
  'YYYY-MM-DD hh:mm A',
  'YYYY-MM-DD HH:mm',
  'MM/DD/YYYY hh:mm A',
  'M/D/YYYY h:mm A',
  'YYYY.MM.DD',
  'YYYY-MM-DD',
]

function parseDateTime(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  for (const f of DATE_FORMATS) {
    const d = dayjs(s, f, true)
    if (d.isValid()) return d.toISOString()
  }
  const d = dayjs(s)
  return d.isValid() ? d.toISOString() : null
}

export interface ScaleImportResult {
  entries: ScaleEntry[]
  skippedRows: number
}

export function parseScaleFile(buffer: ArrayBuffer): ScaleImportResult {
  const wb = read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('The file contains no sheets.')
  const rows: unknown[][] = utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
  })

  // Locate the header row: it must contain a date column and a weight column.
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(normHeader)
    if (cells.some((c) => c.includes('date')) && cells.some((c) => c.includes('weight'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      'Could not find a header row with "Date" and "Weight" columns. Is this a scale export?'
    )
  }

  const headers = rows[headerIdx].map(normHeader)
  const dateCol = headers.findIndex((h) => h.includes('date'))
  const weightLbCol = headers.indexOf('weight(lb)')
  const weightKgCol = headers.indexOf('weight(kg)')

  const entries: ScaleEntry[] = []
  let skippedRows = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue

    const dateTime = parseDateTime(row[dateCol])
    let weightLb = weightLbCol >= 0 ? parseNumeric(row[weightLbCol]) : null
    if (weightLb === null && weightKgCol >= 0) {
      const kg = parseNumeric(row[weightKgCol])
      if (kg !== null) weightLb = kgToLb(kg)
    }
    if (!dateTime || weightLb === null) {
      skippedRows++
      continue
    }

    const entry: ScaleEntry = { id: newId(), dateTime, weightLb }
    headers.forEach((h, col) => {
      const field = HEADER_MAP[h]
      if (!field || field === 'weightLb') return
      const v = parseNumeric(row[col])
      if (v !== null) (entry as unknown as Record<string, unknown>)[field] = v
    })
    entries.push(entry)
  }

  return { entries, skippedRows }
}

/** Merge imported entries into existing ones, deduplicating by timestamp (to the minute). */
export function mergeScaleEntries(
  existing: ScaleEntry[],
  imported: ScaleEntry[]
): { merged: ScaleEntry[]; added: number; duplicates: number } {
  const seen = new Set(existing.map((e) => dayjs(e.dateTime).format('YYYY-MM-DD HH:mm')))
  const merged = [...existing]
  let added = 0
  let duplicates = 0
  for (const e of imported) {
    const key = dayjs(e.dateTime).format('YYYY-MM-DD HH:mm')
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    merged.push(e)
    added++
  }
  merged.sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  return { merged, added, duplicates }
}
