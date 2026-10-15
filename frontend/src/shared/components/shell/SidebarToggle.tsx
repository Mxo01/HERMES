import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { SidebarToggleProps } from '../../models/shell/SidebarToggle.model'

/** Shows or hides the desktop nav rail; sits at the head of every desktop view's filter bar. */
export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar'
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <button
      type="button"
      onClick={onToggle}
      className="glass-sm text-chalk-ghost hover:text-chalk-dim rounded-md p-1.5 transition-colors duration-150"
      aria-label={label}
      title={label}
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
    </button>
  )
}
