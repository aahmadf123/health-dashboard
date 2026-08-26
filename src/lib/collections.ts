// Shared description of every synced collection, used by both the client and
// the Worker. Keeping the column list in one place means row mapping and the
// upsert SQL are generated rather than hand-written seven times over.

export type CollectionKey =
  | 'scale'
  | 'vitals'
  | 'labs'
  | 'injections'
  | 'measurements'
  | 'sleep'
  | 'journal'

export interface ColumnDef {
  /** SQLite column name. */
  col: string
  /** Field name on the model interface. */
  field: string
  /** 'json' columns hold a JSON-encoded array (SQLite has no array type). */
  type: 'text' | 'real' | 'json'
}

export interface CollectionDef {
  key: CollectionKey
  table: string
  /** The model field holding this entry's own timestamp. */
  dateField: string
  /** The matching SQLite column, used for ordering and range filters. */
  dateCol: string
  /**
   * 'dateTime' collections also store a derived epoch-ms `ts` column, so
   * rollups can shift into local time. 'date' collections store YYYY-MM-DD,
   * which SQLite handles natively and which has no timezone question.
   */
  timeKind: 'dateTime' | 'date'
  /** Columns other than id, the timestamps and deleted_at. */
  columns: ColumnDef[]
}

const t = (col: string, field: string): ColumnDef => ({ col, field, type: 'text' })
const r = (col: string, field: string): ColumnDef => ({ col, field, type: 'real' })

export const COLLECTIONS: CollectionDef[] = [
  {
    key: 'scale',
    table: 'scale',
    dateField: 'dateTime',
    dateCol: 'date_time',
    timeKind: 'dateTime',
    columns: [
      t('date_time', 'dateTime'),
      r('weight_lb', 'weightLb'),
      r('bmi', 'bmi'),
      r('body_fat_pct', 'bodyFatPct'),
      r('muscle_mass_lb', 'muscleMassLb'),
      r('muscle_mass_pct', 'muscleMassPct'),
      r('body_water_pct', 'bodyWaterPct'),
      r('lean_body_mass_lb', 'leanBodyMassLb'),
      r('bone_mass_lb', 'boneMassLb'),
      r('protein_pct', 'proteinPct'),
      r('visceral_fat', 'visceralFat'),
      r('bmr', 'bmr'),
      r('metabolic_age', 'metabolicAge'),
      r('skeletal_muscle_lb', 'skeletalMuscleLb'),
      r('skeletal_muscle_rate_pct', 'skeletalMuscleRatePct'),
      r('fat_content_lb', 'fatContentLb'),
      r('subcutaneous_fat_pct', 'subcutaneousFatPct'),
      t('notes', 'notes'),
    ],
  },
  {
    key: 'vitals',
    table: 'vitals',
    dateField: 'dateTime',
    dateCol: 'date_time',
    timeKind: 'dateTime',
    columns: [
      t('date_time', 'dateTime'),
      r('systolic', 'systolic'),
      r('diastolic', 'diastolic'),
      r('pulse', 'pulse'),
      t('notes', 'notes'),
    ],
  },
  {
    // Markers are not columns; they live in lab_markers and are handled
    // separately because a panel and its markers sync as one unit.
    key: 'labs',
    table: 'labs',
    dateField: 'date',
    dateCol: 'date',
    timeKind: 'date',
    columns: [t('date', 'date'), t('source', 'source'), t('notes', 'notes')],
  },
  {
    key: 'injections',
    table: 'injections',
    dateField: 'dateTime',
    dateCol: 'date_time',
    timeKind: 'dateTime',
    columns: [
      t('date_time', 'dateTime'),
      t('medication', 'medication'),
      r('dose_mg', 'doseMg'),
      t('site', 'site'),
      t('notes', 'notes'),
    ],
  },
  {
    key: 'measurements',
    table: 'measurements',
    dateField: 'date',
    dateCol: 'date',
    timeKind: 'date',
    columns: [
      t('date', 'date'),
      r('neck_in', 'neckIn'),
      r('chest_in', 'chestIn'),
      r('waist_in', 'waistIn'),
      r('hips_in', 'hipsIn'),
      r('left_arm_in', 'leftArmIn'),
      r('right_arm_in', 'rightArmIn'),
      r('left_thigh_in', 'leftThighIn'),
      r('right_thigh_in', 'rightThighIn'),
      t('notes', 'notes'),
    ],
  },
  {
    key: 'sleep',
    table: 'sleep',
    dateField: 'date',
    dateCol: 'date',
    timeKind: 'date',
    columns: [t('date', 'date'), r('hours', 'hours'), r('quality', 'quality'), t('notes', 'notes')],
  },
  {
    key: 'journal',
    table: 'journal',
    dateField: 'dateTime',
    dateCol: 'date_time',
    timeKind: 'dateTime',
    columns: [
      t('date_time', 'dateTime'),
      { col: 'tags', field: 'tags', type: 'json' },
      r('severity', 'severity'),
      t('notes', 'notes'),
    ],
  },
]

export const COLLECTION_KEYS = COLLECTIONS.map((c) => c.key)

export function collectionByKey(key: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.key === key)
}
