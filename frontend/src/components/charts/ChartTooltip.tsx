import { cn } from '@/lib/utils'

export interface TooltipRow {
  label: string
  value: string
  /** Swatch colour; omitted rows render without one. */
  color?: string
  muted?: boolean
}

interface ChartTooltipProps {
  title: string
  rows: TooltipRow[]
  /** Horizontal anchor in pixels, relative to the chart container. */
  x: number
  containerWidth: number
  /** Vertical anchor; defaults to the top of the container. */
  y?: number
  /**
   * Which side of the anchor to sit on. `auto` keeps the panel off the curve
   * by flipping away from whichever edge the pointer is nearest.
   */
  side?: 'auto' | 'center'
  note?: string
}

const WIDTH = 168
const EDGE = 6
const OFFSET = 14

/**
 * The charts' own readout. A native `title` tooltip would appear after a
 * delay, in the OS font, with no colour — useless for comparing two series at
 * the same instant, which is the whole point of these charts.
 */
export function ChartTooltip({
  title,
  rows,
  x,
  containerWidth,
  y = 0,
  side = 'center',
  note,
}: ChartTooltipProps) {
  const anchored =
    side === 'auto' ? (x > containerWidth / 2 ? x - WIDTH - OFFSET : x + OFFSET) : x - WIDTH / 2

  // Keep the panel inside the chart rather than letting it clip at the edges.
  const left = Math.max(EDGE, Math.min(containerWidth - WIDTH - EDGE, anchored))

  return (
    <div
      role="tooltip"
      className={cn(
        'border-ink-500 bg-ink-850 pointer-events-none absolute z-10 rounded-lg border px-3 py-2.5',
        'shadow-[0_12px_32px_rgba(0,0,0,.6)]',
      )}
      style={{ left, top: y, width: WIDTH, animation: 'fade-in .12s ease both' }}
    >
      <div className="text-chalk-ghost mb-2 text-[9.5px] tracking-[0.16em] uppercase">{title}</div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-2">
            {row.color && (
              <span
                className="h-[3px] w-2.5 shrink-0 rounded-full"
                style={{ background: row.color }}
                aria-hidden
              />
            )}
            <span
              className={cn(
                'text-[9.5px] tracking-[0.12em] uppercase',
                row.muted ? 'text-chalk-trace' : 'text-chalk-faint',
              )}
            >
              {row.label}
            </span>
            <span
              className={cn(
                'tabular ml-auto text-[12px]',
                row.muted ? 'text-chalk-faint' : 'text-chalk',
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {note && (
        <div className="border-ink-650 text-chalk-trace mt-2 border-t pt-2 text-[9px] tracking-[0.1em] uppercase">
          {note}
        </div>
      )}
    </div>
  )
}
