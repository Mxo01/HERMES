"""Pure validation of inbound node payloads."""

import datetime
from typing import Any

from . import catalog
from .errors import ValidationError
from .models import SensorReading


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _normalise(value: Any) -> str:
    return value.strip().lower() if isinstance(value, str) else ''


def parse_reading(payload: Any, recorded_at: datetime.datetime) -> SensorReading:
    """Turn a raw JSON body into a :class:`SensorReading`.

    Raises :class:`ValidationError` with one entry per offending field so the
    node firmware gets an actionable response.
    """
    if not isinstance(payload, dict):
        raise ValidationError({'body': 'Request body must be a JSON object'})

    errors: dict[str, str] = {}

    room = _normalise(payload.get('room'))
    if room not in catalog.SENSOR_ROOMS:
        allowed = ', '.join(sorted(catalog.SENSOR_ROOMS))
        errors['room'] = f'Unknown room. Must be one of: {allowed}'

    sensor = _normalise(payload.get('sensor'))
    if sensor not in catalog.SENSORS:
        allowed = ', '.join(sorted(catalog.SENSORS))
        errors['sensor'] = f'Unknown sensor. Must be one of: {allowed}'
        raise ValidationError(errors)

    values: dict[str, float] = {}
    for metric_id in catalog.SENSORS[sensor].metrics:
        spec = catalog.metric(metric_id)
        raw = payload.get(metric_id)
        if raw is None:
            errors[metric_id] = f'Missing required metric for {sensor}'
        elif not _is_number(raw) or not spec.valid_min <= float(raw) <= spec.valid_max:
            errors[metric_id] = f'Must be a number between {spec.valid_min} and {spec.valid_max}'
        else:
            values[metric_id] = float(raw)

    if errors:
        raise ValidationError(errors)

    return SensorReading(room=room, sensor=sensor, values=values, recorded_at=recorded_at)
