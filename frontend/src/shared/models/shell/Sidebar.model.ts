import type { View } from '@/shared/const/view'
import type { NodeInfo } from '@/shared/models/types'

export interface SidebarProps {
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
