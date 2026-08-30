import type { Alarm } from '@/shared/models/types'

export interface GasPanelProps {
  value: number | undefined
  threshold: number
  series: (number | null)[]
  /** One label per sample, for the sparkline's hover readout. */
  labels?: string[]
  lastSpike?: Alarm
  compact?: boolean
  variant?: 'panel' | 'card'
  /** Distinguishes "still fetching" from "sensor has nothing to report". */
  loading?: boolean
  /** A failed request — takes priority over the loading/no-data label. */
  error?: Error
}
