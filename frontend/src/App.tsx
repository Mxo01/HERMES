import { useMemo, useState } from 'react'
import { Sidebar } from '@/components/shell/Sidebar'
import { BottomTabs } from '@/components/shell/BottomTabs'
import { ErrorBanner } from '@/components/shell/ErrorBanner'
import { AlarmsView } from '@/features/alarms/AlarmsView'
import { HistoryView } from '@/features/history/HistoryView'
import { LiveView } from '@/features/live/LiveView'
import { useAlarms, useLiveStatus, useMeta, useNodes } from '@/hooks/useDashboardData'
import { useClock, useMediaQuery } from '@/hooks/useEnvironment'
import { useRoute } from '@/hooks/useRoute'
import { useSocketConnection } from '@/hooks/useSocketEvent'
import { presetRange, type DateRange } from '@/lib/dates'
import { formatClock } from '@/lib/format'
import { ACCENT, ENV_METRICS, METRIC_ICONS, METRIC_TITLES, roomIcon, roomLabel } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import type { Alarm, EnvMetric, Room } from '@/lib/types'
import type { View } from '@/lib/view'
import type { TabItem } from '@/components/controls/Tabs'

const ALARM_WINDOW_DAYS = 14
const SIDEBAR_KEY = 'hermes.sidebarCollapsed'

/** Stable empty fallback, so the memo below does not re-run on every render. */
const NO_ALARMS: Alarm[] = []

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [view, setView] = useRoute()
  const [room, setRoom] = useState<Room>('kitchen')
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
    const rooms = meta.data?.sensorRooms ?? ['kitchen', 'bedroom']
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

  const shared = {
    room,
    metric,
    onRoomChange: setRoom,
    onMetricChange: setMetric,
    roomTabs,
    metricTabs,
    meta: meta.data,
    accent,
    compact: !isDesktop,
    sidebarCollapsed,
    onToggleSidebar,
  }

  const body = (
    <>
      {effectiveView === 'live' && (
        <LiveView
          {...shared}
          status={status}
          statusLoading={statusLoading}
          statusError={statusError}
          alarms={alarms}
          alarmsLoading={alarmLog.loading}
          alarmsError={alarmLog.error}
        />
      )}
      {effectiveView === 'history' && (
        <HistoryView {...shared} range={range} onRangeChange={setRange} />
      )}
      {effectiveView === 'alarms' && (
        <AlarmsView
          alarms={alarms}
          alarmsLoading={alarmLog.loading}
          alarmsError={alarmLog.error}
          status={status}
          statusLoading={statusLoading}
          statusError={statusError}
          meta={meta.data}
          days={ALARM_WINDOW_DAYS}
        />
      )}
    </>
  )

  if (!isDesktop) {
    return (
      // The phone layout is tuned for ~390px. On a tablet it is centred and
      // capped rather than stretched, so line lengths and the hero number keep
      // the proportions the design calls for.
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
        {effectiveView !== 'alarms' && (
          <header className="flex items-center justify-between px-[18px] pt-3.5 pb-2.5">
            <span className="text-[12px] font-semibold tracking-[0.3em]">
              {effectiveView === 'history' ? 'HISTORY' : 'HERMES'}
            </span>
            <div className="text-chalk-soft flex items-center gap-2.5 text-[10px] tracking-[0.1em]">
              {effectiveView === 'history' ? (
                <span>RAW {meta.data?.retention.rawDays ?? 7}D → HOURLY</span>
              ) : (
                <>
                  <span
                    className={cn(
                      'flex items-center gap-1.5',
                      connected ? 'text-signal-ok' : 'text-signal-alert',
                    )}
                  >
                    <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" aria-hidden />
                    {connected ? 'LIVE' : 'OFFLINE'}
                  </span>
                  <span className="tabular">{formatClock(now)}</span>
                </>
              )}
            </div>
          </header>
        )}

        {apiError && (
          <ErrorBanner message="Couldn't reach the HERMES API — some data may be stale or missing." compact />
        )}

        {/* The tab bar is fixed, out of this flow entirely, so it no longer
            gives the last section clearance on its own — pb-24 stands in
            for the space it would otherwise take up. */}
        <main className="pb-24">{body}</main>

        <BottomTabs view={effectiveView} onChange={setView} alarmCount={alarms.length} />
      </div>
    )
  }

  // Full-bleed: the dashboard is the window, not a card inside one. Nav lives
  // in the rail on the left, so the content column only ever carries the
  // filters for what's on screen — never a second, competing set of tabs.
  return (
    // Fixed to the viewport with the scroll moved onto the content column, so
    // the rail never travels with the page — it's chrome, not content.
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        view={effectiveView}
        onViewChange={setView}
        connected={connected}
        alarmCount={alarmsLast7Days}
        nodes={nodes.data ?? []}
        nodesLoading={nodes.loading}
        now={now}
        retentionNote={retentionNote}
        collapsed={sidebarCollapsed}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {apiError && (
          <ErrorBanner message="Couldn't reach the HERMES API — some data may be stale or missing." />
        )}
        <main>{body}</main>
      </div>
    </div>
  )
}
