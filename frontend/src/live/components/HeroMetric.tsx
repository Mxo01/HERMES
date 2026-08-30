import { TrendChart } from '@/shared/components/charts/TrendChart'
import { AnimatedValue } from '@/shared/components/common/AnimatedValue'
import { formatDelta, formatMetric } from '@/shared/utils/format'
import { METRIC_TITLES, METRIC_UNITS, metricSpan, roomLabel } from '@/shared/utils/metrics'
import { cn } from '@/shared/utils/cn'
import type { HeroMetricProps } from '../models/HeroMetric.model'

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
  metricSpecs,
  loading = false,
  error,
  compact = false,
}: HeroMetricProps) {
  const delta = value !== undefined && outside !== undefined ? value - outside : undefined
  const higher = (delta ?? 0) >= 0
  const deltaColor =
    delta === undefined ? 'var(--color-chalk-faint)' : higher ? accent : 'var(--color-chalk-faint)'

  const [spanMin, spanMax] = metricSpan(metric, metricSpecs)
  const deltaWidth =
    delta === undefined
      ? '0%'
      : `${Math.min(100, (Math.abs(delta) / (spanMax - spanMin)) * 340).toFixed(1)}%`

  // Whichever side is actually missing — saying "no outdoor data" while the
  // gap is really the room's own reading would point at the wrong sensor.
  const deltaWord =
    delta === undefined
      ? value === undefined
        ? 'NO INDOOR DATA'
        : 'NO OUTDOOR DATA'
      : metric === 'temperature'
        ? higher
          ? 'WARMER INSIDE'
          : 'COOLER INSIDE'
        : higher
          ? 'HIGHER INSIDE'
          : 'LOWER INSIDE'

  return (
    <div
      className={cn(
        // Not overflow-hidden: the trend chart's hover tooltip needs to spill
        // past this card's edge sometimes, and clipping it here was cutting
        // it off instead.
        'glass relative rounded-2xl',
        compact ? 'mx-[18px] mt-2 mb-4 px-[18px] py-4' : 'p-6',
      )}
    >
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
            <AnimatedValue value={value} format={(v) => formatMetric(v, metric, false)} />
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
              <AnimatedValue value={delta} format={(v) => formatDelta(v, metric)} />
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
            <div
              className="mt-0.5 text-right"
              style={{ fontSize: 9, letterSpacing: '0.1em', color: deltaColor }}
            >
              {deltaWord}
            </div>
          ) : (
            <div className="bg-white/8 mt-2 h-1 w-[220px] overflow-hidden rounded-sm">
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
        <span>
          MIN <AnimatedValue value={min} format={(v) => formatMetric(v, metric)} />
        </span>
        <span>
          MAX <AnimatedValue value={max} format={(v) => formatMetric(v, metric)} />
        </span>
        <span className="text-chalk-faint">
          {compact ? 'OUT' : 'OUTSIDE'}{' '}
          <AnimatedValue value={outside} format={(v) => formatMetric(v, metric)} />
        </span>
        {error && (
          <span className="text-signal-alert" title={error.message}>
            couldn't refresh
          </span>
        )}
      </div>

      <TrendChart
        inside={insideSeries}
        outside={outsideSeries}
        labels={labels}
        metric={metric}
        accent={accent}
        roomLabel={roomLabel(room)}
        loading={loading}
        error={error}
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
