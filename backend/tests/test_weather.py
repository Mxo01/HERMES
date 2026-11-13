"""Outdoor conditions: the Open-Meteo adapter and the service that stores them.

The adapter is exercised against a fake HTTP layer rather than the network, so
the tests pin the parsing rules (what counts as a number, which hours are in
the past) without depending on what the sky is doing over Pisa.
"""

import datetime
from collections.abc import Callable

import pytest
import requests

from hermes.config import Settings
from hermes.container import Services, build_services
from hermes.domain.models import Coordinates, WeatherObservation
from hermes.infrastructure.weather import open_meteo
from hermes.infrastructure.weather.location import StaticLocation
from hermes.infrastructure.weather.open_meteo import OpenMeteoWeatherProvider

from .conftest import FrozenClock, RecordingPublisher

PISA = StaticLocation(43.7228, 10.4017, 'Pisa, Italy')


def _hours_from_now(offset: int) -> str:
    """An Open-Meteo timestamp relative to the real clock, in the API's format."""
    moment = datetime.datetime.now(datetime.UTC).replace(minute=0, second=0, microsecond=0)
    return (moment + datetime.timedelta(hours=offset)).strftime('%Y-%m-%dT%H:00')


class FakeResponse:
    """The two methods the adapter uses, and nothing else."""

    def __init__(self, payload: object, status_error: Exception | None = None) -> None:
        self._payload = payload
        self._status_error = status_error

    def raise_for_status(self) -> None:
        if self._status_error is not None:
            raise self._status_error

    def json(self) -> object:
        return self._payload


class NoLocation:
    """A location that never resolves, like a Pi with no coordinates configured."""

    def resolve(self) -> Coordinates | None:
        return None

    def cached(self) -> Coordinates | None:
        return None


def _provider(
    monkeypatch: pytest.MonkeyPatch, respond: Callable[[str], FakeResponse]
) -> OpenMeteoWeatherProvider:
    """An adapter whose HTTP calls go to `respond` instead of Open-Meteo."""
    monkeypatch.setattr(open_meteo.requests, 'get', lambda url, **_: respond(url))
    monkeypatch.setattr(open_meteo.time, 'sleep', lambda _seconds: None)
    return OpenMeteoWeatherProvider(PISA)


