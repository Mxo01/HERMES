import type { EnvMetric, Metric, MetricSpec, Room } from '@/shared/models/types'

export interface HeroMetricProps {
  room: Room
  metric: EnvMetric
  accent: string
  value: number | undefined
  min: number | undefined
  max: number | undefined
  outside: number | undefined
  insideSeries: (number | null)[]
  outsideSeries: (number | null)[]
  /** One label per inside sample, shown in the chart tooltip. */
  labels: string[]
  /** Metric catalog from /api/meta; the delta bar is scaled against it. */
  metricSpecs?: Record<Metric, MetricSpec>
  loading?: boolean
  /** A failed request behind the trend chart and the min/max readout. */
  error?: Error
  compact?: boolean
}
