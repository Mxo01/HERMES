import { io, type Socket } from 'socket.io-client'

export const socket: Socket = io('/', {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

/** Events the backend pushes. Keep in sync with the publisher call sites. */
export interface ServerEvents {
  sensor_update: unknown
  fire_alert: unknown
  alarm_opened: unknown
  alarm_closed: unknown
  node_status: unknown
  connect: void
  disconnect: void
}

export type ServerEvent = keyof ServerEvents
