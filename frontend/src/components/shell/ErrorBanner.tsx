import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBannerProps {
  message: string
  compact?: boolean
}

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
        background: 'rgba(232,115,74,.08)',
        borderColor: 'rgba(232,115,74,.28)',
        color: 'var(--color-signal-alert)',
      }}
    >
      <TriangleAlert size={13} strokeWidth={2} className="shrink-0" aria-hidden />
      {message}
    </div>
  )
}
