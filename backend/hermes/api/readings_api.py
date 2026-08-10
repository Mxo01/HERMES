"""Reading endpoints.

The ``/api/air-quality`` prefix is the contract the ESP8266 firmware and the
original dashboard already speak, so it is preserved verbatim.
"""

import datetime

from flask import Blueprint, Response, request

from ..container import Services
from . import schemas
from .auth import verify_device_token
from .params import date_arg, int_arg, string_arg
from .responses import success


def create_readings_blueprint(services: Services) -> Blueprint:
    blueprint = Blueprint('readings', __name__, url_prefix='/api/air-quality')

    @blueprint.post('/data')
    def ingest() -> tuple[Response, int]:
        """Called by the nodes every 30s."""
        verify_device_token(services.settings.ingest_token)
        reading = services.ingestion.ingest(request.get_json(silent=True))
        return success({'room': reading.room, 'sensor': reading.sensor, 'metrics': reading.values}, 201)

    @blueprint.get('/status')
    def status() -> tuple[Response, int]:
        """Latest value of every metric, per room."""
        return success(schemas.latest_readings(services.readings.latest()))

    @blueprint.get('/history')
    def history() -> tuple[Response, int]:
        """Hourly aggregates over the last ``hours`` hours."""
        points = services.readings.hourly(
            room=string_arg('room'),
            metric=string_arg('metric'),
            hours=int_arg('hours', 24),
        )
        return success([schemas.hourly_point(point) for point in points])

    @blueprint.get('/daily')
    def daily() -> tuple[Response, int]:
        """Daily min/avg/max between ``from`` and ``to`` (inclusive)."""
        today = services.clock.now().date()
        start = date_arg('from', today - datetime.timedelta(days=13))
        end = date_arg('to', today)

        points = services.readings.daily(
            room=string_arg('room'),
            metric=string_arg('metric'),
            start=start,
            end=end,
            offset_minutes=int_arg('offset', 0),
        )
        return success(
            [schemas.daily_point(point) for point in points],
            range={'from': start.isoformat(), 'to': end.isoformat()},
        )

    return blueprint
