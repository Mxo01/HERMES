import type { TabItem } from '@/shared/models/controls/Tabs.model'
import type { DateRange } from '@/shared/models/dates.model'
import type { Alarm, EnvMetric, Meta, Room, Status } from '@/shared/models/types'
import type { View } from '@/shared/const/view'

export interface BodyProps {
  view: View
  room: Room
  metric: EnvMetric
  onRoomChange: (room: Room) => void
  onMetricChange: (metric: EnvMetric) => void
  roomTabs: TabItem<Room>[]
  metricTabs: TabItem<EnvMetric>[]
  meta: Meta | undefined
  accent: string
  compact: boolean
  /** Desktop only: whether the nav rail is currently hidden. */
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  range: DateRange
  onRangeChange: (range: DateRange) => void
  status: Status
  /** True until the first live-status fetch resolves. */
  statusLoading: boolean
  statusError: Error | undefined
  alarms: Alarm[]
  /** True until the first alarm-log fetch resolves. */
  alarmsLoading: boolean
  alarmsError: Error | undefined
  /** How many days back the alarm log covers, in both Live and Alarms. */
  alarmWindowDays: number
}
