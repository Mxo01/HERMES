import type { TabItem } from '@/shared/models/controls/Tabs.model'
import type { DateRange } from '@/shared/models/dates.model'
import type { EnvMetric, Meta, Room } from '@/shared/models/types'

export interface HistoryViewProps {
  room: Room
  metric: EnvMetric
  onRoomChange: (room: Room) => void
  onMetricChange: (metric: EnvMetric) => void
  roomTabs: TabItem<Room>[]
  metricTabs: TabItem<EnvMetric>[]
  range: DateRange
  onRangeChange: (range: DateRange) => void
  meta: Meta | undefined
  accent: string
  compact: boolean
  /** Desktop only: whether the nav rail is currently hidden. */
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}
