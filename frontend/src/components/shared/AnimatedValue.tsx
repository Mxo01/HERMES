import { useAnimatedNumber } from '@/hooks/useAnimatedNumber'

interface AnimatedValueProps {
  value: number | undefined
  /** Formats the (possibly mid-tween) number for display — usually `formatMetric`/`formatDelta`. */
  format: (value: number | undefined) => string
  duration?: number
}

/** A number that counts into place rather than snapping when it first appears or changes. */
export function AnimatedValue({ value, format, duration = 600 }: AnimatedValueProps) {
  const animated = useAnimatedNumber(value, duration)
  return <>{format(animated)}</>
}
