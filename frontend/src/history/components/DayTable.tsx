import { TriangleAlert } from 'lucide-react'
import { RangeBar } from '@/history/components/RangeBar'
import { formatDelta, formatMetric } from '@/shared/utils/format'
import { dayDeltaColor, dayTableEmptyMessage } from '../history.utils'
import { cn } from '@/shared/utils/cn'
import type { DayTableProps } from '../models/DayTable.model'

const COLUMNS = '96px 76px 76px 76px 84px 1fr 66px 96px'

/** The desktop day-by-day table. For the phone variant, see `DayRows`. */
export function DayTable({ rows, metric, accent, quietDelta, loading, error }: DayTableProps) {
  if (rows.length === 0) {
    return (
      <p className={cn('py-6 text-[11.5px]', error ? 'text-signal-alert' : 'text-chalk-faint')}>
        {dayTableEmptyMessage(loading, error)}
      </p>
    )
  }

  return (
    <div role="table">
      <div
        className="border-white/10 text-chalk-ghost grid items-center gap-x-3.5 border-b pb-[9px] text-[9.5px] tracking-[0.14em]"
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
          className="border-white/8 tabular grid items-center gap-x-3.5 border-b py-[9px] text-[11.5px] tracking-[0.04em]"
          style={{ gridTemplateColumns: COLUMNS, animation: `fade-in .5s ${index * 28}ms both` }}
        >
          <span className="text-chalk-dim">
            {row.date} <span className="text-chalk-trace">{row.weekday}</span>
          </span>
          <span className="text-chalk-soft">{formatMetric(row.min, metric)}</span>
          <span className="text-chalk">{formatMetric(row.avg, metric)}</span>
          <span className="text-chalk-soft">{formatMetric(row.max, metric)}</span>
          <span style={{ color: dayDeltaColor(row.delta, quietDelta, accent) }}>
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
