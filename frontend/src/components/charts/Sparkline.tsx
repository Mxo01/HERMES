import { useMemo } from 'react'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { useChartPointer } from '@/hooks/useChartPointer'
import { useElementSize } from '@/hooks/useElementSize'
import { createScale, padExtent, smoothPath } from '@/lib/svg'
import { formatMetric } from '@/lib/format'
import type { Metric } from '@/lib/types'

interface SparklineProps {
  values: number[]
  color: string
  className?: string
  strokeWidth?: number
  /** Restarts the draw animation when it changes. */
  animationKey?: string
  /** Supplying labels and a metric turns on the hover readout. */
  labels?: string[]
  metric?: Metric
  seriesLabel?: string
}

/** A bare trend line: no axes, no grid, just the shape of the last few hours. */
export function Sparkline({
  values,
  color,
  className,
  strokeWidth = 1.6,
  animationKey,
  labels,
  metric,
  seriesLabel = 'Value',
}: SparklineProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()

  const chart = useMemo(() => {
    if (values.length < 2 || size.width === 0 || size.height === 0) return undefined

    const [min, max] = padExtent(values, 0.12)
    const scale = createScale(values.length, min, max, {
      width: size.width,
      height: size.height,
      padLeft: 2,
      padTop: 6,
      padBottom: 6,
    })

    return {
      d: smoothPath(values, scale),
      positions: values.map((_, index) => scale.x(index) / size.width),
      yOf: (value: number) => scale.y(value),
    }
  }, [values, size])

  const pointer = useChartPointer(chart?.positions ?? [])
  const interactive = Boolean(labels && metric)
  const hovered = interactive && chart ? pointer.hover : null

  return (
    <div className={`relative ${className ?? ''}`} ref={ref}>
      {interactive && (
        <div className="absolute inset-0 z-[1]" {...pointer.handlers} ref={pointer.ref} />
      )}

      {chart && (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="absolute inset-0 block h-full w-full"
          aria-hidden
        >
          <path
            key={animationKey}
            d={chart.d}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={1}
            className="animate-draw-line"
            style={{ animationDelay: '0.3s', animationDuration: '1.2s' }}
          />
        </svg>
      )}

      {chart && hovered && metric && (
        <>
          <div
            className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: hovered.x, top: chart.yOf(values[hovered.index]), background: color }}
            aria-hidden
          />
          <ChartTooltip
            title={labels?.[hovered.index] ?? ''}
            x={hovered.x}
            y={size.height + 4}
            containerWidth={hovered.width}
            rows={[{ label: seriesLabel, value: formatMetric(values[hovered.index], metric), color }]}
          />
        </>
      )}
    </div>
  )
}
