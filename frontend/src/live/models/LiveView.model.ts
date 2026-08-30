import type { TabItem } from '@/shared/models/controls/Tabs.model'
import type { Alarm, EnvMetric, Meta, Room, Status } from '@/shared/models/types'

export interface LiveViewProps {
  room: Room
  metric: EnvMetric
  onRoomChange: (room: Room) => void
  onMetricChange: (metric: EnvMetric) => void
  roomTabs: TabItem<Room>[]
  metricTabs: TabItem<EnvMetric>[]
  status: Status
  /** True until the first live-status fetch resolves. */
  statusLoading: boolean
  /** A failed live-status request; the hero, gas panel and room grid keep the last good values. */
  statusError: Error | undefined
  meta: Meta | undefined
  alarms: Alarm[]
  /** True until the first alarm-log fetch resolves. */
  alarmsLoading: boolean
  alarmsError: Error | undefined
  accent: string
  compact: boolean
  /** Desktop only: whether the nav rail is currently hidden. */
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}
