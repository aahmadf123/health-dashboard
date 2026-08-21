// Blood pressure categories per American Heart Association guidance.

export interface BpCategory {
  key: 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis'
  label: string
}

export function bpCategory(systolic: number, diastolic: number): BpCategory {
  if (systolic > 180 || diastolic > 120) {
    return { key: 'crisis', label: 'Hypertensive crisis' }
  }
  if (systolic >= 140 || diastolic >= 90) {
    return { key: 'stage2', label: 'Hypertension stage 2' }
  }
  if (systolic >= 130 || diastolic >= 80) {
    return { key: 'stage1', label: 'Hypertension stage 1' }
  }
  if (systolic >= 120) {
    return { key: 'elevated', label: 'Elevated' }
  }
  return { key: 'normal', label: 'Normal' }
}

/** Tailwind classes for a category badge. */
export function bpBadgeClass(key: BpCategory['key']): string {
  switch (key) {
    case 'normal':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    case 'elevated':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    case 'stage1':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
    case 'stage2':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
    case 'crisis':
      return 'bg-red-600 text-white dark:bg-red-700 dark:text-white'
  }
}
