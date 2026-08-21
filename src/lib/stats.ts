import dayjs from 'dayjs'
import type { ScaleEntry } from './model'

/** Trailing moving average of weight, keyed by entry id. */
export function movingAverage(entries: ScaleEntry[], windowDays = 7): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  const result = new Map<string, number>()
  for (let i = 0; i < sorted.length; i++) {
    const end = dayjs(sorted[i].dateTime)
    const start = end.subtract(windowDays, 'day')
    const window = sorted.filter((e, j) => j <= i && dayjs(e.dateTime).isAfter(start))
    const avg = window.reduce((s, e) => s + e.weightLb, 0) / window.length
    result.set(sorted[i].id, avg)
  }
  return result
}
