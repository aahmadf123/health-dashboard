// Chart colors from the validated reference palette (dataviz skill).
// Light and dark are separately validated steps of the same hues.

export interface ChartColors {
  surface: string
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  s1: string // blue
  s2: string // orange
  s3: string // aqua
  good: string
  warning: string
  serious: string
  critical: string
  divergingMid: string
}

export const LIGHT: ChartColors = {
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  s1: '#2a78d6',
  s2: '#eb6834',
  s3: '#1baf7a',
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  divergingMid: '#f0efec',
}

export const DARK: ChartColors = {
  surface: '#1a1a19',
  ink: '#ffffff',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  s1: '#3987e5',
  s2: '#d95926',
  s3: '#199e70',
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
  divergingMid: '#383835',
}
