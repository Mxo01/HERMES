import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Alarm, DailyPoint, HourlyPoint, LiveReading, Meta, Metric, NodeInfo, Room, Status } from '@/lib/types'
import { toISODate } from '@/lib/dates'
import { useResource, type Resource } from '@/hooks/useResource'
import { useSocketEvent } from '@/hooks/useSocketEvent'

const METRIC_KEYS: Metric[] = ['gas', 'temperature', 'humidity', 'aq']

export function useMeta(): Resource<Meta> {
  return useResource((signal) => api.meta(signal), [])
}

export function useNodes(): Resource<NodeInfo[]> {
  return useResource((signal) => api.nodes(signal), [], { pollMs: 30_000 })
}

/**
 * Latest value per room and metric, seeded from the API and then kept current
 * by `sensor_update` events — so the hero number moves the instant a node posts.
 */
export function useLiveStatus(): { status: Status; loading: boolean; error: Error | undefined } {
  const { data, loading, error } = useResource((signal) => api.status(signal), [])
  const [status, setStatus] = useState<Status>({})

  useEffect(() => {
    if (data) setStatus(data)
  }, [data])

  useSocketEvent<LiveReading>('sensor_update', (reading) => {
    if (!reading?.room) return
    const timestamp = reading.timestamp ?? new Date().toISOString()

    setStatus((previous) => {
      const room = { ...(previous[reading.room] ?? {}) }
      for (const metric of METRIC_KEYS) {
        const value = reading[metric]
        if (typeof value === 'number') room[metric] = { value, timestamp }
      }
      return { ...previous, [reading.room]: room }
    })
  })

  return { status, loading, error }
}

export function useHourly(metric: Metric, hours: number, room?: Room): Resource<HourlyPoint[]> {
  return useResource((signal) => api.hourly({ metric, hours, room }, signal), [metric, hours, room])
}

export function useDaily(room: Room, metric: Metric, from: Date, to: Date): Resource<DailyPoint[]> {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)
  return useResource(
    (signal) => api.daily({ room, metric, from: fromISO, to: toISO }, signal),
    [room, metric, fromISO, toISO],
  )
}

/** The alarm log, refreshed whenever the server opens or closes an alarm. */
export function useAlarms(days = 14, room?: Room): Resource<Alarm[]> {
  const resource = useResource((signal) => api.alarms({ days, room }, signal), [days, room])
  const { reload } = resource

  const onChange = useCallback(() => reload(), [reload])
  useSocketEvent('alarm_opened', onChange)
  useSocketEvent('alarm_closed', onChange)

  return resource
}
