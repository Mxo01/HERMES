import type { Alarm, Meta, Status } from '@/shared/models/types'

export interface AlarmsViewProps {
  alarms: Alarm[]
  /** True until the first alarm-log fetch resolves. */
  alarmsLoading: boolean
  alarmsError: Error | undefined
  status: Status
  /** True until the first live-status fetch resolves. */
  statusLoading: boolean
  statusError: Error | undefined
  meta: Meta | undefined
  days: number
}
