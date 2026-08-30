import { AlarmsView } from '@/alarms/AlarmsView'
import { HistoryView } from '@/history/HistoryView'
import { LiveView } from '@/live/LiveView'
import type { BodyProps } from '../../models/shell/Body.model'

/**
 * Picks which of the three views is on screen and wires it up. `alarms`
 * never reaches here on desktop — App folds it into `live` there, since a
 * folded-in alarm log doesn't need its own screen when there's room for the
 * table inside Live.
 */
export function Body({
  view,
  room,
  metric,
  onRoomChange,
  onMetricChange,
  roomTabs,
  metricTabs,
  meta,
  accent,
  compact,
  sidebarCollapsed,
  onToggleSidebar,
  range,
  onRangeChange,
  status,
  statusLoading,
  statusError,
  alarms,
  alarmsLoading,
  alarmsError,
  alarmWindowDays,
}: BodyProps) {
  const shared = {
    room,
    metric,
    onRoomChange,
    onMetricChange,
    roomTabs,
    metricTabs,
    meta,
    accent,
    compact,
    sidebarCollapsed,
    onToggleSidebar,
  }

  if (view === 'live') {
    return (
      <LiveView
        {...shared}
        status={status}
        statusLoading={statusLoading}
        statusError={statusError}
        alarms={alarms}
        alarmsLoading={alarmsLoading}
        alarmsError={alarmsError}
      />
    )
  }

  if (view === 'history') {
    return <HistoryView {...shared} range={range} onRangeChange={onRangeChange} />
  }

  return (
    <AlarmsView
      alarms={alarms}
      alarmsLoading={alarmsLoading}
      alarmsError={alarmsError}
      status={status}
      statusLoading={statusLoading}
      statusError={statusError}
      meta={meta}
      days={alarmWindowDays}
    />
  )
}
