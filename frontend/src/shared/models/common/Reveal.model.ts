import type { ReactNode } from 'react'

export interface RevealProps {
  children: ReactNode
  className?: string
  /** Staggers a group of reveals so they don't all land in the same instant. */
  delayMs?: number
}
