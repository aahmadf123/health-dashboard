// Core data model. All data lives in localStorage; nothing leaves the browser.

export type Units = 'lb' | 'kg'
export type Theme = 'system' | 'light' | 'dark'

export interface ScaleEntry {
  id: string
  dateTime: string // ISO 8601
  weightLb: number
  bmi?: number | null
  bodyFatPct?: number | null
  muscleMassLb?: number | null
  muscleMassPct?: number | null
  bodyWaterPct?: number | null
  leanBodyMassLb?: number | null
  boneMassLb?: number | null
  proteinPct?: number | null
  visceralFat?: number | null
  bmr?: number | null
  metabolicAge?: number | null
  skeletalMuscleLb?: number | null
  skeletalMuscleRatePct?: number | null
  fatContentLb?: number | null
  subcutaneousFatPct?: number | null
  notes?: string
}

export interface VitalEntry {
  id: string
  dateTime: string
  systolic: number
  diastolic: number
  pulse?: number | null
  notes?: string
}

export type LabStatus = 'optimal' | 'average' | 'outOfRange' | 'unknown'

export interface LabMarker {
  name: string
  /** Numeric value when parseable; null for values like ">17.5" (see valueText). */
  value: number | null
  /** Raw value as entered or imported, e.g. ">17.5". */
  valueText: string
  unit: string
  refLow: number | null
  refHigh: number | null
  status: LabStatus
}

export interface LabPanel {
  id: string
  date: string // YYYY-MM-DD
  source: string
  markers: LabMarker[]
  notes?: string
}

export type InjectionSite =
  | 'Abdomen (left)'
  | 'Abdomen (right)'
  | 'Thigh (left)'
  | 'Thigh (right)'
  | 'Upper arm (left)'
  | 'Upper arm (right)'

export const INJECTION_SITES: InjectionSite[] = [
  'Abdomen (left)',
  'Abdomen (right)',
  'Thigh (left)',
  'Thigh (right)',
  'Upper arm (left)',
  'Upper arm (right)',
]

export interface InjectionEntry {
  id: string
  dateTime: string
  medication: string
  doseMg: number
  site?: InjectionSite | ''
  notes?: string
}

export interface MeasurementEntry {
  id: string
  date: string // YYYY-MM-DD
  neckIn?: number | null
  chestIn?: number | null
  waistIn?: number | null
  hipsIn?: number | null
  leftArmIn?: number | null
  rightArmIn?: number | null
  leftThighIn?: number | null
  rightThighIn?: number | null
  notes?: string
}

export interface SleepEntry {
  id: string
  date: string // YYYY-MM-DD (the morning you woke up)
  hours: number
  quality?: number | null // 1-5
  notes?: string
}

export const JOURNAL_TAGS = [
  'Nausea',
  'Vomiting',
  'Constipation',
  'Diarrhea',
  'Heartburn',
  'Fatigue',
  'Headache',
  'Dizziness',
  'Low appetite',
  'Food aversion',
  'Injection site reaction',
  'Low mood',
  'Good mood',
  'Low energy',
  'High energy',
] as const

export interface JournalEntry {
  id: string
  dateTime: string
  tags: string[]
  severity?: number | null // 1-5
  notes?: string
}

export interface InjectionSchedule {
  medication: string
  doseMg: number
  intervalDays: number
}

export interface Settings {
  units: Units
  theme: Theme
  heightIn?: number | null
  goalWeightLb?: number | null
  injectionSchedule: InjectionSchedule
}

export interface AppData {
  version: 1
  settings: Settings
  scale: ScaleEntry[]
  vitals: VitalEntry[]
  labs: LabPanel[]
  injections: InjectionEntry[]
  measurements: MeasurementEntry[]
  sleep: SleepEntry[]
  journal: JournalEntry[]
}

export const WEGOVY_DOSES_MG = [0.25, 0.5, 1, 1.7, 2.4]

export function emptyData(): AppData {
  return {
    version: 1,
    settings: {
      units: 'lb',
      theme: 'system',
      heightIn: null,
      goalWeightLb: null,
      injectionSchedule: {
        medication: 'Wegovy (semaglutide)',
        doseMg: 0.25,
        intervalDays: 7,
      },
    },
    scale: [],
    vitals: [],
    labs: [],
    injections: [],
    measurements: [],
    sleep: [],
    journal: [],
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}
