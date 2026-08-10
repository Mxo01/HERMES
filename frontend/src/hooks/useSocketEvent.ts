import { useEffect, useRef, useState } from 'react'
import { socket, type ServerEvent } from '@/lib/socket'

/** Opens the shared connection for as long as any component needs it. */
export function useSocketConnection(): boolean {
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (!socket.connected) socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return connected
}

/**
 * Subscribe to one server event. The handler is kept in a ref so callers can
 * pass an inline closure without re-subscribing on every render.
 */
export function useSocketEvent<T>(event: ServerEvent, handler: (payload: T) => void): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const listener = (payload: T) => latest.current(payload)
    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [event])
}
