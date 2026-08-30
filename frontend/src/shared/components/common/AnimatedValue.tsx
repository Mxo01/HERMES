import { useAnimatedNumber } from '@/hooks/useAnimatedNumber'
import type { AnimatedValueProps } from '../../models/common/AnimatedValue.model'

/** A number that counts into place rather than snapping when it first appears or changes. */
export function AnimatedValue({ value, format, duration = 600 }: AnimatedValueProps) {
  const animated = useAnimatedNumber(value, duration)
  return <>{format(animated)}</>
}
