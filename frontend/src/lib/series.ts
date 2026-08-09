/** Turning the API's sparse hourly rows into the dense shapes the charts want. */

import type { HourlyPoint, Metric, Room } from '@/lib/types'

export interface HourBucket {
  hour: Date
  avg: number
  min: number
  max: number
}

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
): HourBucket[] {
  const wanted = new Map<number, HourBucket>()
  const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())

  for (const point of points) {
    if (point.room !== room || point.metric !== metric) continue
    const date = new Date(point.hour)
    wanted.set(hourKey(date), { hour: date, avg: point.avg, min: point.min, max: point.max })
  }

  const series: HourBucket[] = []
  for (let offset = hours - 1; offset >= 0; offset--) {
    const slot = new Date(currentHour.getTime() - offset * 3_600_000)
    const bucket = wanted.get(hourKey(slot))
    if (bucket) series.push(bucket)
  }
  return series
}

export interface HeatCell {
  /** Position within the grid's range, 0–1; null when the hour has no reading. */
  ratio: number | null
  value: number | null
  hour: number
  day: string
}

export interface HeatRow {
  label: string
  date: Date
  cells: HeatCell[]
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

export interface HalfPeriodStat {
  label: string
  now: number
  was: number
  delta: number
}

/**
 * Compare the second half of a range against its first half. More useful than
 * "vs yesterday" over a long window, and it needs no extra request.
 */
export function halfPeriodStats(values: { min: number; avg: number; max: number }[]): HalfPeriodStat[] {
  if (values.length < 2) return []

  const half = Math.floor(values.length / 2)
  const recent = values.slice(half)
  const earlier = values.slice(0, half)
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / (list.length || 1)

  const pairs: [string, number, number][] = [
    ['AVERAGE', mean(recent.map((v) => v.avg)), mean(earlier.map((v) => v.avg))],
    ['PEAK', Math.max(...recent.map((v) => v.max)), Math.max(...earlier.map((v) => v.max))],
    ['LOWEST', Math.min(...recent.map((v) => v.min)), Math.min(...earlier.map((v) => v.min))],
  ]

  return pairs.map(([label, current, previous]) => ({
    label,
    now: current,
    was: previous,
    delta: current - previous,
  }))
}
