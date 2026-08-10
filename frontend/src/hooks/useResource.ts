import { useCallback, useEffect, useState } from 'react'

export interface Resource<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => void
}

/**
 * Fetch-on-mount with abort on unmount, a manual `reload`, and an optional
 * poll interval. `deps` behaves like a `useEffect` dependency list.
 */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: { pollMs?: number } = {},
): Resource<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<Error>()
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    const run = () => {
      fetcher(controller.signal)
        .then((result) => {
          if (!active) return
          setData(result)
          setError(undefined)
        })
        .catch((cause: unknown) => {
          if (!active || controller.signal.aborted) return
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    setLoading(true)
    run()

    const timer = options.pollMs ? window.setInterval(run, options.pollMs) : undefined
    return () => {
      active = false
      controller.abort()
      if (timer) window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, options.pollMs])

  return { data, error, loading, reload }
}
