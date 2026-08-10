import datetime
from collections.abc import Iterator
from typing import Any

import pytest
from flask import Flask
from flask.testing import FlaskClient

from hermes.api import register_api
from hermes.config import AlarmSettings, Settings, TelegramSettings, WeatherSettings
from hermes.container import Services, build_services


class FrozenClock:
    """A clock the tests can move by hand."""

    def __init__(self, start: datetime.datetime) -> None:
        self._now = start

    def now(self) -> datetime.datetime:
        return self._now

    def advance(self, **delta: float) -> None:
        self._now += datetime.timedelta(**delta)


class RecordingPublisher:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    def publish(self, event: str, payload: dict[str, Any]) -> None:
        self.events.append((event, payload))

    def names(self) -> list[str]:
        return [name for name, _ in self.events]


@pytest.fixture
def clock() -> FrozenClock:
    return FrozenClock(datetime.datetime(2026, 8, 9, 14, 32, tzinfo=datetime.UTC))


@pytest.fixture
def publisher() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def settings(tmp_path: Any) -> Settings:
    return Settings(
        database_path=str(tmp_path / 'test.db'),
        secret_key='test',
        host='127.0.0.1',
        port=5001,
        debug=False,
        cors_origins='',
        max_content_length=1024,
        frontend_dist='',
        ingest_token=None,
        retention_days=7,
        downsampling_interval_seconds=3600,
        telegram=TelegramSettings(bot_token=None, chat_id=None, cooldown_seconds=60),
        alarms=AlarmSettings(
            gas_threshold=150.0,
            aq_threshold=300.0,
            humidity_threshold=70.0,
            node_delayed_after_seconds=90,
            node_offline_after_seconds=300,
            watchdog_interval_seconds=60,
        ),
        weather=WeatherSettings(
            latitude=43.7228,
            longitude=10.4017,
            label='Pisa, Italy',
            refresh_seconds=900,
            enabled=False,
        ),
    )


@pytest.fixture
def services(settings: Settings, clock: FrozenClock, publisher: RecordingPublisher) -> Services:
    built = build_services(settings, publisher=publisher, clock=clock)
    built.database.migrate()
    return built


@pytest.fixture
def client(services: Services) -> Iterator[FlaskClient]:
    app = Flask(__name__)
    app.config['TESTING'] = True
    register_api(app, services)
    with app.test_client() as test_client:
        yield test_client
