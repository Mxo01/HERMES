import type { DailyPoint, Metric } from '@/shared/models/types'

export interface BandChartProps {
  points: DailyPoint[]
  metric: Metric
  accent: string
  /** Compact drops the axes — used on the phone layout. */
  compact?: boolean
  height?: number
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
  animationKey?: string
}
