import { useEffect, useRef, useState } from 'react'
import { socket, type ServerEvent } from '@/shared/services/socket'

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
 * Run `handler` every time the shared connection comes back after a drop, but
 * not on the first connect. Whatever the server emitted while the socket was
 * down is gone for good, so state built from those events has to be refetched.
 */
export function useSocketReconnect(handler: () => void): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    let connectedBefore = socket.connected
    const onConnect = () => {
      if (connectedBefore) latest.current()
      connectedBefore = true
    }
    socket.on('connect', onConnect)
    return () => {
      socket.off('connect', onConnect)
    }
  }, [])
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
