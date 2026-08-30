/** Pure helpers for the History domain — day-by-day table prep, pagination, period comparison. */

import { formatDayShort, formatWeekday } from '@/shared/utils/format'
import { fromISODate } from '@/shared/utils/dates'
import type { DailyPoint } from '@/shared/models/types'
import type { Page } from '@/shared/models/pagination.model'
import type { DayRow, HalfPeriodStat } from './models/history.model'

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
        barWidth: `${(((point.max - point.min) / span) * 100).toFixed(1)}%`,
        dotLeft: `${ratio(point.avg).toFixed(1)}%`,
        alarms: point.alarms,
        resolution: point.resolution,
      }
    })
    .reverse()
}

/** The empty state for a day-by-day table, shared by its desktop and phone variants. */
export function dayTableEmptyMessage(
  loading: boolean | undefined,
  error: Error | undefined,
): string {
  if (error) return "Couldn't load. Check the connection and try again."
  if (loading) return 'Loading…'
  return 'No readings in this range.'
}

/** Tone for a day's change against the previous one — quiet, up (accent), or down (cool). */
export function dayDeltaColor(delta: number | null, quietDelta: number, accent: string): string {
  if (delta === null) return 'var(--color-chalk-trace)'
  if (Math.abs(delta) < quietDelta) return 'var(--color-chalk-faint)'
  return delta > 0 ? accent : 'var(--color-signal-cool)'
}

export function paginate<T>(items: T[], pageIndex: number, size: number): Page<T> {
  const count = Math.max(1, Math.ceil(items.length / size))
  const index = Math.min(Math.max(0, pageIndex), count - 1)
  const from = index * size
  const to = Math.min(items.length, from + size)

  return { items: items.slice(from, to), index, count, from, to, total: items.length }
}

/**
 * Compare the second half of a range against its first half. More useful than
 * "vs yesterday" over a long window, and it needs no extra request.
 */
export function halfPeriodStats(
  values: { min: number; avg: number; max: number }[],
): HalfPeriodStat[] {
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
