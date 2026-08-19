import { cn } from '@/lib/utils'
import { MOBILE_VIEWS, VIEW_ICONS, type View } from '@/lib/view'

interface BottomTabsProps {
  view: View
  onChange: (view: View) => void
  alarmCount: number
}

/**
 * The phone's primary navigation: a floating pill rather than a bar welded
 * to the screen edge, so it reads as a control sitting over the content, not
 * another divider slicing up the page. Active state is a colour change, not
 * a filled pill — the icon and label already say enough on their own.
 */
export function BottomTabs({ view, onChange, alarmCount }: BottomTabsProps) {
  return (
    // No mt-auto: on a short page the bar sits right under the content
    // instead of being dragged down to the screen edge with a void above
    // it. `sticky bottom-0` still pins it while scrolling a long one.
    <nav className="sticky bottom-0 px-3 pb-3">
      <div className="border-ink-650 bg-ink-900/95 grid grid-cols-3 gap-1 rounded-2xl border p-1 shadow-[0_10px_30px_rgba(0,0,0,.55)] backdrop-blur">
        {MOBILE_VIEWS.map((target) => {
          const Icon = VIEW_ICONS[target]
          const active = view === target
          const showBadge = target === 'alarms' && alarmCount > 0
          return (
            <button
              key={target}
              type="button"
              onClick={() => onChange(target)}
              aria-current={active}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl py-2 text-center text-[9px] tracking-[0.16em] transition-colors duration-150',
                active ? 'text-chalk' : 'text-chalk-faint',
              )}
            >
              <span className="relative inline-flex">
                <Icon size={17} strokeWidth={2} aria-hidden />
                {showBadge && (
                  <span className="bg-signal-alert text-chalk absolute -top-1.5 -right-2 grid h-[14px] min-w-[14px] place-items-center rounded-full px-[3px] text-[8px] leading-none tabular">
                    <span className="translate-y-px">{alarmCount}</span>
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
