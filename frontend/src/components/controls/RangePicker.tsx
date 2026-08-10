import { useEffect, useRef, useState } from 'react'
import {
  RANGE_PRESETS,
  WEEK_DAY_INITIALS,
  buildMonthGrid,
  daysBetween,
  presetRange,
  sameDay,
  startOfDay,
  type DateRange,
  type MonthGrid,
} from '@/lib/dates'
import { formatDayShort } from '@/lib/format'
import { withAlpha } from '@/lib/metrics'
import { cn } from '@/lib/utils'

interface RangePickerProps {
  range: DateRange
  onChange: (range: DateRange) => void
  accent: string
  /** `sheet` slides up from the bottom — the phone presentation. */
  variant?: 'popover' | 'sheet'
}

/**
 * Two-step range picker: the first click sets the start, the second the end.
 * Presets sit alongside because most of the time the question is "the last N
 * days", not a specific pair of dates.
 */
export function RangePicker({ range, onChange, accent, variant = 'popover' }: RangePickerProps) {
  const [open, setOpen] = useState(false)
  const [pendingStart, setPendingStart] = useState<Date | null>(null)
  const [anchor, setAnchor] = useState(() => new Date(range.to.getFullYear(), range.to.getMonth() - 1, 1))
  const container = useRef<HTMLDivElement>(null)

  const today = startOfDay(new Date())
  const spanDays = daysBetween(range.from, range.to)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) close()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  })

  function close() {
    setOpen(false)
    setPendingStart(null)
  }

  function pickDay(day: Date) {
    if (!pendingStart) {
      setPendingStart(day)
      return
    }
    const [from, to] = pendingStart <= day ? [pendingStart, day] : [day, pendingStart]
    onChange({ from, to })
    close()
  }

  function applyPreset(days: number) {
    onChange(presetRange(days))
    close()
  }

  const label = `${formatDayShort(range.from)} — ${formatDayShort(range.to)} ${range.to.getFullYear()}`
  const hint = pendingStart ? 'PICK THE END DAY' : 'PICK THE START DAY'
  const months: MonthGrid[] =
    variant === 'sheet'
      ? [buildMonthGrid(anchor, 1)]
      : [buildMonthGrid(anchor, 0), buildMonthGrid(anchor, 1)]

  const dayStyle = (day: Date | null) => {
    if (!day) return undefined
    const future = day > today
    const edge = sameDay(day, range.from) || sameDay(day, range.to)
    const inside = day >= range.from && day <= range.to
    const pending = pendingStart && sameDay(day, pendingStart)

    if (future) return { background: 'transparent', color: '#2e2e33', cursor: 'default' }
    if (edge || pending) return { background: accent, color: '#080809' }
    if (inside) return { background: withAlpha(accent, 0.16), color: 'var(--color-chalk)' }
    return undefined
  }

  const calendar = (cellSize: number, fontSize: number) => (
    <div className={cn('flex', variant === 'sheet' ? '' : 'gap-[22px]')}>
      {months.map((month) => (
        <div key={month.name} style={{ width: variant === 'sheet' ? '100%' : 210 }}>
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEK_DAY_INITIALS.map((initial, index) => (
              <span
                key={index}
                className="text-center text-[9.5px] tracking-[0.1em] text-[#4f4f55]"
              >
                {initial}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {month.cells.map((cell, index) =>
              cell.date ? (
                <button
                  key={index}
                  type="button"
                  disabled={cell.date > today}
                  onClick={() => cell.date && pickDay(cell.date)}
                  className="tabular text-chalk-muted flex items-center justify-center rounded-[5px] transition-colors duration-150 enabled:hover:bg-[#1c1c20] disabled:cursor-default"
                  style={{ height: cellSize, fontSize, ...dayStyle(cell.date) }}
                >
                  {cell.label}
                </button>
              ) : (
                <span key={index} style={{ height: cellSize }} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const monthNav = (
    <div className="mb-3 flex items-center justify-between">
      <button
        type="button"
        onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
        className="text-chalk-muted rounded-[5px] bg-[#151518] px-3 py-1.5 text-[13px] hover:text-chalk-dim"
        aria-label="Previous month"
      >
        ‹
      </button>
      {variant === 'sheet' ? (
        <span className="text-chalk-dim text-[11px] tracking-[0.18em]">{months[0].name}</span>
      ) : (
        <div className="flex gap-[74px]">
          {months.map((month) => (
            <span key={month.name} className="text-chalk-dim text-[10.5px] tracking-[0.16em]">
              {month.name}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
        className="text-chalk-muted rounded-[5px] bg-[#151518] px-3 py-1.5 text-[13px] hover:text-chalk-dim"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )

  const trigger = (
    <button
      type="button"
      onClick={() => (open ? close() : setOpen(true))}
      aria-expanded={open}
      className={cn(
        'tabular text-chalk-dim flex items-center gap-2.5 rounded-md border transition-colors duration-150',
        variant === 'sheet' ? 'w-full px-3.5 py-3.5 text-[11.5px]' : 'px-3.5 py-[7px] text-[11.5px]',
        open ? 'border-ink-400 bg-ink-650' : 'border-ink-650 bg-ink-800',
      )}
      style={{ letterSpacing: '0.14em' }}
    >
      <span
        className="block h-[11px] w-[11px] rounded-sm border-[1.5px] border-t-[3px] border-[#7c7c83]"
        aria-hidden
      />
      {label}
      <span className={cn('text-chalk-faint text-[9px]', variant === 'sheet' && 'ml-auto')}>▼</span>
    </button>
  )

  if (variant === 'sheet') {
    return (
      <div ref={container}>
        {trigger}
        {open && (
          <div className="fixed inset-0 z-30 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close date picker"
              onClick={close}
              className="absolute inset-0 bg-[rgba(8,8,9,.72)]"
              style={{ animation: 'fade-in .2s ease both' }}
            />
            <div className="animate-rise border-ink-500 relative rounded-t-[18px] border-t bg-ink-850 px-[18px] pt-4 pb-[22px]">
              <div className="bg-ink-500 mx-auto mb-4 h-1 w-[38px] rounded-sm" />
              {monthNav}
              {calendar(38, 12.5)}
              <div className="text-chalk-ghost mt-3.5 mb-2.5 text-[10px] tracking-[0.14em]">{hint}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {RANGE_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => applyPreset(preset.days)}
                    className={cn(
                      'border-ink-600 rounded-lg border py-3 text-[10.5px] tracking-[0.12em]',
                      spanDays === preset.days && sameDay(range.to, today)
                        ? 'bg-ink-600 text-chalk'
                        : 'text-chalk-soft',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={container}>
      {trigger}
      {open && (
        <div className="animate-rise border-ink-500 bg-ink-850 absolute top-11 right-0 z-20 flex rounded-[10px] border shadow-[0_18px_50px_rgba(0,0,0,.65)]">
          <div className="border-ink-650 flex min-w-[152px] flex-col gap-0.5 border-r px-3 py-4">
            <span className="text-chalk-ghost px-3 pb-2 text-[9.5px] tracking-[0.16em]">PRESETS</span>
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  'rounded-[5px] px-3 py-[7px] text-left text-[10.5px] tracking-[0.12em] whitespace-nowrap transition-colors duration-150 hover:text-chalk-dim',
                  spanDays === preset.days && sameDay(range.to, today)
                    ? 'bg-ink-600 text-chalk'
                    : 'text-chalk-soft',
                )}
              >
                {preset.label}
              </button>
            ))}
            <span className="text-chalk-ghost px-3 pt-3.5 text-[9.5px] leading-[1.5] tracking-[0.1em]">
              {hint}
            </span>
          </div>
          <div className="px-[18px] py-4">
            {monthNav}
            {calendar(26, 11)}
          </div>
        </div>
      )}
    </div>
  )
}
