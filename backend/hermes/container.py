"""Composition root.

Everything is wired here, in one place, from :class:`Settings`. Services get
their collaborators injected as protocols, so swapping SQLite for something
else — or Telegram for nothing at all — is a change to this file only.
"""

from dataclasses import dataclass

from .config import Settings
from .domain.ports import Clock, EventPublisher, LocationProvider, SystemClock, WeatherProvider
from .domain.services.alarms import AlarmService, default_rules
from .domain.services.ingestion import IngestionService
from .domain.services.nodes import NodeService
from .domain.services.readings import ReadingQueryService
from .domain.services.retention import RetentionService
from .domain.services.weather import WeatherSyncService
from .infrastructure.db.alarm_repository import SqliteAlarmRepository
from .infrastructure.db.database import Database
from .infrastructure.db.reading_repository import SqliteReadingRepository
from .infrastructure.notifications.telegram import NullNotifier, TelegramNotifier
from .infrastructure.realtime.socketio_publisher import NullPublisher


@dataclass(frozen=True, slots=True)
class Services:
    settings: Settings
    database: Database
    clock: Clock
    ingestion: IngestionService
    readings: ReadingQueryService
    alarms: AlarmService
    nodes: NodeService
    retention: RetentionService
    weather: WeatherSyncService


def build_services(
    settings: Settings,
    publisher: EventPublisher | None = None,
    clock: Clock | None = None,
    weather_provider: WeatherProvider | None = None,
) -> Services:
    clock = clock or SystemClock()
    publisher = publisher or NullPublisher()

    database = Database(settings.database_path)
    reading_repository = SqliteReadingRepository(database)
    alarm_repository = SqliteAlarmRepository(database)

    notifier = (
        TelegramNotifier(
            settings.telegram.bot_token,
            settings.telegram.chat_id,
            settings.telegram.cooldown_seconds,
        )
        if settings.telegram.enabled
        else NullNotifier()
    )

    alarms = AlarmService(
        repository=alarm_repository,
        rules=default_rules(
            gas=settings.alarms.gas_threshold,
            aq=settings.alarms.aq_threshold,
            humidity=settings.alarms.humidity_threshold,
        ),
        clock=clock,
        publisher=publisher,
        notifier=notifier,
    )

    nodes = NodeService(
        repository=reading_repository,
        alarms=alarms,
        clock=clock,
        delayed_after_seconds=settings.alarms.node_delayed_after_seconds,
        offline_after_seconds=settings.alarms.node_offline_after_seconds,
        publisher=publisher,
    )

    if weather_provider is None and settings.weather.enabled:
        # Imported lazily so the HTTP client is only touched when enabled.
        from .infrastructure.weather.location import StaticLocation
        from .infrastructure.weather.open_meteo import OpenMeteoWeatherProvider

        location: LocationProvider = StaticLocation(
            settings.weather.latitude, settings.weather.longitude, settings.weather.label
        )
        weather_provider = OpenMeteoWeatherProvider(location)

    return Services(
        settings=settings,
        database=database,
        clock=clock,
        ingestion=IngestionService(reading_repository, alarms, nodes, clock, publisher),
        readings=ReadingQueryService(reading_repository, clock, alarms),
        alarms=alarms,
        nodes=nodes,
        retention=RetentionService(reading_repository, clock, settings.retention_days),
        weather=WeatherSyncService(reading_repository, weather_provider, clock, publisher),
    )
