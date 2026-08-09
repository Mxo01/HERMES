import { useMemo, useState } from 'react'
import { Header } from '@/components/shell/Header'
import { BottomTabs } from '@/components/shell/BottomTabs'
import { AlarmsView } from '@/features/alarms/AlarmsView'
import { HistoryView } from '@/features/history/HistoryView'
import { LiveView } from '@/features/live/LiveView'
import { useAlarms, useLiveStatus, useMeta, useNodes } from '@/hooks/useDashboardData'
import { useClock, useMediaQuery } from '@/hooks/useEnvironment'
import { useSocketConnection } from '@/hooks/useSocketEvent'
import { presetRange, type DateRange } from '@/lib/dates'
import { formatClock } from '@/lib/format'
import { ACCENT, ENV_METRICS, METRIC_TITLES, roomLabel } from '@/lib/metrics'
import type { EnvMetric, Room } from '@/lib/types'
import type { View } from '@/lib/view'
import type { TabItem } from '@/components/controls/Tabs'

const ALARM_WINDOW_DAYS = 14

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [view, setView] = useState<View>('live')
  const [room, setRoom] = useState<Room>('kitchen')
  const [metric, setMetric] = useState<EnvMetric>('temperature')
  const [range, setRange] = useState<DateRange>(() => presetRange(14))

  const meta = useMeta()
  const nodes = useNodes()
  const alarmLog = useAlarms(ALARM_WINDOW_DAYS)
  const { status } = useLiveStatus()
  const connected = useSocketConnection()
  const now = useClock()

  const accent = ACCENT[metric]
  const alarms = alarmLog.data ?? []

  /** Rooms you can select: the physical ones, not the synthetic outdoor one. */
  const roomTabs: TabItem<Room>[] = useMemo(() => {
    const rooms = meta.data?.sensorRooms ?? ['kitchen', 'bedroom']
    return rooms.map((id) => ({ id, label: roomLabel(id) }))
  }, [meta.data])

  const metricTabs: TabItem<EnvMetric>[] = useMemo(
    () => ENV_METRICS.map((id) => ({ id, label: METRIC_TITLES[id], accent: ACCENT[id] })),
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
  }

  const body = (
    <>
      {effectiveView === 'live' && (
        <LiveView {...shared} status={status} alarms={alarms} />
      )}
      {effectiveView === 'history' && (
        <HistoryView {...shared} range={range} onRangeChange={setRange} />
      )}
      {effectiveView === 'alarms' && (
        <AlarmsView alarms={alarms} status={status} meta={meta.data} days={ALARM_WINDOW_DAYS} />
      )}
    </>
  )

  if (!isDesktop) {
    return (
      // The phone layout is tuned for ~390px. On a tablet it is centred and
      // capped rather than stretched, so line lengths and the hero number keep
      // the proportions the design calls for.
      <div className="bg-ink-950 mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
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
                  <span className={connected ? 'text-signal-ok' : 'text-signal-alert'}>
                    ● {connected ? 'LIVE' : 'OFFLINE'}
                  </span>
                  <span className="tabular">{formatClock(now)}</span>
                </>
              )}
            </div>
          </header>
        )}

        {/* Bottom padding clears the sticky tab bar so the last row is reachable. */}
        <main className="flex-1 pb-[76px]">{body}</main>

        <BottomTabs view={effectiveView} onChange={setView} alarmCount={alarms.length} />
      </div>
    )
  }

  // Full-bleed: the dashboard is the window, not a card inside one.
  return (
    <div className="bg-ink-950 min-h-dvh">
      <Header
        view={effectiveView}
        onViewChange={setView}
        connected={connected}
        alarmCount={meta.data?.alarmCount7d ?? 0}
        nodes={nodes.data ?? []}
        now={now}
        retentionNote={retentionNote}
      />
      <main>{body}</main>
    </div>
  )
}
