import { useEffect, useRef, useState } from 'react'

/**
 * Tweens toward `target` whenever it changes, so a reading settles into
 * place instead of snapping — the first appearance counts up from zero,
 * later updates ripple from whatever was on screen.
 */
export function useAnimatedNumber(target: number | undefined, durationMs = 600): number | undefined {
  const [value, setValue] = useState(target)
  const fromRef = useRef<number | undefined>(target)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (target === undefined) {
      setValue(undefined)
      fromRef.current = undefined
      return
    }

    const from = fromRef.current ?? 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (from === target || reduceMotion) {
      setValue(target)
      fromRef.current = target
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      const eased = 1 - (1 - progress) ** 2 // ease-out quad
      setValue(from + (target - from) * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [target, durationMs])

  return value
}
