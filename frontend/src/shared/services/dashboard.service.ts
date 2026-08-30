/**
 * HTTP + realtime access shared by two or more domains — the installation
 * catalog, node status, live sensor status, and hourly history. `useDaily`
 * lives in `history/history.service.ts` instead: History is its only caller.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/shared/services/api'
import type {
  Alarm,
  HourlyPoint,
  LiveReading,
  Meta,
  Metric,
  MetricPoint,
  NodeInfo,
  Room,
  Status,
} from '@/shared/models/types'
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
    if (!data) return
    // Merge rather than replace: the socket can deliver a reading before this
    // request resolves, and overwriting it with the older snapshot would show
    // a stale value until the node next reports.
    setStatus((previous) => {
      const next: Status = { ...previous }
      for (const [room, metrics] of Object.entries(data)) {
        const merged = { ...(next[room] ?? {}) }
        for (const [metric, point] of Object.entries(metrics) as [Metric, MetricPoint][]) {
          const held = merged[metric]
          if (!held || held.timestamp <= point.timestamp) merged[metric] = point
        }
        next[room] = merged
      }
      return next
    })
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

/** The alarm log, refreshed whenever the server opens or closes an alarm. */
export function useAlarms(days = 14, room?: Room): Resource<Alarm[]> {
  const resource = useResource((signal) => api.alarms({ days, room }, signal), [days, room])
  const { reload } = resource

  const onChange = useCallback(() => reload(), [reload])
  useSocketEvent('alarm_opened', onChange)
  useSocketEvent('alarm_closed', onChange)

  return resource
}
