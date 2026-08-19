import type { ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  className?: string
  /** Staggers a group of reveals so they don't all land in the same instant. */
  delayMs?: number
}

/**
 * Fades and lifts its children into place the first time they scroll into
 * view — sections below the fold arrive as you reach them instead of having
 * already finished animating off-screen before you ever saw them.
 */
export function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const [ref, inView] = useInView<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-500 ease-out',
        // No translate-y-0 once revealed: a non-"none" transform — even an
        // identity one — pins the element to its own stacking context, which
        // was silently clipping the z-index of anything (chart tooltips)
        // that needed to overlap a later sibling section.
        inView ? 'opacity-100' : 'translate-y-3 opacity-0',
        className,
      )}
      style={{ transitionDelay: inView ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  )
}
