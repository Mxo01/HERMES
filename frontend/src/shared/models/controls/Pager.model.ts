import type { Page } from '@/shared/models/pagination.model'

export interface PagerProps {
  page: Page<unknown>
  onChange: (index: number) => void
  variant?: 'inline' | 'split'
}
