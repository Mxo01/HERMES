"""Application factory."""

import logging
import os
from dataclasses import dataclass
from pathlib import Path

from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO

from .api import register_api
from .api.spa import register_spa
from .config import Settings
from .container import Services, build_services
from .infrastructure.jobs.scheduler import JobScheduler, PeriodicJob
from .infrastructure.realtime.socketio_publisher import SocketIOPublisher

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Application:
    app: Flask
    socketio: SocketIO
    services: Services
    scheduler: JobScheduler


def create_app(settings: Settings | None = None, *, start_jobs: bool = True) -> Application:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=logging.DEBUG if settings.debug else logging.INFO,
        format='%(asctime)s %(levelname)-7s %(name)s: %(message)s',
    )

    app = Flask(__name__)
    app.config['SECRET_KEY'] = settings.secret_key
    app.config['MAX_CONTENT_LENGTH'] = settings.max_content_length

    # In production the dashboard is same-origin, so no cross-origin access is
    # granted unless CORS_ORIGINS is set explicitly (the Vite dev server).
    origins = [origin.strip() for origin in settings.cors_origins.split(',') if origin.strip()]
    if origins:
        CORS(app, origins=origins)

    socketio = SocketIO(app, cors_allowed_origins=origins or [], async_mode='threading')

    services = build_services(settings, publisher=SocketIOPublisher(socketio))
    services.database.migrate()

    register_api(app, services)
    if settings.frontend_dist:
        register_spa(app, Path(settings.frontend_dist))

    scheduler = _build_scheduler(services, settings)
    if start_jobs and _is_primary_process(settings):
        scheduler.start()

    return Application(app=app, socketio=socketio, services=services, scheduler=scheduler)


def _build_scheduler(services: Services, settings: Settings) -> JobScheduler:
    scheduler = JobScheduler()

    scheduler.add(
        PeriodicJob(
            name='downsampling',
            interval_seconds=settings.downsampling_interval_seconds,
            run=services.retention.downsample,
        )
    )
    scheduler.add(
        PeriodicJob(
            name='node-watchdog',
            interval_seconds=settings.alarms.watchdog_interval_seconds,
            run=lambda: {'nodes': len(services.nodes.check_offline())},
            run_on_start=False,
        )
    )
    if services.weather.enabled:
        scheduler.add(
            PeriodicJob(
                name='weather-sync',
                interval_seconds=settings.weather.refresh_seconds,
                run=lambda: {'stored': services.weather.sync_current()},
            )
        )
        scheduler.add(
            PeriodicJob(
                name='weather-backfill',
                # Often enough that a throttled run recovers the same day, but
                # still only a couple of requests each time.
                interval_seconds=6 * 3600,
                run=lambda: {'hours': services.weather.backfill(settings.retention_days)},
            )
        )

    return scheduler


def _is_primary_process(settings: Settings) -> bool:
    """Avoid running every background job twice under the Werkzeug reloader."""
    if not settings.debug:
        return True
    return os.environ.get('WERKZEUG_RUN_MAIN') == 'true'
