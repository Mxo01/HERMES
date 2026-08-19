import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { BandChart } from '@/components/charts/BandChart'
import { Pager } from '@/components/controls/Pager'
import { RangePicker } from '@/components/controls/RangePicker'
import { Tabs, type TabItem } from '@/components/controls/Tabs'
import { CompareStats } from '@/components/panels/CompareStats'
import { DayRows, DayTable } from '@/components/panels/DayTable'
import { Reveal } from '@/components/shared/Reveal'
import { useDaily } from '@/hooks/useDashboardData'
import { buildDayRows, paginate } from '@/lib/history'
import { halfPeriodStats } from '@/lib/series'
import { METRIC_ICONS, METRIC_TITLES, roomLabel, withAlpha } from '@/lib/metrics'
import { daysBetween, type DateRange } from '@/lib/dates'
import type { DailyPoint, EnvMetric, Meta, Room } from '@/lib/types'

interface HistoryViewProps {
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

const DESKTOP_PAGE = 10
const MOBILE_PAGE = 7

/** Stable empty fallback, so memos below do not re-run on every render. */
const NO_POINTS: DailyPoint[] = []

export function HistoryView({
  room,
  metric,
  onRoomChange,
  onMetricChange,
  roomTabs,
  metricTabs,
  range,
  onRangeChange,
  meta,
  accent,
  compact,
  sidebarCollapsed,
  onToggleSidebar,
}: HistoryViewProps) {
  const daily = useDaily(room, metric, range.from, range.to)
  const [pageIndex, setPageIndex] = useState(0)

  // A new range or metric always starts at the newest page.
  useEffect(() => setPageIndex(0), [room, metric, range.from, range.to])

  const points = daily.data ?? NO_POINTS
  const rows = useMemo(() => buildDayRows(points), [points])
  const page = paginate(rows, pageIndex, compact ? MOBILE_PAGE : DESKTOP_PAGE)
  const stats = useMemo(() => halfPeriodStats(points), [points])

  /** Below this, a day-on-day change is noise rather than a trend. */
  const quietDelta = useMemo(() => {
    if (points.length === 0) return 0
    const spread = Math.max(...points.map((p) => p.max)) - Math.min(...points.map((p) => p.min))
    return spread * 0.12
  }, [points])

  const spanDays = daysBetween(range.from, range.to)
  const retention = meta?.retention
  const MetricIcon = METRIC_ICONS[metric]

  if (compact) {
    return (
      <div className="flex flex-col">
        <div className="px-[18px] pt-1.5 pb-3">
          <span className="text-chalk-trace mb-1 block text-[9px] tracking-[0.14em] uppercase">
            Date range
          </span>
          <RangePicker range={range} onChange={onRangeChange} accent={accent} variant="sheet" />

          <span className="text-chalk-trace mt-2.5 mb-1 block text-[9px] tracking-[0.14em] uppercase">
            Room
          </span>
          <div className="flex gap-1.5">
            <Tabs items={roomTabs} value={room} onChange={onRoomChange} layout="fill" label="Room" />
          </div>

          <span className="text-chalk-trace mt-1.5 mb-1 block text-[9px] tracking-[0.14em] uppercase">
            Metric
          </span>
          <div className="flex gap-1.5">
            <Tabs
              items={metricTabs}
              value={metric}
              onChange={onMetricChange}
              tone="metric"
              layout="fill"
              label="Metric"
            />
          </div>
        </div>

        <Reveal>
          <div className="px-[18px] pt-1 pb-2">
            <h2 className="label-xs text-chalk-ghost mb-2 flex items-center gap-1.5">
              <MetricIcon size={11} strokeWidth={2} aria-hidden />
              {roomLabel(room)} · daily range · {spanDays} days
            </h2>
            <BandChart
              points={points}
              metric={metric}
              accent={accent}
              compact
              height={132}
              loading={daily.loading && !daily.data}
              error={daily.error}
              animationKey={`${room}-${metric}-${spanDays}`}
            />
          </div>
        </Reveal>

        <Reveal>
          <CompareStats
            stats={stats}
            metric={metric}
            accent={accent}
            quietDelta={quietDelta}
            loading={daily.loading && !daily.data}
            error={daily.error}
            compact
          />
        </Reveal>

        <Reveal>
          <section className="px-[18px] pt-3 pb-[18px]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="label-xs text-chalk-ghost flex items-center gap-1.5">
                <CalendarDays size={11} strokeWidth={2} aria-hidden />
                Day by day
              </h2>
              <span className="text-chalk-faint tabular text-[9.5px] tracking-[0.12em]">
                {page.total === 0 ? '0' : `${page.from + 1}–${page.to}`} OF {page.total}
              </span>
            </div>
            <DayRows
              rows={page.items}
              metric={metric}
              accent={accent}
              loading={daily.loading && !daily.data}
              error={daily.error}
            />
            <Pager page={page} onChange={setPageIndex} variant="split" />
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

        <div className="flex items-center gap-3.5">
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
          <span className="bg-ink-650 h-5 w-px" />
          <RangePicker range={range} onChange={onRangeChange} accent={accent} />
        </div>
      </div>

      <Reveal>
        <section className="px-[26px] pt-[22px] pb-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="label-sm text-chalk-ghost flex items-center gap-2">
              <MetricIcon size={13} strokeWidth={2} aria-hidden />
              {roomLabel(room)} / {METRIC_TITLES[metric]} — daily range, {spanDays} days
            </h2>
            <div className="text-chalk-faint flex items-center gap-4 text-[10px] tracking-[0.1em]">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-[7px] w-3.5 rounded-sm"
                  style={{ background: withAlpha(accent, 0.1) }}
                />
                MIN–MAX BAND
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3.5" style={{ background: accent }} />
                DAILY AVERAGE
              </span>
            </div>
          </div>
          <BandChart
            points={points}
            metric={metric}
            accent={accent}
            loading={daily.loading && !daily.data}
            error={daily.error}
            animationKey={`${room}-${metric}-${spanDays}`}
          />
        </section>
      </Reveal>

      <Reveal>
        <CompareStats
          stats={stats}
          metric={metric}
          accent={accent}
          quietDelta={quietDelta}
          loading={daily.loading && !daily.data}
          error={daily.error}
        />
      </Reveal>

      <Reveal>
        <section className="px-[26px] pt-5 pb-6">
          <div className="mb-3.5 flex items-center gap-3.5">
            <h2 className="label-sm text-chalk-ghost flex items-center gap-2">
              <CalendarDays size={13} strokeWidth={2} aria-hidden />
              Day by day
            </h2>
            <span className="text-chalk-faint text-[10.5px] tracking-[0.06em]">newest first</span>
            {retention && (
              <span className="text-chalk-trace text-[10px] tracking-[0.1em] uppercase">
                raw {retention.rawDays}d → hourly forever
              </span>
            )}
            <Pager page={page} onChange={setPageIndex} />
          </div>
          <DayTable
            rows={page.items}
            metric={metric}
            accent={accent}
            quietDelta={quietDelta}
            loading={daily.loading && !daily.data}
            error={daily.error}
          />
        </section>
      </Reveal>
    </div>
  )
}
