import { read, utils } from 'xlsx'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { newId, type LabMarker, type LabPanel, type LabStatus } from './model'
import { statusFromRange } from './lab-status'

export { statusFromRange }

dayjs.extend(customParseFormat)

// Parses Rythm blood test CSV exports with columns:
// marker,value,unit,reference_range,status,time
// value may be non-numeric like ">17.5"; reference_range looks like "2 - 4.4";
// status is optimal | average | outOfRange; time is YYYY-MM-DD.

function normHeader(h: unknown): string {
  return String(h ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function parseRange(raw: string): { low: number | null; high: number | null } {
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/)
  if (m) return { low: Number(m[1]), high: Number(m[2]) }
  const gt = raw.match(/^[>≥]\s*(-?\d+(?:\.\d+)?)/)
  if (gt) return { low: Number(gt[1]), high: null }
  const lt = raw.match(/^[<≤]\s*(-?\d+(?:\.\d+)?)/)
  if (lt) return { low: null, high: Number(lt[1]) }
  return { low: null, high: null }
}

const LAB_DATE_FORMATS = ['YYYY-MM-DD', 'M/D/YY', 'M/D/YYYY', 'MM/DD/YYYY', 'YYYY.MM.DD']

function normalizeDate(raw: unknown): string | null {
  if (raw instanceof Date) return dayjs(raw).format('YYYY-MM-DD')
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  for (const f of LAB_DATE_FORMATS) {
    const d = dayjs(s, f, true)
    if (d.isValid()) return d.format('YYYY-MM-DD')
  }
  return null
}

function parseStatus(raw: string): LabStatus {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (s === 'optimal') return 'optimal'
  if (s === 'average' || s === 'normal' || s === 'inrange') return 'average'
  if (s === 'outofrange' || s === 'high' || s === 'low' || s === 'abnormal') return 'outOfRange'
  return 'unknown'
}

export interface LabsImportResult {
  panels: LabPanel[]
  skippedRows: number
}

export function parseLabsFile(buffer: ArrayBuffer): LabsImportResult {
  const wb = read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('The file contains no sheets.')
  // dateNF keeps date-like cells in ISO form instead of SheetJS's default m/d/yy.
  const rows: unknown[][] = utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: '',
    dateNF: 'yyyy-mm-dd',
  })
  if (rows.length === 0) throw new Error('The file is empty.')

  const headers = rows[0].map(normHeader)
  const col = (name: string) => headers.indexOf(name)
  const markerCol = col('marker')
  const valueCol = col('value')
  const unitCol = col('unit')
  const rangeCol = col('referencerange')
  const statusCol = col('status')
  const timeCol = headers.findIndex((h) => h === 'time' || h === 'date')

  if (markerCol === -1 || valueCol === -1 || timeCol === -1) {
    throw new Error(
      'Could not find "marker", "value", and "time" columns. Is this a Rythm results export?'
    )
  }

  const byDate = new Map<string, LabMarker[]>()
  let skippedRows = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue
    const name = String(row[markerCol] ?? '').trim()
    const valueText = String(row[valueCol] ?? '').trim()
    const date = normalizeDate(row[timeCol])
    if (!name || !valueText || !date) {
      skippedRows++
      continue
    }
    const numMatch = valueText.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    const value = numMatch ? Number(numMatch[0]) : null
    const { low, high } = parseRange(rangeCol >= 0 ? String(row[rangeCol] ?? '') : '')
    let status = parseStatus(statusCol >= 0 ? String(row[statusCol] ?? '') : '')
    if (status === 'unknown') status = statusFromRange(value, low, high)

    const marker: LabMarker = {
      name,
      value,
      valueText,
      unit: unitCol >= 0 ? String(row[unitCol] ?? '').trim() : '',
      refLow: low,
      refHigh: high,
      status,
    }
    const list = byDate.get(date) ?? []
    list.push(marker)
    byDate.set(date, list)
  }

  const panels: LabPanel[] = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, markers]) => ({ id: newId(), date, source: 'Rythm', markers }))

  return { panels, skippedRows }
}

/**
 * Merge imported panels into existing ones. A panel with the same date and source
 * is merged marker-by-marker (imported values win); otherwise the panel is added.
 */
export function mergeLabPanels(
  existing: LabPanel[],
  imported: LabPanel[]
): { merged: LabPanel[]; addedPanels: number; updatedPanels: number } {
  const merged = existing.map((p) => ({ ...p, markers: [...p.markers] }))
  let addedPanels = 0
  let updatedPanels = 0
  for (const panel of imported) {
    const match = merged.find((p) => p.date === panel.date && p.source === panel.source)
    if (!match) {
      merged.push(panel)
      addedPanels++
      continue
    }
    for (const m of panel.markers) {
      const idx = match.markers.findIndex(
        (x) => x.name.toLowerCase() === m.name.toLowerCase()
      )
      if (idx >= 0) match.markers[idx] = m
      else match.markers.push(m)
    }
    updatedPanels++
  }
  merged.sort((a, b) => a.date.localeCompare(b.date))
  return { merged, addedPanels, updatedPanels }
}
