"""Outdoor conditions from Open-Meteo.

Two endpoints are combined: the forecast API for temperature and humidity, the
air-quality API for the European AQI. Any failure degrades to ``None`` —
outdoor data is a nice-to-have, never a reason to fail a request.
"""

import datetime
import logging
import time
from typing import Any

import requests

from ...domain.models import Coordinates, WeatherObservation
from ...domain.ports import LocationProvider

logger = logging.getLogger(__name__)

FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

RETRIES = 3
RETRY_BACKOFF_SECONDS = 1.5


class OpenMeteoWeatherProvider:
    """Open-Meteo is keyless and free for non-commercial use, which suits a Pi."""

    def __init__(self, location: LocationProvider, timeout_seconds: float = 8.0) -> None:
        self._location = location
        self._timeout = timeout_seconds

    # ---------------------------------------------------------------- public

    def location(self) -> Coordinates | None:
        """What the API reports — cached only, so a request never blocks on DNS."""
        return self._location.cached()

    def current(self) -> WeatherObservation | None:
        forecast = self._get(
            FORECAST_URL,
            {'current': 'temperature_2m,relative_humidity_2m', 'timezone': 'UTC'},
        )
        if forecast is None:
            return None

        current = forecast.get('current') or {}
        observed_at = _parse_time(current.get('time')) or datetime.datetime.now(datetime.UTC)

        air = self._get(AIR_QUALITY_URL, {'current': 'european_aqi', 'timezone': 'UTC'})
        aqi = (air or {}).get('current', {}).get('european_aqi')

        return WeatherObservation(
            observed_at=observed_at,
            temperature=_as_float(current.get('temperature_2m')),
            humidity=_as_float(current.get('relative_humidity_2m')),
            aq=_as_float(aqi),
        )

    def history(self, days: int) -> list[WeatherObservation]:
        forecast = self._get(
            FORECAST_URL,
            {
                'hourly': 'temperature_2m,relative_humidity_2m',
                'past_days': str(min(max(days, 1), 92)),
                'forecast_days': '1',
                'timezone': 'UTC',
            },
        )
        if forecast is None:
            return []

        air = self._get(
            AIR_QUALITY_URL,
            {
                'hourly': 'european_aqi',
                'past_days': str(min(max(days, 1), 92)),
                'forecast_days': '1',
                'timezone': 'UTC',
            },
        )
        aq_by_time = _index_hourly(air, 'european_aqi')

        hourly = forecast.get('hourly') or {}
        times: list[str] = hourly.get('time') or []
        temperatures: list[Any] = hourly.get('temperature_2m') or []
        humidities: list[Any] = hourly.get('relative_humidity_2m') or []

        now = datetime.datetime.now(datetime.UTC)
        observations: list[WeatherObservation] = []
        for index, stamp in enumerate(times):
            observed_at = _parse_time(stamp)
            if observed_at is None or observed_at > now:
                continue
            observations.append(
                WeatherObservation(
                    observed_at=observed_at,
                    temperature=_as_float(_at(temperatures, index)),
                    humidity=_as_float(_at(humidities, index)),
                    aq=_as_float(aq_by_time.get(stamp)),
                )
            )
        return observations

    # --------------------------------------------------------------- private

    def _get(self, url: str, params: dict[str, str]) -> dict[str, Any] | None:
        coordinates = self._location.resolve()
        if coordinates is None:
            return None

        query: dict[str, str] = {
            'latitude': str(coordinates.latitude),
            'longitude': str(coordinates.longitude),
            **params,
        }

        # The public endpoint throttles with a 503 under bursts, so a couple of
        # spaced retries turn a transient refusal into a successful poll.
        for attempt in range(RETRIES):
            try:
                response = requests.get(url, params=query, timeout=self._timeout)
                response.raise_for_status()
                payload = response.json()
            except (requests.RequestException, ValueError) as exc:
                last = attempt == RETRIES - 1
                logger.log(
                    logging.WARNING if last else logging.DEBUG,
                    'Open-Meteo request to %s failed (attempt %d/%d): %s',
                    url,
                    attempt + 1,
                    RETRIES,
                    exc,
                )
                if last:
                    return None
                time.sleep(RETRY_BACKOFF_SECONDS * (attempt + 1))
                continue

            return payload if isinstance(payload, dict) else None

        return None


def _index_hourly(payload: dict[str, Any] | None, key: str) -> dict[str, Any]:
    hourly = (payload or {}).get('hourly') or {}
    times = hourly.get('time') or []
    values = hourly.get(key) or []
    return {stamp: _at(values, index) for index, stamp in enumerate(times)}


def _at(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _as_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _parse_time(value: Any) -> datetime.datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.datetime.fromisoformat(value).replace(tzinfo=datetime.UTC)
    except ValueError:
        return None
