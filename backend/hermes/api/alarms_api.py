"""Alarm log endpoints."""

from flask import Blueprint, Response

from ..container import Services
from . import schemas
from .params import int_arg, string_arg
from .responses import success

MAX_LIMIT: int = 500


def create_alarms_blueprint(services: Services) -> Blueprint:
    blueprint = Blueprint('alarms', __name__, url_prefix='/api/alarms')

    @blueprint.get('')
    def recent() -> tuple[Response, int]:
        """Alarms started in the last ``days`` days, newest first."""
        days = max(1, min(int_arg('days', 14), 365))
        limit = max(1, min(int_arg('limit', 100), MAX_LIMIT))
        alarms = services.alarms.recent(days=days, room=string_arg('room'), limit=limit)

        now = services.clock.now()
        return success(
            [schemas.alarm(item, now) for item in alarms],
            meta={'days': days, 'total': len(alarms), 'active': sum(1 for a in alarms if a.active)},
        )

    return blueprint
