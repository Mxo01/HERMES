"""Ports: the interfaces the domain services depend on.

Concrete implementations live in ``hermes.infrastructure``. Services only ever
see these protocols, so storage, transport and notification technology can be
swapped (or faked in tests) without touching business rules.
"""

import datetime
from typing import Any, Protocol

from .models import (
    Alarm,
    AlarmKind,
    Coordinates,
    DailyPoint,
    HourlyPoint,
    MetricPoint,
    NodeStatus,
    Severity,
    WeatherObservation,
)


class Clock(Protocol):
    def now(self) -> datetime.datetime: ...


class ReadingRepository(Protocol):
    def insert_many(
        self,
        domain: str,
        room: str,
        values: dict[str, float],
        recorded_at: datetime.datetime | None = None,
    ) -> None: ...

    def upsert_hourly(
        self,
        domain: str,
        room: str,
        metric: str,
        hour: datetime.datetime,
        avg: float,
        minimum: float,
        maximum: float,
        count: int,
    ) -> None: ...

    def latest(self, domain: str, rooms: tuple[str, ...]) -> dict[str, dict[str, MetricPoint]]: ...

    def hourly(
        self,
        domain: str,
        room: str | None,
        metric: str | None,
        since: datetime.datetime,
        until: datetime.datetime | None = None,
    ) -> list[HourlyPoint]: ...

    def daily(
        self,
        domain: str,
        room: str | None,
        metric: str | None,
        start: datetime.date,
        end: datetime.date,
        offset_minutes: int = 0,
    ) -> list[DailyPoint]: ...

    def aggregate_and_purge(self, cutoff: datetime.datetime) -> dict[str, int]: ...

    def last_seen_per_node(self, domain: str) -> dict[tuple[str, str], datetime.datetime]: ...


class AlarmRepository(Protocol):
    def open(
        self,
        room: str,
        sensor: str | None,
        metric: str | None,
        kind: AlarmKind,
        severity: Severity,
        threshold: float | None,
        value: float | None,
        detail: str,
        started_at: datetime.datetime,
    ) -> Alarm: ...

    def close(self, alarm_id: int, ended_at: datetime.datetime, detail: str | None = None) -> None: ...

    def touch_peak(self, alarm_id: int, value: float) -> None: ...

    def mark_notified(self, alarm_id: int) -> None: ...

    def find_active(
        self, room: str, kind: AlarmKind, metric: str | None, sensor: str | None = None
    ) -> Alarm | None: ...

    def list_active(self) -> list[Alarm]: ...

    def list_since(self, since: datetime.datetime, room: str | None, limit: int) -> list[Alarm]: ...

    def count_since(self, since: datetime.datetime) -> int: ...

    def counts_by_day(self, start: datetime.date, end: datetime.date, room: str | None) -> dict[datetime.date, int]: ...


class EventPublisher(Protocol):
    """Pushes realtime events to connected dashboards."""

    def publish(self, event: str, payload: dict[str, Any]) -> None: ...


class Notifier(Protocol):
    """Out-of-band notification channel (Telegram in production)."""

    def enabled(self) -> bool: ...

    def notify(self, title: str, body: str, key: str) -> bool: ...


class LocationProvider(Protocol):
    """Resolves where the installation is. Implementations cache their answer."""

    def resolve(self) -> Coordinates | None:
        """May perform I/O. Call from background work, never from a request."""
        ...

    def cached(self) -> Coordinates | None:
        """The already-resolved location, if any. Never performs I/O."""
        ...


class WeatherProvider(Protocol):
    def current(self) -> WeatherObservation | None: ...

    def history(self, days: int) -> list[WeatherObservation]: ...

    def location(self) -> Coordinates | None: ...


class SystemClock:
    """Default :class:`Clock`, in UTC."""

    def now(self) -> datetime.datetime:
        return datetime.datetime.now(datetime.UTC)


__all__ = [
    'AlarmRepository',
    'Clock',
    'EventPublisher',
    'LocationProvider',
    'Notifier',
    'ReadingRepository',
    'SystemClock',
    'WeatherProvider',
]
