import { formatDayShort, formatWeekday } from '@/lib/format'
import { fromISODate } from '@/lib/dates'
import type { DailyPoint, Resolution } from '@/lib/types'

export interface DayRow {
  key: string
  date: string
  weekday: string
  min: number
  avg: number
  max: number
  /** Change in daily average against the previous day; null on the first day. */
  delta: number | null
  /** Position of this day's min–max span within the whole range, as CSS widths. */
  barLeft: string
  barWidth: string
  dotLeft: string
  alarms: number
  resolution: Resolution
}

/**
 * Prepare the day-by-day table. Rows come back newest first — when you open
 * the history you are almost always asking about the recent past.
 */
export function buildDayRows(points: DailyPoint[]): DayRow[] {
  if (points.length === 0) return []

  const low = Math.min(...points.map((point) => point.min))
  const high = Math.max(...points.map((point) => point.max))
  const span = high - low || 1
  const ratio = (value: number) => ((value - low) / span) * 100

  return points
    .map((point, index) => {
      const date = fromISODate(point.day)
      const previous = index > 0 ? points[index - 1].avg : null

      return {
        key: point.day,
        date: formatDayShort(date),
        weekday: formatWeekday(date),
        min: point.min,
        avg: point.avg,
        max: point.max,
        delta: previous === null ? null : point.avg - previous,
        barLeft: `${ratio(point.min).toFixed(1)}%`,
        barWidth: `${((point.max - point.min) / span * 100).toFixed(1)}%`,
        dotLeft: `${ratio(point.avg).toFixed(1)}%`,
        alarms: point.alarms,
        resolution: point.resolution,
      }
    })
    .reverse()
}

export interface Page<T> {
  items: T[]
  index: number
  count: number
  from: number
  to: number
  total: number
}

export function paginate<T>(items: T[], pageIndex: number, size: number): Page<T> {
  const count = Math.max(1, Math.ceil(items.length / size))
  const index = Math.min(Math.max(0, pageIndex), count - 1)
  const from = index * size
  const to = Math.min(items.length, from + size)

  return { items: items.slice(from, to), index, count, from, to, total: items.length }
}
