"""HTTP layer: blueprint registration."""

from flask import Flask

from ..container import Services
from .alarms_api import create_alarms_blueprint
from .readings_api import create_readings_blueprint
from .responses import register_error_handlers
from .system_api import create_system_blueprint


def register_api(app: Flask, services: Services) -> None:
    app.register_blueprint(create_readings_blueprint(services))
    app.register_blueprint(create_alarms_blueprint(services))
    app.register_blueprint(create_system_blueprint(services))
    register_error_handlers(app)


__all__ = ['register_api']
