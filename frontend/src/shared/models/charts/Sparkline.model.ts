import type { Metric } from '@/shared/models/types'

export interface SparklineProps {
  /** One slot per sample; `null` where nothing was recorded. */
  values: (number | null)[]
  color: string
  className?: string
  strokeWidth?: number
  /** Restarts the draw animation when it changes. */
  animationKey?: string
  /** Supplying labels and a metric turns on the hover readout. */
  labels?: string[]
  metric?: Metric
  seriesLabel?: string
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
  /** False when a sibling element already states the same loading/error/no-data fact. */
  showStatus?: boolean
}
