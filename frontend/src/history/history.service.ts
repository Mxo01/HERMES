/** HTTP access for the History domain — the one fetch no other domain needs. */

import { api } from '@/shared/services/api'
import type { DailyPoint, Metric, Room } from '@/shared/models/types'
import { toISODate } from '@/shared/utils/dates'
import { useResource, type Resource } from '@/hooks/useResource'

export function useDaily(room: Room, metric: Metric, from: Date, to: Date): Resource<DailyPoint[]> {
  const fromISO = toISODate(from)
  const toISO = toISODate(to)
  return useResource(
    (signal) => api.daily({ room, metric, from: fromISO, to: toISO }, signal),
    [room, metric, fromISO, toISO],
  )
}
