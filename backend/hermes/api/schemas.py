"""Serialization of domain objects into the JSON the dashboard consumes.

Keeping this in the API layer means the domain models never grow transport
concerns, and the wire format can change without touching business rules.
"""

import datetime

from ..domain import catalog
from ..domain.models import Alarm, Coordinates, DailyPoint, HourlyPoint, MetricPoint, NodeStatus
from ..json_types import JsonObject


def iso(value: datetime.datetime | None) -> str | None:
    return value.isoformat() if value else None


def metric_point(point: MetricPoint) -> JsonObject:
    return {'value': point.value, 'timestamp': iso(point.timestamp)}


def latest_readings(readings: dict[str, dict[str, MetricPoint]]) -> dict[str, JsonObject]:
    return {
        room: {metric: metric_point(point) for metric, point in metrics.items()}
        for room, metrics in readings.items()
    }


def hourly_point(point: HourlyPoint) -> JsonObject:
    return {
        'room': point.room,
        'metric': point.metric,
        'hour': iso(point.hour),
        'avg': point.avg,
        'min': point.min,
        'max': point.max,
        'count': point.count,
    }


def daily_point(point: DailyPoint) -> JsonObject:
    return {
        'room': point.room,
        'metric': point.metric,
        'day': point.day.isoformat(),
        'avg': point.avg,
        'min': point.min,
        'max': point.max,
        'count': point.count,
        'resolution': str(point.resolution),
        'alarms': point.alarms,
    }


def alarm(item: Alarm, now: datetime.datetime) -> JsonObject:
    return {
        'id': item.id,
        'room': item.room,
        'sensor': item.sensor,
        'metric': item.metric,
        'kind': str(item.kind),
        'severity': str(item.severity),
        'threshold': item.threshold,
        'peak': item.peak_value,
        'detail': item.detail,
        'startedAt': iso(item.started_at),
        'endedAt': iso(item.ended_at),
        'durationSeconds': item.duration_seconds(now),
        'active': item.active,
        'notified': item.notified,
    }


def node_status(node: NodeStatus) -> JsonObject:
    return {
        'room': node.room,
        'sensor': node.sensor,
        'label': node.label,
        'state': str(node.state),
        'lastSeen': iso(node.last_seen),
        'secondsSince': node.seconds_since,
    }


def location(coordinates: Coordinates | None) -> JsonObject | None:
    if coordinates is None:
        return None
    return {
        'latitude': round(coordinates.latitude, 4),
        'longitude': round(coordinates.longitude, 4),
        'label': coordinates.label,
        'source': coordinates.source,
    }


def metric_spec(spec: catalog.MetricSpec) -> JsonObject:
    return {
        'id': spec.id,
        'label': spec.label,
        'unit': spec.unit,
        'decimals': spec.decimals,
        'displayMin': spec.display_min,
        'displayMax': spec.display_max,
    }
