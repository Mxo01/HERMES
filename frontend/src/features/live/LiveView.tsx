import { useMemo } from 'react'
import { Bell, Grid3x3, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Heatmap } from '@/components/charts/Heatmap'
import { Tabs } from '@/components/controls/Tabs'
import { AlarmTable } from '@/components/panels/AlarmLog'
import { GasPanel } from '@/components/panels/GasPanel'
import { HeroMetric } from '@/components/panels/HeroMetric'
import { RoomComparison } from '@/components/panels/RoomComparison'
import { Reveal } from '@/components/shared/Reveal'
import { useHourly } from '@/hooks/useDashboardData'
import { averages, extentOf, heatmapGrid, hourLabels, hourlySeries } from '@/lib/series'
import { METRIC_TITLES, roomLabel } from '@/lib/metrics'
import type { Alarm, EnvMetric, Meta, Room, Status } from '@/lib/types'
import type { TabItem } from '@/components/controls/Tabs'

interface LiveViewProps {
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

const HEATMAP_DAYS = 7

export function LiveView({
  room,
  metric,
  onRoomChange,
  onMetricChange,
  roomTabs,
  metricTabs,
  status,
  statusLoading,
  statusError,
  meta,
  alarms,
  alarmsLoading,
  alarmsError,
  accent,
  compact,
  sidebarCollapsed,
  onToggleSidebar,
}: LiveViewProps) {
  // One 7-day request serves both the 24h hero chart and the heatmap.
  const week = useHourly(metric, HEATMAP_DAYS * 24)
  const gasHistory = useHourly('gas', 24)

  const outsideRoom = meta?.outsideRoom ?? 'outside'
  const gasThreshold = meta?.thresholds.gas ?? 150
  const rooms = useMemo(() => meta?.rooms ?? [room, outsideRoom], [meta, room, outsideRoom])

  const hero = useMemo(() => {
    const points = week.data ?? []
    const inside = hourlySeries(points, room, metric, 24)
    const outside = hourlySeries(points, outsideRoom, metric, 24)
    const extent = extentOf(inside)

    return {
      insideSeries: averages(inside),
      outsideSeries: averages(outside),
      labels: hourLabels(inside, 24),
      min: extent.min,
      max: extent.max,
    }
  }, [week.data, room, metric, outsideRoom])

  const heat = useMemo(
    () => heatmapGrid(week.data ?? [], room, metric, HEATMAP_DAYS),
    [week.data, room, metric],
  )

  const gasRoom = useMemo(
    () => rooms.find((candidate) => status[candidate]?.gas !== undefined) ?? 'kitchen',
    [rooms, status],
  )

  const gas = useMemo(() => {
    const slots = hourlySeries(gasHistory.data ?? [], gasRoom, 'gas', 24)
    return { series: averages(slots), labels: hourLabels(slots, 24) }
  }, [gasHistory.data, gasRoom])

  const lastGasAlarm = alarms.find((alarm) => alarm.kind === 'gas')

  // The gas reading itself comes from the live-status socket/fetch, while its
  // sparkline comes from the hourly history — either can fail independently.
  const gasValueMissing = status[gasRoom]?.gas === undefined
  const gasLoading = (statusLoading && gasValueMissing) || (gasHistory.loading && !gasHistory.data)
  const gasError = statusError ?? gasHistory.error

  const heroPanel = (
    <HeroMetric
      room={room}
      metric={metric}
      accent={accent}
      value={status[room]?.[metric]?.value}
      min={hero.min}
      max={hero.max}
      outside={status[outsideRoom]?.[metric]?.value}
      insideSeries={hero.insideSeries}
      outsideSeries={hero.outsideSeries}
      labels={hero.labels}
      metricSpecs={meta?.metrics}
      loading={week.loading && !week.data}
      error={week.error}
      compact={compact}
    />
  )

  const gasPanel = (
    <GasPanel
      value={status[gasRoom]?.gas?.value}
      threshold={gasThreshold}
      series={gas.series}
      labels={gas.labels}
      lastSpike={lastGasAlarm}
      loading={gasLoading}
      error={gasError}
      compact={compact}
    />
  )

  if (compact) {
    return (
      <div className="flex flex-col">
        <span className="text-chalk-trace mt-1.5 mb-1 block px-[18px] text-[9px] tracking-[0.14em] uppercase">
          Room
        </span>
        <div className="flex gap-1.5 px-[18px] pb-2">
          <Tabs items={roomTabs} value={room} onChange={onRoomChange} layout="fill" label="Room" />
        </div>
        <span className="text-chalk-trace mb-1 block px-[18px] text-[9px] tracking-[0.14em] uppercase">
          Metric
        </span>
        <div className="flex gap-1.5 px-[18px] pb-3">
          <Tabs
            items={metricTabs}
            value={metric}
            onChange={onMetricChange}
            tone="metric"
            layout="fill"
            label="Metric"
          />
        </div>

        {heroPanel}
        {gasPanel}

        <Reveal>
          <section className="border-ink-650 border-t px-[18px] py-4">
            <h2 className="label-xs text-chalk-ghost mb-3 flex items-center gap-1.5">
              <LayoutGrid size={11} strokeWidth={2} aria-hidden />
              All rooms
            </h2>
            <RoomComparison
              status={status}
              rooms={rooms}
              outsideRoom={outsideRoom}
              outsideLocation={meta?.outsideLocation?.label}
              metricSpecs={meta?.metrics}
              loading={statusLoading}
              error={statusError}
              compact
            />
          </section>
        </Reveal>
      </div>
    )
  }

  return (
    <div>
      <div className="border-ink-650 bg-ink-900 flex items-center justify-between border-b px-[26px] py-3">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="text-chalk-ghost hover:text-chalk-dim hover:bg-ink-800 rounded-md p-1.5 transition-colors duration-150"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={15} strokeWidth={2} aria-hidden />
            ) : (
              <PanelLeftClose size={15} strokeWidth={2} aria-hidden />
            )}
          </button>
          <Tabs items={roomTabs} value={room} onChange={onRoomChange} label="Room" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-chalk-ghost mr-1.5 text-[10.5px] tracking-[0.16em]">METRIC</span>
          <Tabs
            items={metricTabs}
            value={metric}
            onChange={onMetricChange}
            tone="metric"
            label="Metric"
          />
        </div>
      </div>

