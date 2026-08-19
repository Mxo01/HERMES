import { useMemo } from 'react'
import { ChartLine } from 'lucide-react'
import { ChartStatus } from '@/components/charts/ChartStatus'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { useChartPointer } from '@/hooks/useChartPointer'
import { useElementSize } from '@/hooks/useElementSize'
import { areaPath, createScale, padExtent, smoothPath } from '@/lib/svg'
import { formatMetric } from '@/lib/format'
import { withAlpha } from '@/lib/metrics'
import type { Metric } from '@/lib/types'

interface TrendChartProps {
  /** One slot per hour; `null` where nothing was recorded. */
  inside: (number | null)[]
  /** Optional outdoor series, drawn as a flat grey reference line behind. */
  outside?: (number | null)[]
  /** One label per inside sample, e.g. `14:00`. */
  labels: string[]
  metric: Metric
  accent: string
  roomLabel: string
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
  className?: string
  animationKey?: string
}

/**
 * The hero chart: the selected room's last 24 hours, with the outdoors drawn
 * behind it so the gap between the two is the thing you actually read.
 */
export function TrendChart({
  inside,
  outside,
  labels,
  metric,
  accent,
  roomLabel,
  loading = false,
  error,
  className,
  animationKey,
}: TrendChartProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()

  const chart = useMemo(() => {
    const recorded = inside.filter((value) => value !== null).length
    if (recorded < 2 || size.width === 0 || size.height === 0) return undefined

    const [min, max] = padExtent([...inside, ...(outside ?? [])], 0.16)
    const area = { width: size.width, height: size.height, padLeft: 4, padRight: 4 }
    const scale = createScale(inside.length, min, max, area)

    const outsideScale =
      outside && outside.length >= 2 ? createScale(outside.length, min, max, area) : undefined

    return {
      fill: areaPath(inside, scale),
      insideLine: smoothPath(inside, scale),
      outsideLine: outsideScale && outside ? smoothPath(outside, outsideScale) : '',
      positions: inside.map((_, index) => scale.x(index) / size.width),
      yOf: (value: number) => scale.y(value),
      outsideAt: (index: number) =>
        outside && index < outside.length ? outside[index] : undefined,
    }
  }, [inside, outside, size])

  const pointer = useChartPointer(chart?.positions ?? [])
  const hovered = chart ? pointer.hover : null
  const insideValue = hovered ? inside[hovered.index] : null
  const outsideValue = hovered ? chart?.outsideAt(hovered.index) : undefined

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      {/* The pointer surface sits on top so hit-testing ignores the paths. */}
      <div className="absolute inset-0 z-[1]" {...pointer.handlers} ref={pointer.ref} />

      {!chart && (
        <ChartStatus loading={loading} error={error} emptyLabel="Not enough data yet" emptyIcon={ChartLine} />
      )}

      {chart && (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="absolute inset-0 block h-full w-full"
          aria-hidden
        >
          <g key={animationKey}>
            <path d={chart.fill} fill={withAlpha(accent, 0.13)} className="animate-fade" />
            {chart.outsideLine && (
              <path
                d={chart.outsideLine}
                fill="none"
                stroke="var(--color-ink-400)"
                strokeWidth={1.6}
                pathLength={1}
                className="animate-draw-line"
                style={{ animationDelay: '0.1s', animationDuration: '1.2s' }}
              />
            )}
            <path
              d={chart.insideLine}
              fill="none"
              stroke={accent}
              strokeWidth={2.2}
              strokeLinecap="round"
              pathLength={1}
              className="animate-draw-line"
            />
          </g>
        </svg>
      )}

      {chart && hovered && (
        <>
          <div
            className="bg-ink-400 pointer-events-none absolute top-0 bottom-0 w-px"
            style={{ left: hovered.x }}
            aria-hidden
          />
          {insideValue !== null && (
            <div
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: hovered.x, top: chart.yOf(insideValue), background: accent }}
              aria-hidden
            />
          )}
          <ChartTooltip
            title={labels[hovered.index] ?? ''}
            x={hovered.x}
            containerWidth={hovered.width}
            side="auto"
            containerRef={ref}
            rows={[
              {
                label: roomLabel,
                value: insideValue === null ? 'no data' : formatMetric(insideValue, metric),
                color: accent,
                muted: insideValue === null,
              },
              ...(outsideValue !== undefined && outsideValue !== null
                ? [
                    {
                      label: 'Outside',
                      value: formatMetric(outsideValue, metric),
                      color: 'var(--color-ink-400)',
                      muted: true,
                    },
                  ]
                : []),
            ]}
          />
        </>
      )}
    </div>
  )
}
