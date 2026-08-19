import { useLayoutEffect, useRef, useState } from 'react'
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
  /** Animates the rail out to nothing rather than unmounting it, so the collapse has somewhere to go. */
  collapsed: boolean
}

/**
 * Desktop chrome: identity, navigation and system state, all in one rail on
 * the left rather than smeared across a top bar. Keeping Live/History here
 * — instead of as a third row of pill buttons — is what lets the room and
 * metric tabs above the content read as filters, not as one more nav choice.
 * Floats like the bottom bar does on the phone, and stays mounted even when
 * "hidden" — the toggle animates its width to zero instead of unmounting it,
 * which is what makes the collapse a motion rather than a jump cut.
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
  collapsed,
}: SidebarProps) {
  const online = nodes.filter((node) => node.state === 'online').length
  const rooms = new Set(nodes.map((node) => node.room)).size
  const nodeSummary =
    nodesLoading && nodes.length === 0
      ? 'Reading nodes…'
      : `${online}/${nodes.length} nodes · ${rooms} room${rooms === 1 ? '' : 's'}`

  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

  // The active pill slides between items top-to-bottom, the vertical
  // counterpart of the sliding pill on the phone's bottom bar — one element
  // in motion reads as a choice made, not a background just popping on.
  useLayoutEffect(() => {
    const nav = navRef.current
    const item = itemRefs.current[view]
    if (!nav || !item) return

    const sync = () => {
      const navBox = nav.getBoundingClientRect()
      const itemBox = item.getBoundingClientRect()
      setIndicator({ top: itemBox.top - navBox.top, height: itemBox.height })
    }
    sync()

    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [view, collapsed])

  return (
    <aside
      className={cn(
        'shrink-0 overflow-hidden transition-[width,margin,opacity] duration-300 ease-out',
        collapsed ? 'w-0 opacity-0' : 'my-4 ml-4 w-[216px] opacity-100',
      )}
      aria-hidden={collapsed}
    >
      <div className="glass flex h-full w-[216px] flex-col rounded-2xl">
        <div className="px-5 pt-6 pb-7">
          <span className="text-[13px] font-semibold tracking-[0.34em]">HERMES</span>
        </div>

        <nav ref={navRef} className="relative flex flex-col gap-0.5 px-3" aria-label="View">
          {indicator && (
            <div
              className="glass-sm pointer-events-none absolute inset-x-3 rounded-md transition-[top,height] duration-300 ease-out"
              style={{ top: indicator.top, height: indicator.height }}
              aria-hidden
            />
          )}
          {DESKTOP_VIEWS.map((target) => {
            const Icon = VIEW_ICONS[target]
            const active = view === target
            return (
              <button
                key={target}
                ref={(node) => {
                  itemRefs.current[target] = node
                }}
                type="button"
                onClick={() => onViewChange(target)}
                aria-current={active}
                tabIndex={collapsed ? -1 : undefined}
                className={cn(
                  'relative z-[1] flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11.5px] tracking-[0.14em] transition-colors duration-150',
                  active ? 'text-chalk' : 'text-chalk-soft hover:bg-white/5 hover:text-chalk-dim',
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
          <div className="border-white/10 flex items-center justify-between border-t pt-2.5">
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
      </div>
    </aside>
  )
}
