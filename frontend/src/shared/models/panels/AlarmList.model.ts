import type { Alarm } from '@/shared/models/types'

/** Shared by `AlarmTable` (desktop) and `AlarmCards` (phone) — same data, two layouts. */
export interface AlarmListProps {
  alarms: Alarm[]
  /** True until the first fetch for this window resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty message. */
  error?: Error
}
