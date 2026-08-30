import { cn } from '@/shared/utils/cn'
import type { TabsProps } from '../../models/controls/Tabs.model'

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
            style={
              selected && item.accent ? { background: item.accent, color: '#080809' } : undefined
            }
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
                  ? 'glass-sm text-chalk-soft hover:text-chalk-dim'
                  : 'glass-sm text-chalk-faint hover:text-chalk-soft',
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
