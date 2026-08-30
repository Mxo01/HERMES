import type { Metric, MetricSpec, Room, Status } from '@/shared/models/types'

export interface RoomComparisonProps {
  status: Status
  rooms: Room[]
  outsideRoom: Room
  /** Place the outdoor readings come from, e.g. "Pisa, Italy". */
  outsideLocation?: string | null
  /** Metric catalog from /api/meta; the bars are scaled against it. */
  metricSpecs?: Record<Metric, MetricSpec>
  compact?: boolean
  /** True until the first live-status fetch resolves. */
  loading?: boolean
  /** A failed live-status request — the bars keep showing the last good values. */
  error?: Error
}
