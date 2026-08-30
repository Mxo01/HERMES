import type { TabItem } from '@/shared/models/controls/Tabs.model'
import { Body } from '@/shared/components/shell/Body'
import { LayoutDesktop } from '@/shared/components/shell/LayoutDesktop'
import { LayoutMobile } from '@/shared/components/shell/LayoutMobile'
import { useAlarms, useLiveStatus, useMeta, useNodes } from '@/shared/services/dashboard.service'
import { useClock, useMediaQuery } from '@/hooks/useEnvironment'
import { useRoute } from '@/hooks/useRoute'
import { useSocketConnection } from '@/hooks/useSocketEvent'
import { presetRange } from '@/shared/utils/dates'
import type { DateRange } from '@/shared/models/dates.model'
import {
  ACCENT,
  BEDROOM,
  ENV_METRICS,
  KITCHEN,
  METRIC_ICONS,
  METRIC_TITLES,
  roomIcon,
  roomLabel,
} from '@/shared/utils/metrics'
import type { Alarm, EnvMetric, Room } from '@/shared/models/types'
import type { View } from '@/shared/const/view'
import { useMemo, useState } from 'react'

const ALARM_WINDOW_DAYS = 14
const SIDEBAR_KEY = 'hermes.sidebarCollapsed'

/** Stable empty fallback, so the memo below does not re-run on every render. */
const NO_ALARMS: Alarm[] = []

/**
 * Owns all dashboard state and data fetching, derives what each layout and
 * view need from it, and picks a shell: `LayoutMobile`/`LayoutDesktop` render
 * the chrome, `Body` picks the active view inside it. Below 1024px switches
 * to the phone shell rather than a CSS-only responsive reflow — check both
 * layouts when changing anything here.
 */
export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [view, setView] = useRoute()
  const [room, setRoom] = useState<Room>(KITCHEN)
  const [metric, setMetric] = useState<EnvMetric>('temperature')
  const [range, setRange] = useState<DateRange>(() => presetRange(14))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === '1',
  )
  const onToggleSidebar = () => {
    setSidebarCollapsed((value) => {
      const next = !value
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  const meta = useMeta()
  const nodes = useNodes()
  const alarmLog = useAlarms(ALARM_WINDOW_DAYS)
  const { status, loading: statusLoading, error: statusError } = useLiveStatus()
  const connected = useSocketConnection()
  const now = useClock()

  const accent = ACCENT[metric]
  const alarms = alarmLog.data ?? NO_ALARMS

  // One banner for the whole page: any of these failing means the dashboard
  // is showing stale or incomplete data, which is worth saying once up top
  // rather than leaving every panel to quietly fall back to "no data".
  const apiError = meta.error ?? statusError ?? alarmLog.error ?? nodes.error

  // Derived from the alarm list, which refetches on every alarm event. Reading
  // it from /api/meta instead would leave the header stuck at the count taken
  // when the page loaded, disagreeing with the log right below it.
  const alarmsLast7Days = useMemo(() => {
    const since = Date.now() - 7 * 24 * 60 * 60 * 1000
    return alarms.filter((alarm) => new Date(alarm.startedAt).getTime() >= since).length
  }, [alarms])

  /** Rooms you can select: the physical ones, not the synthetic outdoor one. */
  const roomTabs: TabItem<Room>[] = useMemo(() => {
    const rooms = meta.data?.sensorRooms ?? [KITCHEN, BEDROOM]
    return rooms.map((id) => ({ id, label: roomLabel(id), icon: roomIcon(id) }))
  }, [meta.data])

  const metricTabs: TabItem<EnvMetric>[] = useMemo(
    () =>
      ENV_METRICS.map((id) => ({
        id,
        label: METRIC_TITLES[id],
        accent: ACCENT[id],
        icon: METRIC_ICONS[id],
      })),
    [],
  )

  // Alarms are a section of the live view when there is room for the table.
  const effectiveView: View = isDesktop && view === 'alarms' ? 'live' : view

  const retentionNote =
    effectiveView === 'history' && meta.data
      ? `retention · raw ${meta.data.retention.rawDays}d → hourly forever · downsampling every ${Math.round(
          meta.data.retention.downsamplingIntervalSeconds / 60,
        )}m`
      : undefined

  const body = (
    <Body
      view={effectiveView}
      room={room}
      metric={metric}
      onRoomChange={setRoom}
      onMetricChange={setMetric}
      roomTabs={roomTabs}
      metricTabs={metricTabs}
      meta={meta.data}
      accent={accent}
      compact={!isDesktop}
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={onToggleSidebar}
      range={range}
      onRangeChange={setRange}
      status={status}
      statusLoading={statusLoading}
      statusError={statusError}
      alarms={alarms}
      alarmsLoading={alarmLog.loading}
      alarmsError={alarmLog.error}
      alarmWindowDays={ALARM_WINDOW_DAYS}
    />
  )

  if (isDesktop) {
    return (
      <LayoutDesktop
        view={effectiveView}
        onViewChange={setView}
        connected={connected}
        alarmCount={alarmsLast7Days}
        nodes={nodes.data ?? []}
        nodesLoading={nodes.loading}
        now={now}
        retentionNote={retentionNote}
        sidebarCollapsed={sidebarCollapsed}
        apiError={apiError}
      >
        {body}
      </LayoutDesktop>
    )
  }

  return (
    <LayoutMobile
      view={effectiveView}
      onViewChange={setView}
      connected={connected}
      now={now}
      retentionRawDays={meta.data?.retention.rawDays ?? 7}
      apiError={apiError}
      alarmCount={alarms.length}
    >
      {body}
    </LayoutMobile>
  )
}
