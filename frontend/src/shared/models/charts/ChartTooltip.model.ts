import type { RefObject } from 'react'

export interface TooltipRow {
  label: string
  value: string
  /** Swatch colour; omitted rows render without one. */
  color?: string
  muted?: boolean
}

export interface ChartTooltipProps {
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
