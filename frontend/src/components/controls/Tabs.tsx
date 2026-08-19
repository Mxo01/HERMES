import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TabItem<T extends string> {
  id: T
  label: string
  /** When set, the selected tab uses this as its background. */
  accent?: string
  /** Shown before the label — lets a tab read at a glance, label or not. */
  icon?: LucideIcon
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** `room` is the larger, brighter switch; `metric` the smaller accented one. */
  tone?: 'room' | 'metric'
  /** `fill` spreads the tabs across the full width — used on the phone layout. */
  layout?: 'inline' | 'fill'
  label?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  tone = 'room',
  layout = 'inline',
  label,
}: TabsProps<T>) {
  const fill = layout === 'fill'

  return (
    <div
      className={cn('flex items-center gap-1.5', fill && 'w-full')}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const selected = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            style={selected && item.accent ? { background: item.accent, color: '#080809' } : undefined}
            className={cn(
              'tabular flex items-center justify-center whitespace-nowrap transition-colors duration-200',
              Icon && 'gap-[7px]',
              fill ? 'flex-1 rounded-lg' : 'rounded-md',
              tone === 'room'
                ? fill
                  ? 'py-4 text-[11.5px] tracking-[0.14em]'
                  : 'px-4 py-2 text-[12px] tracking-[0.14em]'
                : fill
                  ? 'py-3.5 text-[10px] tracking-[0.12em]'
                  : 'px-2.5 py-1.5 text-[10.5px] tracking-[0.14em]',
              selected
                ? tone === 'room'
                  ? 'bg-chalk text-ink-950'
                  : 'text-ink-950'
                : tone === 'room'
                  ? 'bg-ink-800 text-chalk-soft hover:text-chalk-dim'
                  : 'bg-ink-800 text-chalk-faint hover:text-chalk-soft',
            )}
          >
            {Icon && <Icon size={tone === 'room' ? 14 : 12} strokeWidth={2} aria-hidden />}
            {item.label.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
