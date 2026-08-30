import { useMemo } from 'react'
import { ChartCandlestick } from 'lucide-react'
import { ChartStatus } from '@/shared/components/charts/ChartStatus'
import { ChartTooltip } from '@/shared/components/charts/ChartTooltip'
import { useChartPointer } from '@/hooks/useChartPointer'
import { useElementSize } from '@/hooks/useElementSize'
import { bandPath, createScale, gridValues, padExtent, smoothPath } from '@/shared/utils/svg'
import { formatDayShort, formatMetric, formatTick, formatWeekday } from '@/shared/utils/format'
import { withAlpha } from '@/shared/utils/metrics'
import { fromISODate } from '@/shared/utils/dates'
import type { BandChartProps } from '../../models/charts/BandChart.model'

/**
 * Daily min–max envelope with the daily average drawn through it. The band is
 * the day's spread; the line is its centre of gravity.
 */
export function BandChart({
  points,
  metric,
  accent,
  compact = false,
  height = 220,
  loading = false,
  error,
  animationKey,
}: BandChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()

  const chart = useMemo(() => {
    if (points.length < 2 || size.width === 0) return undefined

    const mins = points.map((point) => point.min)
    const maxes = points.map((point) => point.max)
    const avgs = points.map((point) => point.avg)
    const [min, max] = padExtent([...mins, ...maxes], 0.08)

    const padLeft = compact ? 4 : 46
    const padRight = 6
    const scale = createScale(points.length, min, max, {
      width: size.width,
      height,
      padLeft,
      padRight,
      padTop: 12,
      padBottom: compact ? 12 : 30,
    })

    const tickCount = Math.min(8, points.length)
    const ticks = Array.from({ length: tickCount }, (_, index) => {
      const position = Math.round((index * (points.length - 1)) / Math.max(1, tickCount - 1))
      return { left: scale.x(position), label: formatTick(fromISODate(points[position].day)) }
    })

    return {
      padLeft,
      padRight,
      band: bandPath(maxes, mins, scale),
      upper: smoothPath(maxes, scale),
      lower: smoothPath(mins, scale),
      average: smoothPath(avgs, scale),
      grid: gridValues(min, max).map((value) => ({
        y: scale.y(value),
        label: formatMetric(value, metric),
      })),
      ticks,
      positions: points.map((_, index) => scale.x(index) / size.width),
      yOf: (value: number) => scale.y(value),
    }
  }, [points, metric, compact, height, size.width])

  const pointer = useChartPointer(chart?.positions ?? [])
  const hovered = chart ? pointer.hover : null
  const day = hovered ? points[hovered.index] : undefined

  return (
    <div className="relative" style={{ height }} ref={ref}>
      {/* The pointer surface sits on top so hit-testing ignores the paths. */}
      <div className="absolute inset-0 z-[1]" {...pointer.handlers} ref={pointer.ref} />

      {!chart && points.length < 2 && (
        <ChartStatus
          loading={loading}
          error={error}
          emptyLabel="Not enough data in this range"
          emptyIcon={ChartCandlestick}
        />
      )}

      {chart && (
        <svg
          viewBox={`0 0 ${size.width} ${height}`}
          className="absolute inset-0 block h-full w-full"
          aria-hidden
        >
          <g key={animationKey}>
            {!compact &&
              chart.grid.map((line) => (
                <line
                  key={line.y}
                  x1={chart.padLeft}
                  x2={size.width - chart.padRight}
                  y1={line.y}
                  y2={line.y}
                  stroke="#141417"
                  strokeWidth={1}
                />
              ))}
            <path d={chart.band} fill={withAlpha(accent, 0.1)} className="animate-fade" />
            {!compact && (
              <>
                <path
                  d={chart.upper}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  opacity={0.45}
                  pathLength={1}
                  className="animate-draw-line"
                  style={{ animationDelay: '0.1s', animationDuration: '1.2s' }}
                />
                <path
                  d={chart.lower}
                  fill="none"
                  stroke={accent}
                  strokeWidth={1}
                  opacity={0.45}
                  pathLength={1}
                  className="animate-draw-line"
                  style={{ animationDelay: '0.1s', animationDuration: '1.2s' }}
                />
              </>
            )}
            <path
              d={chart.average}
              fill="none"
              stroke={accent}
              strokeWidth={compact ? 3.4 : 2.2}
              strokeLinecap="round"
              pathLength={1}
              className="animate-draw-line"
            />
          </g>
        </svg>
      )}

      {chart && !compact && (
        <>
          {chart.grid.map((line) => (
            <div
              key={`label-${line.y}`}
              className="text-chalk-faint tabular pointer-events-none absolute left-0 -translate-y-1/2 text-[10.5px]"
              style={{ top: line.y }}
            >
              {line.label}
            </div>
          ))}
          {chart.ticks.map((tick, index) => (
            <div
              key={`${tick.label}-${index}`}
              className="text-chalk-faint tabular pointer-events-none absolute bottom-0 -translate-x-1/2 text-[10px]"
              style={{ left: tick.left }}
            >
              {tick.label}
            </div>
          ))}
        </>
      )}

      {chart && hovered && day && (
        <>
          <div
            className="bg-ink-400 pointer-events-none absolute top-0 bottom-0 w-px"
            style={{ left: hovered.x }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: hovered.x, top: chart.yOf(day.avg), background: accent }}
            aria-hidden
          />
          <ChartTooltip
            title={`${formatDayShort(fromISODate(day.day))} ${formatWeekday(fromISODate(day.day))}`}
            x={hovered.x}
            containerWidth={hovered.width}
            side="auto"
            containerRef={ref}
            rows={[
              {
                label: 'Max',
                value: formatMetric(day.max, metric),
                color: withAlpha(accent, 0.45),
              },
              { label: 'Avg', value: formatMetric(day.avg, metric), color: accent },
              {
                label: 'Min',
                value: formatMetric(day.min, metric),
                color: withAlpha(accent, 0.45),
              },
              ...(day.alarms
                ? [
                    {
                      label: 'Alarms',
                      value: `▲ ${day.alarms}`,
                      color: 'var(--color-signal-alert)',
                    },
                  ]
                : []),
            ]}
            note={day.resolution === 'raw' ? 'raw 30s samples' : 'hourly averages'}
          />
        </>
      )}
    </div>
  )
}
