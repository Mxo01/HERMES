import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
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
  // Every glass card is its own stacking context (backdrop-filter forces
  // one) — a popover positioned normally inside the header card can never
  // paint above the card that follows it, no matter its z-index. Same fix
  // as the chart tooltip: portal it to the body and place it from a
  // measured screen rect instead.
  const [panelRect, setPanelRect] = useState<{ top: number; right: number } | null>(null)
  // Sheet only: true for the duration of the slide-down, so the sheet stays
  // mounted (and animating) after `open` would otherwise have gone false.
  const [closing, setClosing] = useState(false)

  const today = startOfDay(new Date())
  const spanDays = daysBetween(range.from, range.to)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      // The popover panel is portaled to <body>, so it's no longer a DOM
      // descendant of `container` — it needs its own check or every click
      // inside it would look like an outside click and close it instantly.
      const insideTrigger = container.current?.contains(target)
      const insidePanel = panelRef.current?.contains(target)
      if (!insideTrigger && !insidePanel) close()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  })

  useLayoutEffect(() => {
    if (!open || variant !== 'popover') return
    const trigger = container.current
    if (!trigger) return

    const sync = () => {
      const rect = trigger.getBoundingClientRect()
      setPanelRect({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    sync()

    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [open, variant])

  function close() {
    // The sheet needs to stay mounted long enough to play its slide-down —
    // setting `open` false immediately would unmount it mid-animation.
    // `finishClose`, wired to the panel's `onAnimationEnd`, does the actual
    // unmount once that's done. The popover has no exit animation, so it
    // can just close outright.
    if (variant === 'sheet' && open) {
      setClosing(true)
      return
    }
    setOpen(false)
    setPendingStart(null)
  }

  function finishClose() {
    setOpen(false)
    setClosing(false)
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
    if (future) return { background: 'transparent', color: '#2e2e33', cursor: 'default' }

    // Mid-selection, the previous range is no longer what's in effect — only
    // the new start day is shown, so it doesn't look like both ranges apply.
    // The old range comes back on its own once `pendingStart` clears, since
    // closing without an end day never touched `range` in the first place.
    if (pendingStart) {
      if (sameDay(day, pendingStart)) return { background: accent, color: '#080809' }
      return undefined
    }

    const edge = sameDay(day, range.from) || sameDay(day, range.to)
    const inside = day >= range.from && day <= range.to

    if (edge) return { background: accent, color: '#080809' }
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
        className="glass-sm text-chalk-muted rounded-[5px] px-3 py-1.5 hover:text-chalk-dim"
        aria-label="Previous month"
      >
        <ChevronLeft size={13} strokeWidth={2} aria-hidden />
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
        className="glass-sm text-chalk-muted rounded-[5px] px-3 py-1.5 hover:text-chalk-dim"
        aria-label="Next month"
      >
        <ChevronRight size={13} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )

  const trigger = (
    <button
      type="button"
      onClick={() => (open ? close() : setOpen(true))}
      aria-expanded={open}
      className={cn(
        'glass-sm tabular text-chalk-dim flex items-center gap-2.5 rounded-md transition-colors duration-150',
        variant === 'sheet' ? 'w-full px-3.5 py-3.5 text-[11.5px]' : 'px-3.5 py-[7px] text-[11.5px]',
      )}
      style={{ letterSpacing: '0.14em', borderColor: open ? 'rgb(255 255 255 / 0.2)' : undefined }}
    >
      <Calendar size={13} strokeWidth={2} className="text-chalk-ghost shrink-0" aria-hidden />
      {label}
      <ChevronDown
        size={12}
        strokeWidth={2}
        className={cn('text-chalk-faint shrink-0', variant === 'sheet' && 'ml-auto')}
        aria-hidden
      />
    </button>
  )

  if (variant === 'sheet') {
    return (
      <div ref={container}>
        {trigger}
        {(open || closing) && (
          <div className="fixed inset-0 z-30 flex flex-col justify-end">
            <button
              type="button"
              aria-label="Close date picker"
              onClick={close}
              className={cn(
                'absolute inset-0 bg-[rgba(8,8,9,.72)]',
                closing ? 'animate-fade-out' : 'animate-fade-in',
              )}
            />
            <div
              className={cn(
                'glass relative rounded-t-[18px] px-[18px] pt-4 pb-[22px]',
                closing ? 'animate-sheet-out' : 'animate-sheet-in',
              )}
              onAnimationEnd={() => closing && finishClose()}
            >
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
                      'rounded-lg py-3 text-[10.5px] tracking-[0.12em]',
                      spanDays === preset.days && sameDay(range.to, today)
                        ? 'bg-chalk text-ink-950'
                        : 'glass-sm text-chalk-soft',
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
      {open &&
        panelRect &&
        createPortal(
          <div
            ref={panelRef}
            className="glass animate-rise fixed z-20 flex rounded-[10px]"
            style={{ top: panelRect.top, right: panelRect.right }}
          >
            <div className="border-white/10 flex min-w-[152px] flex-col gap-0.5 border-r px-3 py-4">
              <span className="text-chalk-ghost px-3 pb-2 text-[9.5px] tracking-[0.16em]">PRESETS</span>
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => applyPreset(preset.days)}
                  className={cn(
                    'rounded-[5px] px-3 py-[7px] text-left text-[10.5px] tracking-[0.12em] whitespace-nowrap transition-colors duration-150 hover:text-chalk-dim',
                    spanDays === preset.days && sameDay(range.to, today)
                      ? 'bg-chalk text-ink-950'
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
          </div>,
          document.body,
        )}
    </div>
  )
}
