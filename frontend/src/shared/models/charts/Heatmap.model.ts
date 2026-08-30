import type { HeatRow } from '@/shared/models/charts/series.model'
import type { Metric } from '@/shared/models/types'

export interface HeatmapProps {
  rows: HeatRow[]
  hours: string[]
  accent: string
  metric: Metric
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
}

export interface Focus {
  row: number
  cell: number
  x: number
  y: number
}
