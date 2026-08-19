import { useCallback, useEffect, useState } from 'react'
import type { View } from '@/lib/view'

const PATH_TO_VIEW: Record<string, View> = {
  '/': 'live',
  '/live': 'live',
  '/history': 'history',
  '/alarms': 'alarms',
}

function viewFromPath(pathname: string): View {
  return PATH_TO_VIEW[pathname] ?? 'live'
}

function pathFromView(view: View): string {
  return view === 'live' ? '/' : `/${view}`
}

/**
 * Keeps the active view in the URL, so switching tabs is a real navigation —
 * back/forward work, and a refresh lands back on the page you were looking
 * at instead of bouncing to Live. The backend's catch-all route hands back
 * the SPA shell for any of these paths, so a hard refresh resolves fine too.
 */
export function useRoute(): [View, (view: View) => void] {
  const [view, setViewState] = useState<View>(() => viewFromPath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setViewState(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setView = useCallback((next: View) => {
    setViewState((current) => {
      if (current === next) return current
      window.history.pushState(null, '', pathFromView(next))
      return next
    })
  }, [])

  return [view, setView]
}
