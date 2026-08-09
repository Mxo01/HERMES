import { TrendChart } from '@/components/charts/TrendChart'
import { formatDelta, formatMetric } from '@/lib/format'
import { METRIC_SPAN, METRIC_TITLES, METRIC_UNITS, roomLabel } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import type { EnvMetric, Room } from '@/lib/types'

interface HeroMetricProps {
  room: Room
  metric: EnvMetric
  accent: string
  value: number | undefined
  min: number | undefined
  max: number | undefined
  outside: number | undefined
  insideSeries: number[]
  outsideSeries: number[]
  /** One label per inside sample, shown in the chart tooltip. */
  labels: string[]
  loading?: boolean
  compact?: boolean
}

/**
 * The headline reading. The number is deliberately oversized: from across the
 * kitchen it is the only thing you need to be able to read.
 */
export function HeroMetric({
  room,
  metric,
  accent,
  value,
  min,
  max,
  outside,
  insideSeries,
  outsideSeries,
  labels,
  loading = false,
  compact = false,
}: HeroMetricProps) {
  const delta = value !== undefined && outside !== undefined ? value - outside : undefined
  const higher = (delta ?? 0) >= 0
  const deltaColor = delta === undefined ? 'var(--color-chalk-faint)' : higher ? accent : 'var(--color-chalk-faint)'

  const [spanMin, spanMax] = METRIC_SPAN[metric]
  const deltaWidth =
    delta === undefined ? '0%' : `${Math.min(100, (Math.abs(delta) / (spanMax - spanMin)) * 340).toFixed(1)}%`

  const deltaWord =
    delta === undefined
      ? 'NO OUTDOOR DATA'
      : metric === 'temperature'
        ? higher
          ? 'WARMER INSIDE'
          : 'COOLER INSIDE'
        : higher
          ? 'HIGHER INSIDE'
          : 'LOWER INSIDE'

  return (
    <div className={cn('relative overflow-hidden', compact ? 'px-[18px] pb-4' : 'border-ink-650 border-r p-6')}>
      <div className={cn('text-chalk-ghost mb-1.5', compact ? 'label-xs' : 'label-sm')}>
        {roomLabel(room)} / {METRIC_TITLES[metric]}
      </div>

      <div
        className={cn(
          'flex',
          compact ? 'items-start justify-between gap-3' : 'flex-wrap items-end gap-x-6 gap-y-2',
        )}
      >
        <div className="flex items-start gap-[7px]">
          <span
            className="tabular font-medium"
            style={{
              // 9.5vw reproduces the design's 112px at its 1180px width, and
              // keeps the headline's weight as the window grows or shrinks.
              fontSize: compact ? 'clamp(62px, 21vw, 84px)' : 'clamp(74px, 9.5vw, 150px)',
              lineHeight: 0.86,
              letterSpacing: '-0.05em',
              // Cancel the trailing tracking so the unit does not ride onto
              // the last digit.
              marginRight: '0.05em',
            }}
          >
            {formatMetric(value, metric, false)}
          </span>
          <span
            className="text-chalk-ghost"
            style={{ fontSize: compact ? 19 : 24, marginTop: compact ? 9 : 12 }}
          >
            {METRIC_UNITS[metric] || 'idx'}
          </span>
        </div>

        <div className={cn(compact ? 'pt-1.5 text-right' : 'pb-2.5')}>
          <div
            className="text-chalk-ghost mb-1 uppercase"
            style={{ fontSize: compact ? 9.5 : 10.5, letterSpacing: '0.16em' }}
          >
            vs outside
          </div>
          <div className={cn('flex items-baseline gap-2', compact && 'justify-end')}>
            <span
              className="tabular font-medium"
              style={{ fontSize: compact ? 26 : 34, letterSpacing: '-0.03em', color: deltaColor }}
            >
              {formatDelta(delta, metric)}
            </span>
            {!compact && (
              <span
                className="whitespace-nowrap"
                style={{ fontSize: 10.5, letterSpacing: '0.14em', color: deltaColor }}
              >
                {deltaWord}
              </span>
            )}
          </div>
          {compact ? (
            <div className="mt-0.5" style={{ fontSize: 9, letterSpacing: '0.1em', color: deltaColor }}>
              {deltaWord}
            </div>
          ) : (
            <div className="bg-ink-650 mt-2 h-1 w-[220px] overflow-hidden rounded-sm">
              <div
                className="animate-grow h-1 rounded-sm"
                style={{ background: deltaColor, width: deltaWidth }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className="text-chalk-soft tabular mt-3 flex"
        style={{ gap: compact ? 16 : 24, fontSize: compact ? 10.5 : 11.5, letterSpacing: '0.06em' }}
      >
        <span>MIN {formatMetric(min, metric)}</span>
        <span>MAX {formatMetric(max, metric)}</span>
        <span className="text-chalk-faint">
          {compact ? 'OUT' : 'OUTSIDE'} {formatMetric(outside, metric)}
        </span>
      </div>

      <TrendChart
        inside={insideSeries}
        outside={outsideSeries}
        labels={labels}
        metric={metric}
        accent={accent}
        roomLabel={roomLabel(room)}
        loading={loading}
        animationKey={`${room}-${metric}`}
        className={cn('mt-3 block w-full', compact ? 'h-[120px]' : 'h-[150px]')}
      />

      {!compact && (
        <div className="text-chalk-faint tabular mt-0.5 flex justify-between text-[10px] tracking-[0.1em]">
          <span>-24H</span>
          <span>-18H</span>
          <span>-12H</span>
          <span>-6H</span>
          <span>NOW</span>
        </div>
      )}
    </div>
  )
}
