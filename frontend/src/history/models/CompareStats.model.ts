import type { HalfPeriodStat } from '../models/history.model'
import type { Metric } from '@/shared/models/types'

export interface CompareStatsProps {
  stats: HalfPeriodStat[]
  metric: Metric
  accent: string
  quietDelta: number
  compact?: boolean
  /** True until the first fetch for this range resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty note. */
  error?: Error
}
