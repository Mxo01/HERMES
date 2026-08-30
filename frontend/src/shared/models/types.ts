/** Wire types — these mirror `hermes/api/schemas.py` exactly. */

export type Metric = 'gas' | 'temperature' | 'humidity' | 'aq'

/** The three metrics the room/metric tabs switch between. Gas gets its own panel. */
export type EnvMetric = Extract<Metric, 'temperature' | 'humidity' | 'aq'>

/**
 * Deliberately `string`, not a literal union like {@link Metric}: the room
 * list is dynamic, sourced from `/api/meta` (backend's single source of
 * truth is `hermes/domain/catalog.py`). A union here would need editing every
 * time a room is added to the installation — exactly the coupling the
 * catalog is meant to avoid. For the handful of fallback defaults used
 * before `/api/meta` resolves, use the constants in `shared/utils/metrics.ts`
 * (`KITCHEN`, `BEDROOM`, `OUTSIDE`) rather than a bare string literal.
 */
export type Room = string

export type Severity = 'high' | 'medium' | 'low'
export type AlarmKind = 'gas' | 'air_quality' | 'humidity' | 'node'
export type NodeState = 'online' | 'delayed' | 'offline' | 'unknown'
export type Resolution = 'raw' | 'hourly'

export interface MetricPoint {
  value: number
  timestamp: string
}

export type Status = Record<Room, Partial<Record<Metric, MetricPoint>>>

export interface HourlyPoint {
  room: Room
  metric: Metric
  hour: string
  avg: number
  min: number
  max: number
  count: number
}

export interface DailyPoint {
  room: Room
  metric: Metric
  day: string
  avg: number
  min: number
  max: number
  count: number
  resolution: Resolution
  alarms: number
}

export interface Alarm {
  id: number
  room: Room
  sensor: string | null
  metric: Metric | null
  kind: AlarmKind
  severity: Severity
  threshold: number | null
  peak: number | null
  detail: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  active: boolean
  notified: boolean
}

export interface NodeInfo {
  room: Room
  sensor: string
  label: string
  state: NodeState
  lastSeen: string | null
  secondsSince: number | null
}

export interface MetricSpec {
  id: Metric
  label: string
  unit: string
  decimals: number
  displayMin: number
  displayMax: number
}

export interface Meta {
  rooms: Room[]
  sensorRooms: Room[]
  outsideRoom: Room
  metrics: Record<Metric, MetricSpec>
  nodes: NodeInfo[]
  thresholds: { gas: number; aq: number; humidity: number }
  retention: { rawDays: number; downsamplingIntervalSeconds: number }
  outsideAvailable: boolean
  /** Where outdoor readings come from; null until the lookup resolves. */
  outsideLocation: {
    latitude: number
    longitude: number
    label: string | null
    source: 'configured' | 'ip'
  } | null
  alarmCount7d: number
  serverTime: string
}

/** Payload of the `sensor_update` socket event. */
export interface LiveReading extends Partial<Record<Metric, number>> {
  room: Room
  sensor: string
  timestamp?: string
}
