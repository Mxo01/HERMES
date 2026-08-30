import { TriangleAlert } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { ErrorBannerProps } from '../../models/shell/ErrorBanner.model'

/**
 * A strip for when the API itself is unreachable — distinct from the
 * per-panel "couldn't refresh" notes, which each cover one failed request.
 * This one says the dashboard as a whole may be showing stale or partial data.
 */
export function ErrorBanner({ message, compact = false }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 border-b text-[10.5px] tracking-[0.08em]',
        compact ? 'px-[18px] py-2' : 'px-[26px] py-2',
      )}
      style={{
        background: 'rgba(232,115,74,.1)',
        borderColor: 'rgba(232,115,74,.28)',
        color: 'var(--color-signal-alert)',
        backdropFilter: 'blur(18px) saturate(130%)',
        WebkitBackdropFilter: 'blur(18px) saturate(130%)',
      }}
    >
      <TriangleAlert size={13} strokeWidth={2} className="shrink-0" aria-hidden />
      {message}
    </div>
  )
}
