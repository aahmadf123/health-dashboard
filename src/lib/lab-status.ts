import type { LabStatus } from './model'

export function statusFromRange(
  value: number | null,
  refLow: number | null,
  refHigh: number | null
): LabStatus {
  if (value === null) return 'unknown'
  if (refLow !== null && value < refLow) return 'outOfRange'
  if (refHigh !== null && value > refHigh) return 'outOfRange'
  if (refLow === null && refHigh === null) return 'unknown'
  return 'average'
}
