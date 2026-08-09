/**
 * Chart geometry.
 *
 * The charts are hand-drawn SVG rather than a charting library: at this size
 * every line is a single path, the animation is a stroke-dashoffset sweep, and
 * the whole thing costs no runtime dependency on a Pi-served bundle.
 */

export interface PlotArea {
  width: number
  height: number
  padLeft?: number
  padRight?: number
  padTop?: number
  padBottom?: number
}

export interface Scale {
  x: (index: number) => number
  y: (value: number) => number
  area: Required<PlotArea>
}

export function createScale(count: number, min: number, max: number, area: PlotArea): Scale {
  const resolved: Required<PlotArea> = {
    padLeft: 0,
    padRight: 6,
    padTop: 10,
    padBottom: 10,
    ...area,
  }

  const span = max - min || 1
  const usableWidth = resolved.width - resolved.padLeft - resolved.padRight
  const usableHeight = resolved.height - resolved.padTop - resolved.padBottom
  const steps = Math.max(1, count - 1)

  return {
    x: (index) => resolved.padLeft + (index * usableWidth) / steps,
    y: (value) => resolved.height - resolved.padBottom - ((value - min) / span) * usableHeight,
    area: resolved,
  }
}

/** Smooth the series with symmetric cubic control points at each midpoint. */
export function smoothPath(values: number[], scale: Scale): string {
  if (values.length === 0) return ''
  if (values.length === 1) {
    const only = `${scale.x(0).toFixed(1)},${scale.y(values[0]).toFixed(1)}`
    return `M${only} L${only}`
  }

  let path = `M${scale.x(0).toFixed(1)},${scale.y(values[0]).toFixed(1)}`
  for (let i = 1; i < values.length; i++) {
    const previousX = scale.x(i - 1)
    const previousY = scale.y(values[i - 1])
    const currentX = scale.x(i)
    const currentY = scale.y(values[i])
    const midX = (previousX + currentX) / 2
    path +=
      ` C${midX.toFixed(1)},${previousY.toFixed(1)}` +
      ` ${midX.toFixed(1)},${currentY.toFixed(1)}` +
      ` ${currentX.toFixed(1)},${currentY.toFixed(1)}`
  }
  return path
}

/** Close a line down to the baseline so it can be filled. */
export function areaPath(values: number[], scale: Scale): string {
  if (values.length === 0) return ''
  const line = smoothPath(values, scale)
  const bottom = scale.area.height
  return `${line} L${scale.x(values.length - 1).toFixed(1)},${bottom} L${scale.x(0).toFixed(1)},${bottom} Z`
}

/** A filled min–max envelope: the upper line out, the lower line back. */
export function bandPath(upper: number[], lower: number[], scale: Scale): string {
  if (upper.length === 0 || lower.length === 0) return ''
  const top = smoothPath(upper, scale)
  const back = lower
    .map((value, index) => `${scale.x(index).toFixed(1)},${scale.y(value).toFixed(1)}`)
    .reverse()
    .join(' L')
  return `${top} L${back} Z`
}

/** Extend a [min, max] pair by a fraction of its span, so lines never touch the edge. */
export function padExtent(values: number[], fraction = 0.18): [number, number] {
  if (values.length === 0) return [0, 1]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const padding = (high - low) * fraction || Math.abs(high) * 0.1 || 1
  return [low - padding, high + padding]
}

/** Evenly spaced gridline values from `max` down to `min`. */
export function gridValues(min: number, max: number, lines = 4): number[] {
  return Array.from({ length: lines }, (_, i) => max - (i * (max - min)) / (lines - 1))
}
