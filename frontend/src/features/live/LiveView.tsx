import { useMemo } from 'react'
import { Heatmap } from '@/components/charts/Heatmap'
import { Tabs } from '@/components/controls/Tabs'
import { AlarmTable } from '@/components/panels/AlarmLog'
import { GasPanel } from '@/components/panels/GasPanel'
import { HeroMetric } from '@/components/panels/HeroMetric'
import { RoomComparison } from '@/components/panels/RoomComparison'
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
  meta: Meta | undefined
  alarms: Alarm[]
  accent: string
  compact: boolean
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
  meta,
  alarms,
  accent,
  compact,
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
      compact={compact}
    />
  )

  if (compact) {
    return (
      <div className="flex flex-col">
        <div className="flex gap-1.5 px-[18px] pt-1.5 pb-3">
          <Tabs items={roomTabs} value={room} onChange={onRoomChange} layout="fill" label="Room" />
        </div>

        {heroPanel}

        <div className="flex gap-1.5 px-[18px] pb-4">
          <Tabs
            items={metricTabs}
            value={metric}
            onChange={onMetricChange}
            tone="metric"
            layout="fill"
            label="Metric"
          />
        </div>

        {gasPanel}

        <section className="border-ink-650 border-t px-[18px] py-4">
          <h2 className="label-xs text-chalk-ghost mb-3">All rooms</h2>
          <RoomComparison
            status={status}
            rooms={rooms}
            outsideRoom={outsideRoom}
            outsideLocation={meta?.outsideLocation?.label}
            metricSpecs={meta?.metrics}
            compact
          />
        </section>
      </div>
    )
  }

  return (
    <div>
      <div className="border-ink-650 bg-ink-900 flex items-center justify-between border-b px-[26px] py-3">
        <Tabs items={roomTabs} value={room} onChange={onRoomChange} label="Room" />
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
          <section className="px-6 py-5">
            <h2 className="label-sm text-chalk-ghost mb-3.5">All rooms — side by side</h2>
            <RoomComparison
              status={status}
              rooms={rooms}
              outsideRoom={outsideRoom}
              outsideLocation={meta?.outsideLocation?.label}
              metricSpecs={meta?.metrics}
            />
          </section>
        </div>
      </div>

      <section className="border-ink-650 border-t px-[26px] py-5">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="label-sm text-chalk-ghost">
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
        <Heatmap rows={heat.rows} hours={heat.hours} accent={accent} metric={metric} />
      </section>

      <section className="border-ink-650 bg-ink-900 border-t px-[26px] py-5">
        <div className="mb-3.5 flex items-baseline gap-3.5">
          <h2 className="label-sm text-chalk-ghost">Alarm log</h2>
          <span className="text-chalk-faint text-[10.5px] tracking-[0.06em]">
            last 14 days · {alarms.length} event{alarms.length === 1 ? '' : 's'} ·{' '}
            {alarms.filter((alarm) => alarm.notified).length} sent to telegram
          </span>
        </div>
        <AlarmTable alarms={alarms} />
      </section>
    </div>
  )
}
