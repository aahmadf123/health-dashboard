import dayjs from 'dayjs'
import type { Units } from './model'

export const LB_PER_KG = 2.20462

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG
}

export function inToCm(inches: number): number {
  return inches * 2.54
}

export function cmToIn(cm: number): number {
  return cm / 2.54
}

/** Display a canonical-lb weight in the selected units. */
export function displayWeight(lb: number, units: Units, decimals = 1): string {
  const v = units === 'kg' ? lbToKg(lb) : lb
  return `${v.toFixed(decimals)} ${units}`
}

export function weightValue(lb: number, units: Units): number {
  return units === 'kg' ? lbToKg(lb) : lb
}

/** Convert a user-entered weight in the selected units back to canonical lb. */
export function toCanonicalLb(value: number, units: Units): number {
  return units === 'kg' ? kgToLb(value) : value
}

export function displayLength(inches: number, units: Units, decimals = 1): string {
  return units === 'kg'
    ? `${inToCm(inches).toFixed(decimals)} cm`
    : `${inches.toFixed(decimals)} in`
}

export function lengthValue(inches: number, units: Units): number {
  return units === 'kg' ? inToCm(inches) : inches
}

export function toCanonicalIn(value: number, units: Units): number {
  return units === 'kg' ? cmToIn(value) : value
}

export function fmtDate(iso: string): string {
  return dayjs(iso).format('MMM D, YYYY')
}

export function fmtDateTime(iso: string): string {
  return dayjs(iso).format('MMM D, YYYY h:mm A')
}

export function fmtShortDate(iso: string): string {
  return dayjs(iso).format('MMM D')
}

/** BMI from weight (lb) and height (in). */
export function bmi(weightLb: number, heightIn: number): number {
  return (703 * weightLb) / (heightIn * heightIn)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}
