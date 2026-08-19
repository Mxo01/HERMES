import { formatDuration, formatStamp } from '@/lib/format'
import { ALARM_KIND_LABELS, SEVERITY_COLOR, SEVERITY_ICON, roomLabel, sensorForMetric } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import type { Alarm } from '@/lib/types'

const COLUMNS = '52px 118px 172px 1fr 92px 118px'

function emptyMessage(loading: boolean | undefined, error: Error | undefined): string {
  if (error) return "Couldn't load. Check the connection and try again."
  if (loading) return 'Loading…'
  return 'No alarms in this window.'
}

function source(alarm: Alarm): string {
  const sensor = sensorForMetric(alarm.sensor, alarm.metric)
  return [roomLabel(alarm.room), sensor].filter(Boolean).join(' · ').toUpperCase()
}

function severityLabel(alarm: Alarm): string {
  return alarm.severity === 'medium' ? 'MED' : alarm.severity.toUpperCase()
}

interface AlarmTableProps {
  alarms: Alarm[]
  /** True until the first fetch for this window resolves. */
  loading?: boolean
  /** A failed request — takes priority over the loading/empty message. */
  error?: Error
}

/** The desktop alarm log: one dense row per event. */
export function AlarmTable({ alarms, loading, error }: AlarmTableProps) {
  if (alarms.length === 0) {
    return (
      <p
        className={cn(
          'py-6 text-[11.5px] tracking-[0.06em]',
          error ? 'text-signal-alert' : 'text-chalk-faint',
        )}
      >
        {emptyMessage(loading, error)}
      </p>
    )
  }

  return (
    <div role="table">
      <div
        className="border-white/10 text-chalk-ghost grid items-center gap-x-4 border-b pb-[9px] text-[9.5px] tracking-[0.14em]"
        style={{ gridTemplateColumns: COLUMNS }}
        role="row"
      >
        <span>SEV</span>
        <span>TYPE</span>
        <span>SOURCE</span>
        <span>DETAIL</span>
        <span>DURATION</span>
        <span className="text-right">WHEN</span>
      </div>

      {alarms.map((alarm) => {
        const SeverityIcon = SEVERITY_ICON[alarm.severity]
        return (
          <div
            key={alarm.id}
            role="row"
            className="border-white/8 tabular grid items-center gap-x-4 border-b py-[11px] text-[11.5px] tracking-[0.04em]"
            style={{ gridTemplateColumns: COLUMNS }}
          >
            <span
              className="flex items-center gap-1"
              style={{ color: SEVERITY_COLOR[alarm.severity], letterSpacing: '0.1em' }}
            >
              <SeverityIcon size={11} strokeWidth={2} aria-hidden />
              {severityLabel(alarm)}
            </span>
            <span className="text-chalk-dim uppercase">{ALARM_KIND_LABELS[alarm.kind] ?? alarm.kind}</span>
            <span className="text-chalk-soft">{source(alarm)}</span>
            <span className="text-chalk-muted">
              {alarm.detail}
              {alarm.active && <span className="text-signal-alert"> · ongoing</span>}
            </span>
            <span className="text-chalk-faint">{formatDuration(alarm.durationSeconds)}</span>
            <span className="text-chalk-faint text-right uppercase">{formatStamp(alarm.startedAt)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The phone alarm log: the same fields, stacked into a card. */
export function AlarmCards({ alarms, loading, error }: AlarmTableProps) {
  if (alarms.length === 0) {
    return (
      <p
        className={cn(
          'px-[18px] text-[11px] tracking-[0.06em]',
          error ? 'text-signal-alert' : 'text-chalk-faint',
        )}
      >
        {emptyMessage(loading, error)}
      </p>
    )
  }

  return (
    // No pb-4 here: <main>'s own bottom padding now clears the fixed tab
    // bar for every mobile view, this one included — adding more here would
    // just stack on top of that.
    <div className="flex flex-col gap-2.5 px-[18px]">
      {alarms.map((alarm, index) => {
        const SeverityIcon = SEVERITY_ICON[alarm.severity]
        return (
          <div
            key={alarm.id}
            className="glass rounded-xl px-[15px] py-[13px]"
            style={{ animation: `rise .45s ${index * 40}ms ease both` }}
          >
            <div className="mb-[7px] flex items-center gap-2.5">
              <span
                className="flex items-center gap-1"
                style={{ color: SEVERITY_COLOR[alarm.severity], fontSize: 11, letterSpacing: '0.1em' }}
              >
                <SeverityIcon size={11} strokeWidth={2} aria-hidden />
                {severityLabel(alarm)}
              </span>
              <span className="text-chalk-dim text-[11px] tracking-[0.1em] uppercase">
                {ALARM_KIND_LABELS[alarm.kind] ?? alarm.kind}
              </span>
              <span className="text-chalk-faint tabular ml-auto text-[10px] uppercase">
                {formatStamp(alarm.startedAt)}
              </span>
            </div>

            <div className="text-chalk-muted text-[11px] leading-[1.45] tracking-[0.03em]">
              {alarm.detail}
            </div>

            <div className="text-chalk-faint mt-2 flex gap-3.5 text-[10px] tracking-[0.06em]">
              <span>{source(alarm)}</span>
              <span>{alarm.active ? 'ONGOING' : formatDuration(alarm.durationSeconds)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
