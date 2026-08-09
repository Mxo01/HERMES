import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NodeInfo } from '@/lib/types'
import type { View } from '@/lib/view'

interface HeaderProps {
  view: View
  onViewChange: (view: View) => void
  connected: boolean
  alarmCount: number
  nodes: NodeInfo[]
  now: Date
  /** Shown in place of the node summary on the history view. */
  retentionNote?: string
}

/** Desktop chrome: identity on the left, system state and the view switch on the right. */
export function Header({
  view,
  onViewChange,
  connected,
  alarmCount,
  nodes,
  now,
  retentionNote,
}: HeaderProps) {
  const online = nodes.filter((node) => node.state === 'online').length
  const rooms = new Set(nodes.map((node) => node.room)).size

  return (
    <header className="border-ink-650 flex items-center justify-between border-b px-[26px] py-[15px]">
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 text-[13px] font-semibold tracking-[0.34em]">HERMES</span>
        {/* The subtitle is the first thing to go when width runs short. */}
        <span className="text-chalk-faint hidden truncate text-[11px] tracking-[0.08em] lg:block">
          {retentionNote ??
            `raspberry pi zero · ${online}/${nodes.length} nodes · ${rooms} room${rooms === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="text-chalk-soft flex shrink-0 items-center gap-5 text-[11px] tracking-[0.08em] whitespace-nowrap">
        <span className={connected ? 'text-signal-ok' : 'text-signal-alert'}>
          ● SOCKET {connected ? 'CONNECTED' : 'OFFLINE'}
        </span>
        {alarmCount > 0 && (
          <span className="text-signal-alert hidden xl:inline">▲ {alarmCount} ALARMS · 7D</span>
        )}
        <span className="tabular hidden sm:inline">{formatClock(now, true)}</span>

        <div className="border-ink-650 bg-ink-800 flex gap-[3px] rounded-lg border p-[3px]">
          {(['live', 'history'] as const).map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onViewChange(target)}
              aria-current={view === target}
              className={cn(
                'rounded-md px-4 py-[7px] text-[11px] tracking-[0.16em] transition-colors duration-150',
                view === target
                  ? 'bg-chalk text-ink-950'
                  : 'text-chalk-soft hover:bg-ink-600 hover:text-chalk-dim',
              )}
            >
              {target.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
