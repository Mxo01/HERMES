import { useLayoutEffect, useRef, useState } from 'react'

export interface Size {
  width: number
  height: number
}

/**
 * Tracks an element's rendered size.
 *
 * The charts draw in real pixels rather than stretching a fixed viewBox: a
 * non-uniform scale distorts strokes, and working around that with
 * `vectorEffect="non-scaling-stroke"` breaks `pathLength`-based dash
 * animations — the dash is measured in screen units while the path length is
 * normalised in user units, so long lines get cut off partway.
 */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, Size] {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize((previous) =>
        Math.abs(previous.width - width) < 0.5 && Math.abs(previous.height - height) < 0.5
          ? previous
          : { width, height },
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}