def test_current_parses_the_observation_and_the_european_aqi(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def respond(url: str) -> FakeResponse:
        if url == open_meteo.AIR_QUALITY_URL:
            return FakeResponse({'current': {'european_aqi': 35}})
        return FakeResponse(
            {
                'current': {
                    'time': '2026-08-09T14:00',
                    'temperature_2m': 14.4,
                    'relative_humidity_2m': 70,
                }
            }
        )

    testSubject = _provider(monkeypatch, respond)

    observation = testSubject.current()

    assert observation == WeatherObservation(
        observed_at=datetime.datetime(2026, 8, 9, 14, 0, tzinfo=datetime.UTC),
        temperature=14.4,
        humidity=70.0,
        aqi=35.0,
    )


def test_current_without_a_forecast_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    testSubject = _provider(monkeypatch, lambda _url: FakeResponse(None))

    assert testSubject.current() is None


def test_current_falls_back_to_now_when_the_timestamp_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    testSubject = _provider(
        monkeypatch, lambda _url: FakeResponse({'current': {'temperature_2m': 12}})
    )

    observation = testSubject.current()

    assert observation is not None
    assert observation.observed_at.tzinfo is datetime.UTC


def test_history_keeps_past_hours_and_drops_the_forecast(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Open-Meteo returns the next day too; only what already happened is stored."""
    past = _hours_from_now(-2)
    future = _hours_from_now(2)

    def respond(url: str) -> FakeResponse:
        if url == open_meteo.AIR_QUALITY_URL:
            return FakeResponse({'hourly': {'time': [past], 'european_aqi': [40]}})
        return FakeResponse(
            {
                'hourly': {
                    'time': [past, future],
                    'temperature_2m': [13.0, 25.0],
                    'relative_humidity_2m': [71, 55],
                }
            }
        )

    testSubject = _provider(monkeypatch, respond)

    observations = testSubject.history(days=2)

    assert len(observations) == 1
    assert observations[0].temperature == 13.0
    assert observations[0].aqi == 40.0


def test_history_without_a_forecast_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    testSubject = _provider(monkeypatch, lambda _url: FakeResponse(None))

    assert testSubject.history(days=1) == []


@pytest.mark.parametrize(
    'hourly',
    [
        pytest.param(None, id='missing'),
        pytest.param({}, id='empty object'),
        pytest.param({'time': 'not a list'}, id='time is not a list'),
    ],
)
def test_history_tolerates_a_partial_payload(
    monkeypatch: pytest.MonkeyPatch, hourly: object
) -> None:
    def respond(url: str) -> FakeResponse:
        if url == open_meteo.AIR_QUALITY_URL:
            return FakeResponse(None)
        return FakeResponse({'hourly': hourly})

    testSubject = _provider(monkeypatch, respond)

    assert testSubject.history(days=1) == []


def test_a_throttled_request_is_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    forecast_attempts: list[int] = []

    def respond(url: str) -> FakeResponse:
        if url == open_meteo.AIR_QUALITY_URL:
            return FakeResponse({'current': {'european_aqi': 35}})
        forecast_attempts.append(1)
        if len(forecast_attempts) < open_meteo.RETRIES:
            return FakeResponse(None, status_error=requests.HTTPError('503'))
        return FakeResponse({'current': {'temperature_2m': 12}})

    testSubject = _provider(monkeypatch, respond)

    observation = testSubject.current()

    assert observation is not None
    assert len(forecast_attempts) == open_meteo.RETRIES


def test_a_persistent_failure_degrades_to_none(monkeypatch: pytest.MonkeyPatch) -> None:
    def respond(_url: str) -> FakeResponse:
        raise requests.ConnectionError('offline')

    testSubject = _provider(monkeypatch, respond)

    assert testSubject.current() is None


def test_a_payload_that_is_not_an_object_degrades_to_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    testSubject = _provider(monkeypatch, lambda _url: FakeResponse([1, 2, 3]))

    assert testSubject.current() is None


def test_no_location_means_no_request(monkeypatch: pytest.MonkeyPatch) -> None:
    def explode(_url: str, **_: object) -> FakeResponse:
        raise AssertionError('the adapter must not call out without coordinates')

    monkeypatch.setattr(open_meteo.requests, 'get', explode)
    testSubject = OpenMeteoWeatherProvider(NoLocation())

    assert testSubject.current() is None


def test_location_reports_the_configured_coordinates() -> None:
    testSubject = OpenMeteoWeatherProvider(PISA)

    assert testSubject.location() == Coordinates(43.7228, 10.4017, 'Pisa, Italy', 'configured')


class FakeWeatherProvider:
    """A weather provider that answers from memory."""

    def __init__(
        self, current: WeatherObservation | None, history: list[WeatherObservation]
    ) -> None:
        self._current = current
        self._history = history

    def current(self) -> WeatherObservation | None:
        return self._current

    def history(self, days: int) -> list[WeatherObservation]:
        return self._history

    def location(self) -> Coordinates | None:
        return Coordinates(43.7228, 10.4017, 'Pisa, Italy')


def _services(
    settings: Settings,
    clock: FrozenClock,
    publisher: RecordingPublisher,
    provider: FakeWeatherProvider | None,
) -> Services:
    built = build_services(settings, publisher=publisher, clock=clock, weather_provider=provider)
    built.database.migrate()
    return built


def test_sync_current_stores_the_observation_under_the_outdoor_room(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    observation = WeatherObservation(
        observed_at=clock.now(), temperature=14.0, humidity=70.0, aqi=35.0
    )
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(observation, []))

    assert testSubject.weather.sync_current() is True

    stored = testSubject.readings.latest()
    assert set(stored['outside']) == {'temperature', 'humidity', 'aqi'}
    assert stored['outside']['temperature'].value == pytest.approx(14.0)


def test_sync_current_broadcasts_the_outdoor_reading(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    observation = WeatherObservation(observed_at=clock.now(), temperature=14.0)
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(observation, []))

    testSubject.weather.sync_current()

    assert 'sensor_update' in publisher.names()


def test_sync_current_without_an_observation_stores_nothing(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(None, []))

    assert testSubject.weather.sync_current() is False
    assert testSubject.readings.latest() == {}


def test_an_observation_with_no_metrics_stores_nothing(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    empty = WeatherObservation(observed_at=clock.now())
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(empty, []))

    assert testSubject.weather.sync_current() is False


def test_backfill_writes_one_hourly_row_per_metric(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    history = [
        WeatherObservation(observed_at=clock.now().replace(minute=32), temperature=14.0, humidity=70.0)
    ]
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(None, history))

    assert testSubject.weather.backfill(days=1) == 2

    today = clock.now().date()
    points = testSubject.readings.daily('outside', 'temperature', today, today)
    assert len(points) == 1
    assert points[0].count == 1


def test_a_disabled_weather_service_does_nothing(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    testSubject = _services(settings, clock, publisher, None)

    assert testSubject.weather.enabled is False
    assert testSubject.weather.sync_current() is False
    assert testSubject.weather.backfill(days=1) == 0
    assert testSubject.weather.location() is None


def test_the_next_weather_run_is_one_interval_away(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher
) -> None:
    testSubject = _services(settings, clock, publisher, FakeWeatherProvider(None, []))

    assert testSubject.weather.next_run_at(900) == clock.now() + datetime.timedelta(seconds=900)
