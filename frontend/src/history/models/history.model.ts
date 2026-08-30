import type { Resolution } from '@/shared/models/types'

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

export interface HalfPeriodStat {
  label: string
  now: number
  was: number
  delta: number
}
