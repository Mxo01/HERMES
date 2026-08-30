/**
 * Turning the API's sparse hourly rows into the dense shapes the charts want.
 * Used by both the Live and Alarms domains (gas history), so it lives here
 * rather than under either one.
 */

import type { HourlyPoint, Metric, Room } from '@/shared/models/types'
import type { HeatRow, HourBucket, HourSlot } from '@/shared/models/charts/series.model'

function hourKey(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime()
}

/**
 * A gap-free hourly series ending at the current hour.
 *
 * Nodes drop samples and the backend only stores hours that happened, so the
 * raw rows are sparse; charts need one slot per hour. Missing hours are left
 * out of the returned values rather than zero-filled, which would draw a
 * cliff where there was simply no reading.
 */
export function hourlySeries(
  points: HourlyPoint[],
  room: Room,
  metric: Metric,
  hours: number,
  now = new Date(),
): HourSlot[] {
  const wanted = new Map<number, HourBucket>()
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())

  for (const point of points) {
    if (point.room !== room || point.metric !== metric) continue
    const date = new Date(point.hour)
    wanted.set(hourKey(date), { hour: date, avg: point.avg, min: point.min, max: point.max })
  }

  // One slot per hour, `null` where nothing was recorded. Dropping the empty
  // hours instead would slide the remaining points across the full width and
  // draw an unbroken line over an outage, under an axis still claiming to
  // span the whole window.
  const series: HourSlot[] = []
  for (let offset = hours - 1; offset >= 0; offset--) {
    const slot = new Date(currentHour.getTime() - offset * 3_600_000)
    series.push(wanted.get(hourKey(slot)) ?? null)
  }
  return series
}

/** The averages of a series, with gaps preserved for the charts to break on. */
export function averages(series: HourSlot[]): (number | null)[] {
  return series.map((slot) => (slot ? slot.avg : null))
}

/** Labels for every slot, so a gap still knows which hour it is. */
export function hourLabels(series: HourSlot[], hours: number, now = new Date()): string[] {
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
  return series.map((slot, index) => {
    const at = slot ? slot.hour : new Date(currentHour.getTime() - (hours - 1 - index) * 3_600_000)
    return `${String(at.getHours()).padStart(2, '0')}:00`
  })
}

/** Extent of the recorded values, ignoring gaps. */
export function extentOf(series: HourSlot[]): { min?: number; max?: number } {
  const present = series.filter((slot): slot is HourBucket => slot !== null)
  if (present.length === 0) return {}
  return {
    min: Math.min(...present.map((slot) => slot.min)),
    max: Math.max(...present.map((slot) => slot.max)),
  }
}

const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * A day × hour grid of the last `days` days, each cell scaled 0–1 against the
 * whole grid so the colour ramp compares like with like.
 */
export function heatmapGrid(
  points: HourlyPoint[],
  room: Room,
  metric: Metric,
  days = 7,
  now = new Date(),
): { rows: HeatRow[]; hours: string[] } {
  const byKey = new Map<string, number>()
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY

  for (const point of points) {
    if (point.room !== room || point.metric !== metric) continue
    const date = new Date(point.hour)
    byKey.set(`${date.toDateString()}|${date.getHours()}`, point.avg)
    low = Math.min(low, point.avg)
    high = Math.max(high, point.avg)
  }

  const span = high - low || 1
  const rows: HeatRow[] = []

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(now)
    day.setDate(day.getDate() - dayOffset)

    const label = WEEKDAY_LABELS[day.getDay()]
    rows.push({
      label,
      date: new Date(day),
      cells: Array.from({ length: 24 }, (_, hour) => {
        const value = byKey.get(`${day.toDateString()}|${hour}`)
        return {
          ratio: value === undefined ? null : (value - low) / span,
          value: value ?? null,
          hour,
          day: label,
        }
      }),
    })
  }

  const hours = Array.from({ length: 24 }, (_, hour) =>
    hour % 3 === 0 ? String(hour).padStart(2, '0') : '',
  )

  return { rows, hours }
}
