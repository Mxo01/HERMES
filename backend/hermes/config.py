"""Configuration, resolved once from the environment at startup."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


def load_env_file(path: str = '.env') -> None:
    """Load ``KEY=value`` pairs from a dotenv file without overriding real env vars."""
    env_path = Path(path)
    if not env_path.is_file():
        return

    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True, slots=True)
class TelegramSettings:
    bot_token: str | None
    chat_id: str | None
    cooldown_seconds: int

    @property
    def enabled(self) -> bool:
        return bool(self.bot_token and self.chat_id)


@dataclass(frozen=True, slots=True)
class AlarmSettings:
    gas_threshold: float
    aq_threshold: float
    humidity_threshold: float
    node_delayed_after_seconds: int
    node_offline_after_seconds: int
    watchdog_interval_seconds: int


#: Where a release places the compiled dashboard, relative to the backend.
DEFAULT_FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / 'frontend' / 'dist'

#: The installation's location. Outdoor readings are always taken here.
PISA_LATITUDE: float = 43.7228
PISA_LONGITUDE: float = 10.4017
PISA_LABEL: str = 'Pisa, Italy'


@dataclass(frozen=True, slots=True)
class WeatherSettings:
    latitude: float
    longitude: float
    label: str
    refresh_seconds: int
    enabled: bool


@dataclass(frozen=True, slots=True)
class Settings:
    database_path: str
    secret_key: str
    host: str
    port: int
    debug: bool
    cors_origins: str
    max_content_length: int
    #: Directory holding the compiled dashboard. Empty disables SPA serving.
    frontend_dist: str
    #: Shared secret the ESP8266 nodes must present. Empty leaves ingest open.
    ingest_token: str | None
    retention_days: int
    downsampling_interval_seconds: int
    telegram: TelegramSettings
    alarms: AlarmSettings
    weather: WeatherSettings

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> 'Settings':
        source = env if env is not None else os.environ

        return cls(
            database_path=source.get('DATABASE_PATH', 'domotic.db'),
            secret_key=source.get('SECRET_KEY', 'hermes-secret-key'),
            host=source.get('HOST', '0.0.0.0'),
            port=_int(source, 'PORT', 5001),
            debug=_bool(source, 'DEBUG', False),
            # Same-origin in production: Flask serves the dashboard itself, so
            # only a separate dev server needs cross-origin access.
            cors_origins=source.get('CORS_ORIGINS', ''),
            max_content_length=_int(source, 'MAX_CONTENT_LENGTH', 1024),
            frontend_dist=source.get('FRONTEND_DIST', str(DEFAULT_FRONTEND_DIST)),
            ingest_token=source.get('INGEST_TOKEN') or None,
            retention_days=_int(source, 'DOWNSAMPLING_KEEP_DAYS', 7),
            downsampling_interval_seconds=_int(source, 'DOWNSAMPLING_INTERVAL', 3600),
            telegram=TelegramSettings(
                bot_token=source.get('TELEGRAM_BOT_TOKEN') or None,
                chat_id=source.get('TELEGRAM_CHAT_ID') or None,
                cooldown_seconds=_int(source, 'GAS_ALERT_COOLDOWN', 60),
            ),
            alarms=AlarmSettings(
                gas_threshold=_float(source, 'GAS_ALERT_THRESHOLD', 150.0),
                aq_threshold=_float(source, 'AQ_ALERT_THRESHOLD', 300.0),
                humidity_threshold=_float(source, 'HUMIDITY_ALERT_THRESHOLD', 70.0),
                node_delayed_after_seconds=_int(source, 'NODE_DELAYED_AFTER', 90),
                node_offline_after_seconds=_int(source, 'NODE_OFFLINE_AFTER', 300),
                watchdog_interval_seconds=_int(source, 'NODE_WATCHDOG_INTERVAL', 60),
            ),
            weather=WeatherSettings(
                latitude=_float(source, 'HERMES_LATITUDE', PISA_LATITUDE),
                longitude=_float(source, 'HERMES_LONGITUDE', PISA_LONGITUDE),
                label=source.get('HERMES_LOCATION_LABEL') or PISA_LABEL,
                refresh_seconds=_int(source, 'WEATHER_REFRESH_INTERVAL', 900),
                enabled=_bool(source, 'WEATHER_ENABLED', True),
            ),
        )


def _int(source: Mapping[str, str], key: str, default: int) -> int:
    try:
        return int(source[key])
    except (KeyError, TypeError, ValueError):
        return default


def _float(source: Mapping[str, str], key: str, default: float) -> float:
    try:
        return float(source[key])
    except (KeyError, TypeError, ValueError):
        return default


def _bool(source: Mapping[str, str], key: str, default: bool) -> bool:
    raw = source.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}
