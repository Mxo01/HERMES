import { AnimatedValue } from '@/components/shared/AnimatedValue'
import { formatMetric, percent } from '@/lib/format'
import { ACCENT, ENV_METRICS, METRIC_ICONS, METRIC_TITLES, metricSpan, roomLabel } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import type { EnvMetric, Metric, MetricSpec, Room, Status } from '@/lib/types'

interface RoomComparisonProps {
  status: Status
  rooms: Room[]
  outsideRoom: Room
  /** Place the outdoor readings come from, e.g. "Pisa, Italy". */
  outsideLocation?: string | null
  /** Metric catalog from /api/meta; the bars are scaled against it. */
  metricSpecs?: Record<Metric, MetricSpec>
  compact?: boolean
  /** True until the first live-status fetch resolves. */
  loading?: boolean
  /** A failed live-status request — the bars keep showing the last good values. */
  error?: Error
}

const SHORT_LABELS: Record<EnvMetric, string> = {
  temperature: 'TEMP',
  humidity: 'HUM',
  aq: 'AIR',
}

/**
 * Every room against every metric at a glance. The bars share a fixed
 * full-scale range per metric, so a row's bar length means the same thing in
 * each room — including outdoors, drawn in grey because it is context, not a
 * place you control.
 */
export function RoomComparison({
  status,
  rooms,
  outsideRoom,
  outsideLocation,
  metricSpecs,
  compact = false,
  loading = false,
  error,
}: RoomComparisonProps) {
  const ordered = [...rooms.filter((room) => room !== outsideRoom), outsideRoom]
  const hasReadings = ordered.some((room) => ENV_METRICS.some((metric) => status[room]?.[metric] !== undefined))

  return (
    <div
      className={cn(
        'grid items-center',
        compact ? 'gap-x-2.5 gap-y-[9px]' : 'gap-x-3.5 gap-y-2.5',
      )}
      style={{ gridTemplateColumns: `${compact ? 72 : 78}px repeat(3, 1fr)` }}
    >
      {(error || (loading && !hasReadings)) && (
        <div
          className={cn(
            'col-span-4 text-[10px] tracking-[0.1em] uppercase',
            error ? 'text-signal-alert' : 'text-chalk-faint',
          )}
        >
          {error ? "Couldn't refresh live status" : 'Loading…'}
        </div>
      )}

      <span />
      {ENV_METRICS.map((metric) => {
        const Icon = METRIC_ICONS[metric]
        return (
          <span
            key={metric}
            className="text-chalk-ghost flex items-center gap-1 uppercase"
            style={{ fontSize: compact ? 8.5 : 9.5, letterSpacing: compact ? '0.12em' : '0.14em' }}
          >
            <Icon size={compact ? 10 : 11} strokeWidth={2} aria-hidden />
            {compact ? SHORT_LABELS[metric] : METRIC_TITLES[metric]}
          </span>
        )
      })}

      {ordered.map((room) => {
        const outdoor = room === outsideRoom
        return (
          <div key={room} className="contents">
            <span
              className={cn('uppercase', outdoor ? 'text-chalk-faint' : 'text-chalk')}
              style={{ fontSize: compact ? 9.5 : 10.5, letterSpacing: compact ? '0.12em' : '0.14em' }}
            >
              {roomLabel(room)}
              {outdoor && outsideLocation && (
                <span
                  className="text-chalk-trace block truncate text-[8.5px] tracking-[0.08em] normal-case"
                  title={outsideLocation}
                >
                  {/* City only: the column is 78px wide and the country adds nothing here. */}
                  {outsideLocation.split(',')[0]}
                </span>
              )}
            </span>

            {ENV_METRICS.map((metric, index) => {
              const value = status[room]?.[metric]?.value
              return (
                <div key={metric}>
                  <div
                    className="tabular font-medium"
                    style={{
                      fontSize: compact ? 15 : 18,
                      letterSpacing: '-0.02em',
                      marginBottom: compact ? 4 : 5,
                    }}
                  >
                    <AnimatedValue value={value} format={(v) => formatMetric(v, metric)} />
                  </div>
                  <div
                    className="bg-ink-650 overflow-hidden rounded-sm"
                    style={{ height: compact ? 3 : 4 }}
                  >
                    <div
                      className="animate-grow rounded-sm"
                      style={{
                        height: compact ? 3 : 4,
                        background: outdoor ? 'var(--color-ink-400)' : ACCENT[metric],
                        width: value === undefined ? '0%' : percent(value, metricSpan(metric, metricSpecs)),
                        animationDelay: `${0.15 + index * 0.08}s`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
