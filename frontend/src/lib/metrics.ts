import {
  BedDouble,
  ChefHat,
  CircleDot,
  CloudSun,
  Droplet,
  Flame,
  MapPin,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { EnvMetric, Metric, MetricSpec, Room, Severity } from '@/lib/types'

/**
 * One accent per metric, all at the same lightness and chroma so no metric
 * shouts louder than another — only the hue tells them apart.
 */
export const ACCENT: Record<EnvMetric, string> = {
  temperature: 'oklch(0.78 0.14 55)',
  humidity: 'oklch(0.78 0.14 230)',
  aq: 'oklch(0.78 0.14 155)',
}

export const ENV_METRICS: EnvMetric[] = ['temperature', 'humidity', 'aq']

export const METRIC_TITLES: Record<Metric, string> = {
  gas: 'Gas',
  temperature: 'Temperature',
  humidity: 'Humidity',
  aq: 'Air quality',
}

export const METRIC_UNITS: Record<Metric, string> = {
  gas: '',
  temperature: '°C',
  humidity: '%',
  aq: '',
}

export const METRIC_DECIMALS: Record<Metric, number> = {
  gas: 0,
  temperature: 1,
  humidity: 0,
  aq: 0,
}

/** One glyph per metric, so a tab or column header reads before its label does. */
export const METRIC_ICONS: Record<Metric, LucideIcon> = {
  gas: Flame,
  temperature: Thermometer,
  humidity: Droplet,
  aq: Wind,
}

/**
 * Fallback full-scale range for the comparison bars, used only until
 * `/api/meta` arrives. The server is the authority — see {@link metricSpan}.
 */
const FALLBACK_SPAN: Record<Metric, [number, number]> = {
  gas: [0, 1023],
  temperature: [5, 35],
  humidity: [10, 95],
  aq: [0, 500],
}

/**
 * The scale a bar is drawn against.
 *
 * Fixed per metric rather than derived from the data, so a bar means the same
 * thing in every room. The values come from the backend's metric catalog, so
 * thresholds and display range can never drift apart between the two.
 */
export function metricSpan(metric: Metric, specs?: Record<Metric, MetricSpec>): [number, number] {
  const spec = specs?.[metric]
  return spec ? [spec.displayMin, spec.displayMax] : FALLBACK_SPAN[metric]
}

export const ROOM_LABELS: Record<Room, string> = {
  kitchen: 'Kitchen',
  bedroom: 'Bedroom',
  outside: 'Outside',
}

/** Known rooms get a recognisable glyph; anything else falls back to a pin. */
const ROOM_ICONS: Partial<Record<Room, LucideIcon>> = {
  kitchen: ChefHat,
  bedroom: BedDouble,
  outside: CloudSun,
}

export function roomIcon(room: Room): LucideIcon {
  return ROOM_ICONS[room] ?? MapPin
}

export const SENSOR_LABELS: Record<string, string> = {
  mq2: 'MQ-2',
  mq135: 'MQ-135',
  weather: 'Weather',
}

/**
 * The component that actually produced a reading. Node B carries two chips, so
 * naming the chip rather than the board makes an alarm's origin unambiguous.
 */
export function sensorForMetric(sensor: string | null, metric: Metric | null): string {
  if (metric === 'temperature' || metric === 'humidity') return 'DHT22'
  if (metric === 'aq') return 'MQ-135'
  if (metric === 'gas') return 'MQ-2'
  return sensor ? (SENSOR_LABELS[sensor] ?? sensor) : ''
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  high: 'var(--color-signal-alert)',
  medium: 'var(--color-signal-warn)',
  low: 'var(--color-signal-ok)',
}

export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  high: TriangleAlert,
  medium: TriangleAlert,
  low: CircleDot,
}

export const ALARM_KIND_LABELS: Record<string, string> = {
  gas: 'Gas / smoke',
  air_quality: 'Air quality',
  humidity: 'Humidity',
  node: 'Node',
}

export function roomLabel(room: Room): string {
  return ROOM_LABELS[room] ?? room
}

/**
 * Re-express an oklch accent at a lower alpha, e.g. for chart fills.
 * Mirrors how the accents are authored: `oklch(L C H)` → `oklch(L C H / a)`.
 */
export function withAlpha(color: string, alpha: number): string {
  return color.replace(/\)\s*$/, ` / ${alpha})`)
}
