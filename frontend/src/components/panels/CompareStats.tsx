import { AnimatedValue } from '@/components/shared/AnimatedValue'
import { formatDelta, formatMetric } from '@/lib/format'
import type { HalfPeriodStat } from '@/lib/series'
import type { Metric } from '@/lib/types'
import { cn } from '@/lib/utils'

interface CompareStatsProps {
  stats: HalfPeriodStat[]
  metric: Metric
  accent: string
  quietDelta: number
  compact?: boolean
  /** True until the first fetch for this range resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty note. */
  error?: Error
}

function toneOf(delta: number, quietDelta: number, accent: string): string {
  if (Math.abs(delta) < quietDelta) return 'var(--color-chalk-faint)'
  return delta > 0 ? accent : 'var(--color-signal-cool)'
}

/**
 * Second half of the range against the first. It answers "is this getting
 * better or worse?" without needing a second date range to compare against.
 */
export function CompareStats({
  stats,
  metric,
  accent,
  quietDelta,
  compact = false,
  loading = false,
  error,
}: CompareStatsProps) {
  if (stats.length === 0) {
    // Silent when there just isn't a range to compare yet — only speak up
    // while fetching or when the fetch itself failed.
    if (!loading && !error) return null
    return (
      <div
        className={cn(
          'glass text-[10.5px] tracking-[0.1em] uppercase',
          compact ? 'mx-[18px] mb-4 rounded-2xl px-[18px] py-2.5' : 'rounded-2xl px-6 py-4',
          error ? 'text-signal-alert' : 'text-chalk-faint',
        )}
      >
        {error ? "Couldn't load the comparison" : 'Loading…'}
      </div>
    )
  }

  if (compact) {
    return (
      <div className="glass mx-[18px] mb-4 flex flex-col gap-px rounded-2xl px-[18px] pt-2 pb-1">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-white/10 flex items-baseline gap-2.5 border-b py-[11px] last:border-b-0"
          >
            <span className="text-chalk-ghost w-[74px] text-[9.5px] tracking-[0.16em]">{stat.label}</span>
            <span className="tabular text-[22px] font-medium tracking-[-0.03em]">
              <AnimatedValue value={stat.now} format={(v) => formatMetric(v, metric)} />
            </span>
            <span className="text-[11px]" style={{ color: toneOf(stat.delta, quietDelta, accent) }}>
              <AnimatedValue value={stat.delta} format={(v) => formatDelta(v, metric)} />
            </span>
            <span className="text-chalk-faint ml-auto text-[10px]">
              was <AnimatedValue value={stat.was} format={(v) => formatMetric(v, metric)} />
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="glass grid grid-cols-3 rounded-2xl">
      {stats.map((stat) => (
        <div key={stat.label} className="border-white/10 border-r px-6 py-4 last:border-r-0">
          <div className="label-xs text-chalk-ghost mb-2.5">
            {stat.label} · second half vs first half
          </div>
          <div className="flex items-baseline gap-3">
            <span className="tabular text-[30px] font-medium tracking-[-0.03em]">
              <AnimatedValue value={stat.now} format={(v) => formatMetric(v, metric)} />
            </span>
            <span
              className="text-[13px] tracking-[0.06em]"
              style={{ color: toneOf(stat.delta, quietDelta, accent) }}
            >
              <AnimatedValue value={stat.delta} format={(v) => formatDelta(v, metric)} />
            </span>
            <span className="text-chalk-faint ml-auto text-[11px] tracking-[0.06em]">
              was <AnimatedValue value={stat.was} format={(v) => formatMetric(v, metric)} />
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
