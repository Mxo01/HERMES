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

const COLUMNS = '52px 118px 172px 1fr 92px 118px'

/** The desktop alarm log: one dense row per event. */
export function AlarmTable({ alarms, loading, error }: AlarmListProps) {
  if (alarms.length === 0) {
    return (
      <StatusNote
        error={error}
        message={alarmEmptyMessage(loading, error)}
        className="py-6 text-[11.5px] tracking-[0.06em]"
      />
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
              {alarmSeverityLabel(alarm)}
            </span>
            <span className="text-chalk-dim uppercase">
              {ALARM_KIND_LABELS[alarm.kind] ?? alarm.kind}
            </span>
            <span className="text-chalk-soft">{alarmSource(alarm)}</span>
            <span className="text-chalk-muted">
              {alarm.detail}
              {alarm.active && <span className="text-signal-alert"> · ongoing</span>}
            </span>
            <span className="text-chalk-faint">{formatDuration(alarm.durationSeconds)}</span>
            <span className="text-chalk-faint text-right uppercase">
              {formatStamp(alarm.startedAt)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
