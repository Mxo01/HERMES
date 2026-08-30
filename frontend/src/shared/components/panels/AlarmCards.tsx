import { StatusNote } from '@/shared/components/common/StatusNote'
import { formatDuration, formatStamp } from '@/shared/utils/format'
import {
  ALARM_KIND_LABELS,
  SEVERITY_COLOR,
  SEVERITY_ICON,
  alarmEmptyMessage,
  alarmSeverityLabel,
  alarmSource,
} from '@/shared/utils/metrics'
import type { AlarmListProps } from '../../models/panels/AlarmList.model'

/** The phone alarm log: the same fields as `AlarmTable`, stacked into a card. */
export function AlarmCards({ alarms, loading, error }: AlarmListProps) {
  if (alarms.length === 0) {
    return (
      <StatusNote
        error={error}
        message={alarmEmptyMessage(loading, error)}
        className="px-[18px] text-[11px] tracking-[0.06em]"
      />
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
                style={{
                  color: SEVERITY_COLOR[alarm.severity],
                  fontSize: 11,
                  letterSpacing: '0.1em',
                }}
              >
                <SeverityIcon size={11} strokeWidth={2} aria-hidden />
                {alarmSeverityLabel(alarm)}
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
              <span>{alarmSource(alarm)}</span>
              <span>{alarm.active ? 'ONGOING' : formatDuration(alarm.durationSeconds)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
