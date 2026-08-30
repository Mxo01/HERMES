/** Local-time date helpers. Everything here works in the viewer's timezone. */

import type { DateRange, MonthGrid, MonthCell, RangePreset } from '@/shared/models/dates.model'

export const DAY_MS = 86_400_000

export function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Whole days spanned by a range, inclusive of both ends. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) + 1
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** Parse `YYYY-MM-DD` as a *local* midnight, not a UTC one. */
export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

export const MONTH_NAMES = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

/** Monday-first weekday initials, matching the calendar grid. */
export const WEEK_DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** A Monday-first month grid, with leading blanks so columns line up. */
export function buildMonthGrid(anchor: Date, monthOffset = 0): MonthGrid {
  const year = anchor.getFullYear()
  const month = anchor.getMonth() + monthOffset
  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7

  const cells: MonthCell[] = Array.from({ length: lead }, () => ({ date: null, label: '' }))
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), label: String(day) })
  }

  return { name: `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`, cells }
}

export const RANGE_PRESETS: RangePreset[] = [
  { label: 'LAST 7 DAYS', days: 7 },
  { label: 'LAST 14 DAYS', days: 14 },
  { label: 'LAST 21 DAYS', days: 21 },
  { label: 'LAST 30 DAYS', days: 30 },
]

export function presetRange(days: number, today = new Date()): DateRange {
  const end = startOfDay(today)
  return { from: addDays(end, -(days - 1)), to: end }
}
