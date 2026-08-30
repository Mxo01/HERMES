import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { MOBILE_VIEWS, VIEW_ICONS, type View } from '@/shared/const/view'
import type { BottomTabsProps } from '../../models/shell/BottomTabs.model'

/**
 * The phone's primary navigation: a floating pill rather than a bar welded
 * to the screen edge, so it reads as a control sitting over the content, not
 * another divider slicing up the page. The active glass pill is a single
 * element that slides between tabs — measured off the real button
 * positions, rather than three independent backgrounds popping on and off —
 * so switching tabs reads as movement in a direction, not a swap.
 *
 * Fixed to the viewport, not `sticky` in the page flow: sticky pinned it to
 * the bottom of the content instead of the screen, so on every view switch
 * it would briefly sit wherever that view's content happened to end (often
 * shorter before data loads in) and visibly hop down once the page grew —
 * a jump that read as the whole page flickering, not just the nav. Fixed
 * positioning removes it from the content's height entirely, so it never
 * has anywhere to hop from.
 */
export function BottomTabs({ view, onChange, alarmCount }: BottomTabsProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const track = trackRef.current
    const button = buttonRefs.current[view]
    if (!track || !button) return

    const sync = () => {
      const trackBox = track.getBoundingClientRect()
      const buttonBox = button.getBoundingClientRect()
      setIndicator({ left: buttonBox.left - trackBox.left, width: buttonBox.width })
    }
    sync()

    // The shell is fluid up to 560px, so a viewport resize can move the
    // active button without `view` itself changing.
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [view])

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[560px] px-3 pb-3">
      <div ref={trackRef} className="glass relative grid grid-cols-3 gap-1 rounded-2xl p-1">
        {indicator && (
          <div
            className="glass-sm pointer-events-none absolute top-1 bottom-1 rounded-xl transition-[left,width] duration-300 ease-out"
            style={{ left: indicator.left, width: indicator.width }}
            aria-hidden
          />
        )}
        {MOBILE_VIEWS.map((target) => {
          const Icon = VIEW_ICONS[target]
          const active = view === target
          const showBadge = target === 'alarms' && alarmCount > 0
          return (
            <button
              key={target}
              ref={(node) => {
                buttonRefs.current[target] = node
              }}
              type="button"
              onClick={() => onChange(target)}
              aria-current={active}
              className={cn(
                'relative z-[1] flex flex-col items-center gap-1 rounded-xl py-2 text-center text-[9px] tracking-[0.16em] transition-colors duration-150',
                active ? 'text-chalk' : 'text-chalk-faint',
              )}
            >
              <span className="relative inline-flex">
                <Icon size={17} strokeWidth={2} aria-hidden />
                {showBadge && (
                  <span
                    className="bg-signal-alert text-chalk absolute -top-1.5 -right-2 grid h-[14px] min-w-[14px] place-items-center rounded-full px-[3px] text-[8px] leading-none tabular"
                    // The button's own tracking-[0.16em] inherits down here
                    // and lands *after* this lone digit — enough trailing
                    // space to pull the centered box (and the digit with it)
                    // visibly left of true-centre in a badge this small.
                    style={{ letterSpacing: 'normal' }}
                  >
                    {alarmCount}
                  </span>
                )}
              </span>
              {target.toUpperCase()}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
