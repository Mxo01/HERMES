import type { Metric } from '@/shared/models/types'

export interface TrendChartProps {
  /** One slot per hour; `null` where nothing was recorded. */
  inside: (number | null)[]
  /** Optional outdoor series, drawn as a flat grey reference line behind. */
  outside?: (number | null)[]
  /** One label per inside sample, e.g. `14:00`. */
  labels: string[]
  metric: Metric
  accent: string
  roomLabel: string
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
  className?: string
  animationKey?: string
}
