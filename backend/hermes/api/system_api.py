"""System endpoints: node liveness, installation metadata, health."""

from flask import Blueprint, Response

from ..container import Services
from ..domain import catalog
from . import schemas
from .responses import success


def create_system_blueprint(services: Services) -> Blueprint:
    blueprint = Blueprint('system', __name__, url_prefix='/api')

    @blueprint.get('/nodes')
    def nodes() -> tuple[Response, int]:
        """Per-board liveness derived from the last reading each one posted."""
        return success([schemas.node_status(node) for node in services.nodes.list_status()])

    @blueprint.get('/meta')
    def meta() -> tuple[Response, int]:
        """Everything the dashboard needs to configure itself on first paint."""
        settings = services.settings
        return success(
            {
                'rooms': list(catalog.KNOWN_ROOMS),
                # Installation order, not alphabetical — the UI shows the tabs
                # in the order the rooms are laid out in the flat.
                'sensorRooms': [room for room in catalog.KNOWN_ROOMS if room in catalog.SENSOR_ROOMS],
                'outsideRoom': catalog.OUTSIDE,
                'metrics': {
                    metric_id: schemas.metric_spec(spec) for metric_id, spec in catalog.METRICS.items()
                },
                'nodes': [schemas.node_status(node) for node in services.nodes.list_status()],
                'thresholds': {
                    'gas': settings.alarms.gas_threshold,
                    'aq': settings.alarms.aq_threshold,
                    'humidity': settings.alarms.humidity_threshold,
                },
                'retention': {
                    'rawDays': settings.retention_days,
                    'downsamplingIntervalSeconds': settings.downsampling_interval_seconds,
                },
                'outsideAvailable': services.weather.enabled,
                'outsideLocation': schemas.location(services.weather.location()),
                'alarmCount7d': services.alarms.count(days=7),
                'serverTime': schemas.iso(services.clock.now()),
            }
        )

    @blueprint.get('/health')
    def health() -> tuple[Response, int]:
        return success({'ok': True, 'time': schemas.iso(services.clock.now())})

    return blueprint
