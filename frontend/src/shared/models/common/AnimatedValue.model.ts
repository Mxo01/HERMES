export interface AnimatedValueProps {
  value: number | undefined
  /** Formats the (possibly mid-tween) number for display — usually `formatMetric`/`formatDelta`. */
  format: (value: number | undefined) => string
  duration?: number
}