      <div className="grid grid-cols-[1.32fr_1fr]">
        {heroPanel}
        <div className="flex flex-col">
          {gasPanel}
          <Reveal>
            <section className="px-6 py-5">
              <h2 className="label-sm text-chalk-ghost mb-3.5 flex items-center gap-2">
                <LayoutGrid size={13} strokeWidth={2} aria-hidden />
                All rooms — side by side
              </h2>
              <RoomComparison
                status={status}
                rooms={rooms}
                outsideRoom={outsideRoom}
                outsideLocation={meta?.outsideLocation?.label}
                metricSpecs={meta?.metrics}
                loading={statusLoading}
                error={statusError}
              />
            </section>
          </Reveal>
        </div>
      </div>

      <Reveal>
        <section className="border-ink-650 border-t px-[26px] py-5">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="label-sm text-chalk-ghost flex items-center gap-2">
              <Grid3x3 size={13} strokeWidth={2} aria-hidden />
              Last {HEATMAP_DAYS} days — {roomLabel(room)} / {METRIC_TITLES[metric]}
            </h2>
            <div className="text-chalk-faint flex items-center gap-2 text-[10px] tracking-[0.1em]">
              <span>LOW</span>
              <span
                className="h-[7px] w-[100px] rounded"
                style={{ background: `linear-gradient(90deg,var(--color-ink-650),${accent})` }}
              />
              <span>HIGH</span>
            </div>
          </div>
          <Heatmap
            rows={heat.rows}
            hours={heat.hours}
            accent={accent}
            metric={metric}
            loading={week.loading && !week.data}
            error={week.error}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="border-ink-650 bg-ink-900 border-t px-[26px] py-5">
          <div className="mb-3.5 flex items-center gap-3.5">
            <h2 className="label-sm text-chalk-ghost flex items-center gap-2">
              <Bell size={13} strokeWidth={2} aria-hidden />
              Alarm log
            </h2>
            <span className="text-chalk-faint text-[10.5px] tracking-[0.06em]">
              last 14 days · {alarms.length} event{alarms.length === 1 ? '' : 's'} ·{' '}
              {alarms.filter((alarm) => alarm.notified).length} sent to telegram
            </span>
          </div>
          <AlarmTable alarms={alarms} loading={alarmsLoading} error={alarmsError} />
        </section>
      </Reveal>
    </div>
  )
}
