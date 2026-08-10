import { formatDelta, formatMetric } from '@/lib/format'
import type { HalfPeriodStat } from '@/lib/series'
import type { Metric } from '@/lib/types'

interface CompareStatsProps {
  stats: HalfPeriodStat[]
  metric: Metric
  accent: string
  quietDelta: number
  compact?: boolean
}

function toneOf(delta: number, quietDelta: number, accent: string): string {
  if (Math.abs(delta) < quietDelta) return 'var(--color-chalk-faint)'
  return delta > 0 ? accent : 'var(--color-signal-cool)'
}

/**
 * Second half of the range against the first. It answers "is this getting
 * better or worse?" without needing a second date range to compare against.
 */
export function CompareStats({ stats, metric, accent, quietDelta, compact = false }: CompareStatsProps) {
  if (stats.length === 0) return null

  if (compact) {
    return (
      <div className="flex flex-col gap-px px-[18px] pt-2 pb-1">
        {stats.map((stat) => (
          <div key={stat.label} className="border-ink-700 flex items-baseline gap-2.5 border-b py-[11px]">
            <span className="text-chalk-ghost w-[74px] text-[9.5px] tracking-[0.16em]">{stat.label}</span>
            <span className="tabular text-[22px] font-medium tracking-[-0.03em]">
              {formatMetric(stat.now, metric)}
            </span>
            <span className="text-[11px]" style={{ color: toneOf(stat.delta, quietDelta, accent) }}>
              {formatDelta(stat.delta, metric)}
            </span>
            <span className="text-chalk-faint ml-auto text-[10px]">
              was {formatMetric(stat.was, metric)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="border-ink-650 bg-ink-900 grid grid-cols-3 border-y">
      {stats.map((stat) => (
        <div key={stat.label} className="border-ink-650 border-r px-6 py-4">
          <div className="label-xs text-chalk-ghost mb-2.5">
            {stat.label} · second half vs first half
          </div>
          <div className="flex items-baseline gap-3">
            <span className="tabular text-[30px] font-medium tracking-[-0.03em]">
              {formatMetric(stat.now, metric)}
            </span>
            <span
              className="text-[13px] tracking-[0.06em]"
              style={{ color: toneOf(stat.delta, quietDelta, accent) }}
            >
              {formatDelta(stat.delta, metric)}
            </span>
            <span className="text-chalk-faint ml-auto text-[11px] tracking-[0.06em]">
              was {formatMetric(stat.was, metric)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
