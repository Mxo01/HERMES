import { useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
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
  /**
   * The chart's own measured element. Every glass card has its own
   * `backdrop-filter`, which creates a stacking context — a tooltip
   * positioned normally inside one can never paint above a later sibling
   * card, no matter its z-index. Portaling to `document.body` and
   * positioning from this element's screen rect sidesteps that entirely.
   */
  containerRef: RefObject<HTMLElement | null>
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
  containerRef,
}: ChartTooltipProps) {
  const anchored =
    side === 'auto' ? (x > containerWidth / 2 ? x - WIDTH - OFFSET : x + OFFSET) : x - WIDTH / 2

  // Keep the panel inside the chart rather than letting it clip at the edges.
  const left = Math.max(EDGE, Math.min(containerWidth - WIDTH - EDGE, anchored))

  const [screen, setScreen] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setScreen({ left: rect.left + left, top: rect.top + y })
  }, [containerRef, left, y])

  if (!screen) return null

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] rounded-lg px-3 py-2.5"
      style={{
        left: screen.left,
        top: screen.top,
        width: WIDTH,
        animation: 'fade-in .12s ease both',
        // A denser fill than the standard `glass` surface — this floats over
        // whatever's behind the chart at the moment, and needs to stay
        // legible against light and dark series alike rather than the usual
        // panel-on-background contrast the lighter glass is tuned for.
        background: 'rgb(20 20 23 / 0.92)',
        backdropFilter: 'blur(18px) saturate(130%)',
        WebkitBackdropFilter: 'blur(18px) saturate(130%)',
        border: '1px solid rgb(255 255 255 / 0.1)',
        boxShadow: '0 8px 28px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.06)',
      }}
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
        <div className="border-white/10 text-chalk-trace mt-2 border-t pt-2 text-[9px] tracking-[0.1em] uppercase">
          {note}
        </div>
      )}
    </div>,
    document.body,
  )
}
