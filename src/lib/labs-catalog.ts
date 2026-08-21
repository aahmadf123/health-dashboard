// Preset lab markers with typical adult reference ranges, for quick manual entry.
// Ranges match common US lab conventions (and Rythm's exports where available);
// every value stays editable per entry because labs differ.

export interface LabPreset {
  name: string
  unit: string
  refLow: number | null
  refHigh: number | null
}

export interface LabCategory {
  category: string
  markers: LabPreset[]
}

export const LABS_CATALOG: LabCategory[] = [
  {
    category: 'Metabolic',
    markers: [
      { name: 'Glucose (fasting)', unit: 'mg/dL', refLow: 65, refHigh: 99 },
      { name: 'Hemoglobin A1c', unit: '%', refLow: 4.0, refHigh: 5.6 },
      { name: 'Insulin (fasting)', unit: 'uIU/mL', refLow: 2.6, refHigh: 24.9 },
      { name: 'Fructosamine', unit: 'umol/L', refLow: 205, refHigh: 285 },
      { name: 'Uric Acid', unit: 'mg/dL', refLow: 3.4, refHigh: 7 },
    ],
  },
  {
    category: 'Lipids',
    markers: [
      { name: 'Total Cholesterol', unit: 'mg/dL', refLow: 0, refHigh: 200 },
      { name: 'LDL Cholesterol', unit: 'mg/dL', refLow: 0, refHigh: 130 },
      { name: 'HDL Cholesterol', unit: 'mg/dL', refLow: 40, refHigh: 120 },
      { name: 'Triglycerides', unit: 'mg/dL', refLow: 0, refHigh: 149 },
      { name: 'ApoB', unit: 'mg/dL', refLow: 0, refHigh: 90 },
      { name: 'Remnant Cholesterol', unit: 'mg/dL', refLow: 20, refHigh: 24 },
      { name: 'Total Cholesterol/HDL Ratio', unit: 'ratio', refLow: 3, refHigh: 5.1 },
      { name: 'Triglycerides/HDL Ratio', unit: 'ratio', refLow: 1.25, refHigh: 2.5 },
      { name: 'LDL/ApoB Ratio', unit: 'ratio', refLow: 1.2, refHigh: 1.4 },
      { name: 'Lipoprotein(a)', unit: 'nmol/L', refLow: 0, refHigh: 75 },
    ],
  },
  {
    category: 'Liver',
    markers: [
      { name: 'ALT', unit: 'U/L', refLow: 0, refHigh: 44 },
      { name: 'AST', unit: 'U/L', refLow: 0, refHigh: 40 },
      { name: 'GGT', unit: 'U/L', refLow: 0, refHigh: 71 },
      { name: 'Alkaline Phosphatase (ALP)', unit: 'U/L', refLow: 40, refHigh: 129 },
      { name: 'Total Bilirubin', unit: 'mg/dL', refLow: 0, refHigh: 1.2 },
      { name: 'Albumin', unit: 'g/dL', refLow: 3.5, refHigh: 5.2 },
    ],
  },
  {
    category: 'Kidney',
    markers: [
      { name: 'Creatinine', unit: 'mg/dL', refLow: 0.7, refHigh: 1.2 },
      { name: 'eGFR', unit: 'mL/min/1.73m2', refLow: 60, refHigh: null },
      { name: 'BUN', unit: 'mg/dL', refLow: 6, refHigh: 24 },
      { name: 'Cystatin C', unit: 'mg/L', refLow: 0.5, refHigh: 1.0 },
    ],
  },
  {
    category: 'Blood count',
    markers: [
      { name: 'Hemoglobin', unit: 'g/dL', refLow: 13.5, refHigh: 17.5 },
      { name: 'Hematocrit', unit: '%', refLow: 39, refHigh: 51 },
      { name: 'WBC', unit: 'x10^3/uL', refLow: 3.4, refHigh: 10.8 },
      { name: 'RBC', unit: 'x10^6/uL', refLow: 4.14, refHigh: 5.8 },
      { name: 'Platelets', unit: 'x10^3/uL', refLow: 150, refHigh: 450 },
      { name: 'Ferritin', unit: 'ng/mL', refLow: 29, refHigh: 575 },
      { name: 'Iron', unit: 'ug/dL', refLow: 50, refHigh: 195 },
    ],
  },
  {
    category: 'Thyroid',
    markers: [
      { name: 'Thyroid Stimulating Hormone', unit: 'uIU/mL', refLow: 0.45, refHigh: 4.5 },
      { name: 'Free T3', unit: 'pg/mL', refLow: 2, refHigh: 4.4 },
      { name: 'Free T4', unit: 'ng/dL', refLow: 0.82, refHigh: 1.77 },
    ],
  },
  {
    category: 'Hormones',
    markers: [
      { name: 'Total Testosterone', unit: 'ng/dL', refLow: 250, refHigh: 900 },
      { name: 'Free Testosterone', unit: 'pg/mL', refLow: 46, refHigh: 224 },
      { name: 'SHBG', unit: 'nmol/L', refLow: 13.3, refHigh: 89.5 },
      { name: 'Estrogen', unit: 'pg/mL', refLow: 11.3, refHigh: 43.2 },
      { name: 'Cortisol (AM)', unit: 'ug/dL', refLow: 6.2, refHigh: 19.4 },
      { name: 'DHEA-S', unit: 'ug/dL', refLow: 102.6, refHigh: 416.3 },
      { name: 'Prolactin', unit: 'ng/mL', refLow: 4, refHigh: 15.2 },
    ],
  },
  {
    category: 'Vitamins & inflammation',
    markers: [
      { name: 'Vitamin D', unit: 'ng/mL', refLow: 30, refHigh: 80 },
      { name: 'Vitamin B12', unit: 'pg/mL', refLow: 232, refHigh: 1245 },
      { name: 'Folate', unit: 'ng/mL', refLow: 3, refHigh: null },
      { name: 'hs-CRP (High-Sensitivity C-Reactive Protein)', unit: 'mg/L', refLow: 0, refHigh: 3.0 },
      { name: 'Homocysteine', unit: 'umol/L', refLow: 0, refHigh: 14.5 },
      { name: 'Magnesium', unit: 'mg/dL', refLow: 1.6, refHigh: 2.3 },
    ],
  },
]

export function findPreset(name: string): LabPreset | undefined {
  const n = name.trim().toLowerCase()
  for (const cat of LABS_CATALOG) {
    const hit = cat.markers.find((m) => m.name.toLowerCase() === n)
    if (hit) return hit
  }
  return undefined
}
