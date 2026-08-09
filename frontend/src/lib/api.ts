import type { Alarm, DailyPoint, HourlyPoint, Meta, Metric, NodeInfo, Room, Status } from '@/lib/types'

interface Envelope<T> {
  status: 'success' | 'error'
  data: T
  message?: string
  errors?: Record<string, string>
}

export class ApiError extends Error {
  readonly status: number
  readonly fields?: Record<string, string>

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })

  let body: Envelope<T> | undefined
  try {
    body = (await response.json()) as Envelope<T>
  } catch {
    body = undefined
  }

  if (!response.ok || body?.status === 'error') {
    throw new ApiError(body?.message ?? response.statusText, response.status, body?.errors)
  }
  if (!body) throw new ApiError('Malformed response', response.status)

  return body.data
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== 'all') search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export const api = {
  meta: (signal?: AbortSignal) => get<Meta>('/api/meta', signal),

  status: (signal?: AbortSignal) => get<Status>('/api/air-quality/status', signal),

  nodes: (signal?: AbortSignal) => get<NodeInfo[]>('/api/nodes', signal),

  hourly: (
    params: { room?: Room; metric?: Metric; hours: number },
    signal?: AbortSignal,
  ) => get<HourlyPoint[]>(`/api/air-quality/history${query({ ...params })}`, signal),

  /**
   * Daily aggregates. `offset` is the viewer's UTC offset in minutes so day
   * boundaries line up with local midnight rather than UTC's.
   */
  daily: (
    params: { room?: Room; metric?: Metric; from: string; to: string },
    signal?: AbortSignal,
  ) =>
    get<DailyPoint[]>(
      `/api/air-quality/daily${query({ ...params, offset: -new Date().getTimezoneOffset() })}`,
      signal,
    ),

  alarms: (params: { days?: number; room?: Room; limit?: number } = {}, signal?: AbortSignal) =>
    get<Alarm[]>(`/api/alarms${query({ ...params })}`, signal),
}
