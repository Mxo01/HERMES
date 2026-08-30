import type { ReactNode } from 'react'
import type { NodeInfo } from '@/shared/models/types'
import type { View } from '@/shared/const/view'

export interface LayoutDesktopProps {
  view: View
  onViewChange: (view: View) => void
  connected: boolean
  alarmCount: number
  nodes: NodeInfo[]
  /** True until the first node fetch resolves. */
  nodesLoading: boolean
  now: Date
  /** Shown in the sidebar in place of the node summary on the history view. */
  retentionNote: string | undefined
  sidebarCollapsed: boolean
  apiError: Error | undefined
  children: ReactNode
}
