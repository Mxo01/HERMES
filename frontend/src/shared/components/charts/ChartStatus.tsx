import { CircleSlash2, Loader2, TriangleAlert } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { ChartStatusProps } from '../../models/charts/ChartStatus.model'

/**
 * The line a chart shows in place of its canvas: fetching, a failed request,
 * or — the fallback — not enough data to plot. Three distinct messages so a
 * dead API doesn't read the same as a sensor that simply hasn't reported yet.
 */
export function ChartStatus({
  loading,
  error,
  emptyLabel,
  emptyIcon: EmptyIcon = CircleSlash2,
  size = 'spacious',
  className,
}: ChartStatusProps) {
  const Icon = error ? TriangleAlert : loading ? Loader2 : EmptyIcon
  const label = error ? "Couldn't load" : loading ? 'Reading…' : emptyLabel
  const tone = error ? 'text-signal-alert' : 'text-chalk-trace'

  if (size === 'compact') {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-center text-[10px] tracking-[0.18em] uppercase',
          tone,
          className,
        )}
        title={error?.message}
      >
        {label}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-2 text-center',
        tone,
        className,
      )}
      title={error?.message}
    >
      <Icon
        size={26}
        strokeWidth={1.5}
        className={loading ? 'animate-spin' : undefined}
        aria-hidden
      />
      <span className="text-[10px] tracking-[0.18em] uppercase">{label}</span>
    </div>
  )
}
