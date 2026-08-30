import { METRIC_DECIMALS, METRIC_UNITS } from '@/shared/utils/metrics'
import type { Metric } from '@/shared/models/types'

const EM_DASH = '—'

export function formatMetric(
  value: number | null | undefined,
  metric: Metric,
  withUnit = true,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH
  const decimals = METRIC_DECIMALS[metric]
  return `${value.toFixed(decimals)}${withUnit ? METRIC_UNITS[metric] : ''}`
}

/**
 * A signed delta, using a true minus sign so digits stay aligned. A change too
 * small to survive rounding is shown unsigned — "−0.0°C" reads as a fall that
 * did not happen.
 */
export function formatDelta(value: number | null | undefined, metric: Metric): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH

  const magnitude = formatMetric(Math.abs(value), metric)
  if (Number.parseFloat(magnitude) === 0) return magnitude

  return `${value >= 0 ? '+' : '−'}${magnitude}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function formatClock(date: Date, withSeconds = false): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  })
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** `06 AUG` — the compact date form used across the tables. */
export function formatDayShort(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]}`
}

export function formatWeekday(date: Date): string {
  return WEEKDAYS[date.getDay()]
}

/** `06 AUG · 19:41` — how the alarm log stamps an event. */
export function formatStamp(iso: string): string {
  const date = new Date(iso)
  return `${formatDayShort(date)} · ${formatClock(date)}`
}

export function formatTick(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function percent(value: number, [min, max]: [number, number]): string {
  const ratio = (value - min) / (max - min || 1)
  return `${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%`
}
