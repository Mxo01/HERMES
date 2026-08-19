import { TriangleAlert } from 'lucide-react'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DESKTOP_VIEWS, VIEW_ICONS, type View } from '@/lib/view'
import type { NodeInfo } from '@/lib/types'

interface SidebarProps {
  view: View
  onViewChange: (view: View) => void
  connected: boolean
  alarmCount: number
  nodes: NodeInfo[]
  /** True until the first node fetch resolves — the node/room counts are meaningless until then. */
  nodesLoading?: boolean
  now: Date
  /** Shown in place of the node summary on the history view. */
  retentionNote?: string
}

/**
 * Desktop chrome: identity, navigation and system state, all in one rail on
 * the left rather than smeared across a top bar. Keeping Live/History here
 * — instead of as a third row of pill buttons — is what lets the room and
 * metric tabs above the content read as filters, not as one more nav choice.
 * The rail itself is toggled from the content header, so it can go away
 * entirely rather than shrinking to a second icon strip.
 */
export function Sidebar({
  view,
  onViewChange,
  connected,
  alarmCount,
  nodes,
  nodesLoading = false,
  now,
  retentionNote,
}: SidebarProps) {
  const online = nodes.filter((node) => node.state === 'online').length
  const rooms = new Set(nodes.map((node) => node.room)).size
  const nodeSummary =
    nodesLoading && nodes.length === 0
      ? 'Reading nodes…'
      : `${online}/${nodes.length} nodes · ${rooms} room${rooms === 1 ? '' : 's'}`

  return (
    <aside className="border-ink-650 bg-ink-900 flex h-dvh w-[216px] shrink-0 flex-col border-r">
      <div className="px-5 pt-6 pb-7">
        <span className="text-[13px] font-semibold tracking-[0.34em]">HERMES</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3" aria-label="View">
        {DESKTOP_VIEWS.map((target) => {
          const Icon = VIEW_ICONS[target]
          const active = view === target
          return (
            <button
              key={target}
              type="button"
              onClick={() => onViewChange(target)}
              aria-current={active}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] tracking-[0.14em] transition-colors duration-150',
                active ? 'text-chalk' : 'text-chalk-soft hover:text-chalk-dim',
              )}
            >
              <Icon size={14} strokeWidth={2} aria-hidden />
              {target.toUpperCase()}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5 px-5 pb-6 text-[10.5px] tracking-[0.08em]">
        {alarmCount > 0 && (
          <span className="text-signal-alert flex items-center gap-1.5">
            <TriangleAlert size={12} strokeWidth={2} aria-hidden />
            {alarmCount} ALARMS · 7D
          </span>
        )}
        <span className="text-chalk-faint uppercase leading-[1.5]">
          {retentionNote ?? nodeSummary}
        </span>
        <div className="border-ink-650 flex items-center justify-between border-t pt-2.5">
          <span
            className={cn(
              'flex items-center gap-1.5',
              connected ? 'text-signal-ok' : 'text-signal-alert',
            )}
          >
            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" aria-hidden />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span className="text-chalk-soft tabular">{formatClock(now)}</span>
        </div>
      </div>
    </aside>
  )
}
