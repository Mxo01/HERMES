import { TriangleAlert } from 'lucide-react'
import { formatDelta, formatMetric } from '@/lib/format'
import type { DayRow } from '@/lib/history'
import type { Metric } from '@/lib/types'
import { cn } from '@/lib/utils'

const COLUMNS = '96px 76px 76px 76px 84px 1fr 66px 96px'

interface RangeBarProps {
  row: DayRow
  accent: string
  height?: number
}

/** The day's min–max span, positioned within the range, with a dot at the average. */
function RangeBar({ row, accent, height = 8 }: RangeBarProps) {
  return (
    <div className="bg-ink-800 relative rounded" style={{ height }}>
      <div
        className="absolute top-0 rounded"
        style={{ height, background: accent, opacity: 0.32, left: row.barLeft, width: row.barWidth }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: height === 8 ? 1 : 0.5,
          width: 6,
          height: 6,
          background: accent,
          left: row.dotLeft,
          marginLeft: -3,
        }}
      />
    </div>
  )
}

interface DayTableProps {
  rows: DayRow[]
  metric: Metric
  accent: string
  /** Values within this fraction of the range read as "no real change". */
  quietDelta: number
  /** True until the first fetch for this range resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty message. */
  error?: Error
}

function emptyMessage(loading: boolean | undefined, error: Error | undefined): string {
  if (error) return "Couldn't load. Check the connection and try again."
  if (loading) return 'Loading…'
  return 'No readings in this range.'
}

function deltaColor(delta: number | null, quietDelta: number, accent: string): string {
  if (delta === null) return 'var(--color-chalk-trace)'
  if (Math.abs(delta) < quietDelta) return 'var(--color-chalk-faint)'
  return delta > 0 ? accent : 'var(--color-signal-cool)'
}

export function DayTable({ rows, metric, accent, quietDelta, loading, error }: DayTableProps) {
  if (rows.length === 0) {
    return (
      <p className={cn('py-6 text-[11.5px]', error ? 'text-signal-alert' : 'text-chalk-faint')}>
        {emptyMessage(loading, error)}
      </p>
    )
  }

  return (
    <div role="table">
      <div
        className="border-ink-650 text-chalk-ghost grid items-center gap-x-3.5 border-b pb-[9px] text-[9.5px] tracking-[0.14em]"
        style={{ gridTemplateColumns: COLUMNS }}
        role="row"
      >
        <span>DATE</span>
        <span>MIN</span>
        <span>AVG</span>
        <span>MAX</span>
        <span>Δ DAY</span>
        <span>RANGE</span>
        <span>ALARMS</span>
        <span className="text-right">RESOLUTION</span>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          role="row"
          className="border-ink-750 tabular grid items-center gap-x-3.5 border-b py-[9px] text-[11.5px] tracking-[0.04em]"
          style={{ gridTemplateColumns: COLUMNS, animation: `fade-in .5s ${index * 28}ms both` }}
        >
          <span className="text-chalk-dim">
            {row.date} <span className="text-chalk-trace">{row.weekday}</span>
          </span>
          <span className="text-chalk-soft">{formatMetric(row.min, metric)}</span>
          <span className="text-chalk">{formatMetric(row.avg, metric)}</span>
          <span className="text-chalk-soft">{formatMetric(row.max, metric)}</span>
          <span style={{ color: deltaColor(row.delta, quietDelta, accent) }}>
            {row.delta === null ? '—' : formatDelta(row.delta, metric)}
          </span>
          <RangeBar row={row} accent={accent} />
          <span
            className={cn(
              'flex items-center gap-1',
              row.alarms ? 'text-signal-alert' : 'text-chalk-trace',
            )}
          >
            {row.alarms ? (
              <>
                <TriangleAlert size={11} strokeWidth={2} aria-hidden />
                {row.alarms}
              </>
            ) : (
              '—'
            )}
          </span>
          <span
            className={cn(
              'text-right text-[10px] tracking-[0.1em]',
              row.resolution === 'raw' ? 'text-chalk-soft' : 'text-chalk-trace',
            )}
          >
            {row.resolution === 'raw' ? 'RAW 30s' : 'HOURLY AVG'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The phone variant: date, average, range bar, alarm count. */
export function DayRows({ rows, metric, accent, loading, error }: Omit<DayTableProps, 'quietDelta'>) {
  if (rows.length === 0) {
    return (
      <p className={cn('py-4 text-[11px]', error ? 'text-signal-alert' : 'text-chalk-faint')}>
        {emptyMessage(loading, error)}
      </p>
    )
  }

  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="border-ink-750 tabular grid items-center gap-x-2.5 border-b py-[9px] text-[11px] tracking-[0.04em]"
          style={{ gridTemplateColumns: '64px 54px 1fr 40px' }}
        >
          <span className="text-chalk-dim">{row.date}</span>
          <span className="text-chalk">{formatMetric(row.avg, metric)}</span>
          <RangeBar row={row} accent={accent} height={7} />
          <span
            className={cn(
              'flex items-center justify-end gap-1 text-[10px]',
              row.alarms ? 'text-signal-alert' : 'text-chalk-trace',
            )}
          >
            {row.alarms ? (
              <>
                <TriangleAlert size={10} strokeWidth={2} aria-hidden />
                {row.alarms}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
