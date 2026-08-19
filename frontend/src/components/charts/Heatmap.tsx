import { useRef, useState } from 'react'
import { Grid3x3 } from 'lucide-react'
import { ChartStatus } from '@/components/charts/ChartStatus'
import { ChartTooltip } from '@/components/charts/ChartTooltip'
import { formatDayShort, formatMetric } from '@/lib/format'
import { withAlpha } from '@/lib/metrics'
import type { HeatRow } from '@/lib/series'
import type { Metric } from '@/lib/types'

interface HeatmapProps {
  rows: HeatRow[]
  hours: string[]
  accent: string
  metric: Metric
  /** Distinguishes "still fetching" from "nothing to draw". */
  loading?: boolean
  /** A failed request — takes priority over the empty/loading message. */
  error?: Error
}

interface Focus {
  row: number
  cell: number
  x: number
  y: number
}

/**
 * Seven days by twenty-four hours. Reading down a column shows the daily
 * rhythm; reading across a row shows whether a day broke it.
 */
export function Heatmap({ rows, hours, accent, metric, loading = false, error }: HeatmapProps) {
  const container = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState<Focus | null>(null)
  const hasData = rows.some((row) => row.cells.some((cell) => cell.ratio !== null))

  const focusCell = (rowIndex: number, cellIndex: number, element: HTMLElement) => {
    const bounds = container.current?.getBoundingClientRect()
    if (!bounds) return
    const cell = element.getBoundingClientRect()
    setFocus({
      row: rowIndex,
      cell: cellIndex,
      x: cell.left - bounds.left + cell.width / 2,
      y: cell.top - bounds.top + cell.height + 8,
    })
  }

  const active = focus ? rows[focus.row]?.cells[focus.cell] : undefined

  if (!hasData) {
    return (
      <div className="border-white/10 flex h-[190px] items-center justify-center rounded border border-dashed">
        <ChartStatus loading={loading} error={error} emptyLabel="Not enough data yet" emptyIcon={Grid3x3} />
      </div>
    )
  }

  return (
    <div className="relative" ref={container}>
      <div className="flex gap-2.5">
        <div className="flex flex-col gap-1 pt-4">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="text-chalk-ghost flex h-[18px] items-center text-[9.5px] tracking-[0.1em]"
            >
              {row.label}
            </div>
          ))}
        </div>

        <div
          className="min-w-0 flex-1"
          onPointerLeave={() => setFocus(null)}
        >
          <div className="mb-1.5 grid grid-cols-24 gap-1">
            {hours.map((hour, index) => (
              <div key={index} className="text-chalk-faint text-center text-[9px] tracking-[0.04em]">
                {hour}
              </div>
            ))}
          </div>

          {rows.map((row, rowIndex) => (
            <div key={`${row.label}-${rowIndex}`} className="mb-1 grid grid-cols-24 gap-1">
              {row.cells.map((cell, cellIndex) => {
                const highlighted = focus?.row === rowIndex && focus?.cell === cellIndex
                return (
                  <div
                    key={cellIndex}
                    className="animate-cell h-[18px] rounded-[3px] transition-[outline-color] duration-100"
                    style={{
                      background:
                        cell.ratio === null
                          ? 'var(--color-ink-800)'
                          : withAlpha(accent, Math.max(0.05, cell.ratio)),
                      animationDelay: `${(rowIndex * 24 + cellIndex) * 3}ms`,
                      outline: highlighted ? '1px solid var(--color-chalk)' : '1px solid transparent',
                      outlineOffset: 1,
                    }}
                    onPointerEnter={(event) => focusCell(rowIndex, cellIndex, event.currentTarget)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {focus && active && (
        <ChartTooltip
          title={`${formatDayShort(rows[focus.row].date)} · ${String(active.hour).padStart(2, '0')}:00`}
          x={focus.x}
          y={focus.y}
          containerWidth={container.current?.clientWidth ?? 0}
          containerRef={container}
          rows={[
            {
              label: 'Hourly avg',
              value: active.value === null ? 'no data' : formatMetric(active.value, metric),
              color: accent,
              muted: active.value === null,
            },
          ]}
        />
      )}
    </div>
  )
}
