import { useCallback, useState } from 'react'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : stored === '1'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Not remembered across visits, but the toggle itself still works.
  }
}

/**
 * A boolean UI preference remembered across visits. Storage can be missing or
 * throw (site data blocked, some embedded webviews), and losing a preference
 * must never take the page down with it, so every access is guarded.
 */
export function usePersistentFlag(key: string, fallback = false): [boolean, () => void] {
  const [value, setValue] = useState(() => readFlag(key, fallback))

  const toggle = useCallback(() => {
    const next = !value
    setValue(next)
    writeFlag(key, next)
  }, [key, value])

  return [value, toggle]
}
