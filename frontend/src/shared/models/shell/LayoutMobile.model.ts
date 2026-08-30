import type { ReactNode } from 'react'
import type { View } from '@/shared/const/view'

export interface LayoutMobileProps {
  view: View
  onViewChange: (view: View) => void
  connected: boolean
  now: Date
  /** Falls back to 7 until /api/meta resolves. */
  retentionRawDays: number
  apiError: Error | undefined
  alarmCount: number
  children: ReactNode
}
