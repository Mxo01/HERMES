import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { PagerProps } from '../../models/controls/Pager.model'

const BUTTON =
  'glass-sm tabular rounded-md text-[11px] tracking-[0.12em] transition-colors duration-150'

/**
 * Shared pagination for the day-by-day tables. Rows read newest-first, so
 * older sits to the left (further back, like scrolling a timeline toward the
 * past) and newer to the right (toward the present) — the reverse of the
 * page index itself, which counts up as you go back in time.
 */
export function Pager({ page, onChange, variant = 'inline' }: PagerProps) {
  const canPrev = page.index > 0
  const canNext = page.index < page.count - 1

  if (variant === 'split') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onChange(page.index + 1)}
          className={cn(
            BUTTON,
            'flex items-center justify-center gap-1 px-3.5 py-3',
            canNext ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]',
          )}
        >
          <ChevronLeft size={13} strokeWidth={2} aria-hidden />
          OLDER
        </button>
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onChange(page.index - 1)}
          className={cn(
            BUTTON,
            'flex items-center justify-center gap-1 px-3.5 py-3',
            canPrev ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]',
          )}
        >
          NEWER
          <ChevronRight size={13} strokeWidth={2} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="ml-auto flex items-center gap-2.5">
      <span className="text-chalk-faint tabular text-[10px] tracking-[0.12em]">
        {page.from + 1}–{page.to} OF {page.total}
      </span>
      {/* Icon-only, so it has to read by arrow convention alone: left steps
          back toward page 1 (and is disabled there), right steps forward —
          the reverse of which page is chronologically "older" doesn't show
          up here without the OLDER/NEWER text the split variant has. */}
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange(page.index - 1)}
        className={cn(
          BUTTON,
          'flex items-center justify-center px-3.5 py-1.5',
          canPrev ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]',
        )}
        aria-label="Newer page"
      >
        <ChevronLeft size={13} strokeWidth={2} aria-hidden />
      </button>
      <span className="text-chalk-muted tabular min-w-[74px] text-center text-[10px] tracking-[0.12em]">
        PAGE {page.index + 1} / {page.count}
      </span>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange(page.index + 1)}
        className={cn(
          BUTTON,
          'flex items-center justify-center px-3.5 py-1.5',
          canNext ? 'text-chalk-dim' : 'cursor-default text-[#3a3a3f]',
        )}
        aria-label="Older page"
      >
        <ChevronRight size={13} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}
