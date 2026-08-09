import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export interface ChartPointerState {
  index: number
  /** Pixel position of the hovered sample within the container. */
  x: number
  width: number
}

export interface ChartPointer {
  ref: React.RefObject<HTMLDivElement | null>
  hover: ChartPointerState | null
  handlers: {
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerLeave: () => void
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  }
}

/**
 * Maps a pointer position over a chart onto the nearest sample.
 *
 * `positions` are each sample's x as a fraction of the container width, so the
 * caller's plot padding is respected and touch works the same as mouse.
 */
export function useChartPointer(positions: number[]): ChartPointer {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<ChartPointerState | null>(null)

  const track = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const element = ref.current
      if (!element || positions.length === 0) return

      const bounds = element.getBoundingClientRect()
      const ratio = (event.clientX - bounds.left) / (bounds.width || 1)

      let nearest = 0
      let smallest = Number.POSITIVE_INFINITY
      for (let index = 0; index < positions.length; index++) {
        const distance = Math.abs(positions[index] - ratio)
        if (distance < smallest) {
          smallest = distance
          nearest = index
        }
      }

      setHover({ index: nearest, x: positions[nearest] * bounds.width, width: bounds.width })
    },
    [positions],
  )

  return {
    ref,
    hover,
    handlers: {
      onPointerMove: track,
      onPointerDown: track,
      onPointerLeave: () => setHover(null),
    },
  }
}
