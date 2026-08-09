import { cn } from '@/lib/utils'
import type { Page } from '@/lib/history'

interface PagerProps {
  page: Page<unknown>
  onChange: (index: number) => void
  variant?: 'inline' | 'split'
}

const BUTTON =
  'border-ink-650 bg-ink-800 tabular rounded-md border text-[11px] tracking-[0.12em] transition-colors duration-150'

/** Shared pagination for the day-by-day tables. */
export function Pager({ page, onChange, variant = 'inline' }: PagerProps) {
  const canPrev = page.index > 0
  const canNext = page.index < page.count - 1

  if (variant === 'split') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onChange(page.index - 1)}
          className={cn(BUTTON, 'px-3.5 py-3', canPrev ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]')}
        >
          ‹ NEWER
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onChange(page.index + 1)}
          className={cn(BUTTON, 'px-3.5 py-3', canNext ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]')}
        >
          OLDER ›
        </button>
      </div>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-2.5">
      <span className="text-chalk-faint tabular text-[10px] tracking-[0.12em]">
        {page.from + 1}–{page.to} OF {page.total}
      </span>
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange(page.index - 1)}
        className={cn(BUTTON, 'px-3.5 py-1.5', canPrev ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]')}
        aria-label="Newer page"
      >
        ‹
      </button>
      <span className="text-chalk-muted tabular min-w-[74px] text-center text-[10px] tracking-[0.12em]">
        PAGE {page.index + 1} / {page.count}
      </span>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange(page.index + 1)}
        className={cn(BUTTON, 'px-3.5 py-1.5', canNext ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]')}
        aria-label="Older page"
      >
        ›
      </button>
    </div>
  )
}
