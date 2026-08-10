import { cn } from '@/lib/utils'
import { MOBILE_VIEWS, type View } from '@/lib/view'

interface BottomTabsProps {
  view: View
  onChange: (view: View) => void
  alarmCount: number
}

/** The phone's primary navigation, pinned to the bottom of the screen. */
export function BottomTabs({ view, onChange, alarmCount }: BottomTabsProps) {
  return (
    <nav className="border-ink-650 bg-ink-900 sticky bottom-0 mt-auto grid grid-cols-3 gap-1.5 border-t p-2 pb-4">
      {MOBILE_VIEWS.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => onChange(target)}
          aria-current={view === target}
          className={cn(
            'rounded-lg py-[13px] text-center text-[10px] tracking-[0.16em] transition-colors duration-150',
            view === target ? 'bg-chalk text-ink-950' : 'text-chalk-faint',
          )}
        >
          {target.toUpperCase()}
          {target === 'alarms' && alarmCount > 0 && (
            <span className={view === 'alarms' ? 'text-[#c1502a]' : 'text-signal-alert'}>
              {' '}
              ▲{alarmCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
