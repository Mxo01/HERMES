import type { DayRow } from '../models/history.model'
import type { Metric } from '@/shared/models/types'

export interface DayTableProps {
  rows: DayRow[]
  metric: Metric
  accent: string
  /** Values within this fraction of the range read as "no real change". */
  quietDelta: number
  /** True until the first fetch for this range resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty message. */
  error?: Error
}
