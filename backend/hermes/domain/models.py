"""Domain entities.

Plain dataclasses shared by services, repositories and the API serializers.
They carry no persistence or transport concerns.
"""

import datetime
from dataclasses import dataclass
from enum import StrEnum


@dataclass(frozen=True, slots=True)
class SensorReading:
    """One validated payload from a node: several metrics measured together."""

    room: str
    sensor: str
    values: dict[str, float]
    recorded_at: datetime.datetime

    def get(self, metric: str) -> float | None:
        return self.values.get(metric)


@dataclass(frozen=True, slots=True)
class MetricPoint:
    """The most recent value of a single metric."""

    value: float
    timestamp: datetime.datetime


@dataclass(frozen=True, slots=True)
class HourlyPoint:
    """A metric averaged over one clock hour."""

    room: str
    metric: str
    hour: datetime.datetime
    avg: float
    min: float
    max: float
    count: int


class Resolution(StrEnum):
    """Where a day's numbers came from, given the 7-day raw retention."""

    RAW = 'raw'
    HOURLY = 'hourly'


@dataclass(frozen=True, slots=True)
class DailyPoint:
    """A metric summarised over one calendar day."""

    room: str
    metric: str
    day: datetime.date
    avg: float
    min: float
    max: float
    count: int
    resolution: Resolution
    alarms: int = 0


class Severity(StrEnum):
    HIGH = 'high'
    MEDIUM = 'medium'
    LOW = 'low'


class AlarmKind(StrEnum):
    GAS = 'gas'
    AIR_QUALITY = 'air_quality'
    HUMIDITY = 'humidity'
    NODE = 'node'


@dataclass(frozen=True, slots=True)
class Alarm:
    """A threshold breach, open while the condition still holds."""

    id: int
    room: str
    sensor: str | None
    metric: str | None
    kind: AlarmKind
    severity: Severity
    threshold: float | None
    peak_value: float | None
    started_at: datetime.datetime
    ended_at: datetime.datetime | None
    notified: bool
    detail: str

    @property
    def active(self) -> bool:
        return self.ended_at is None

    def duration_seconds(self, now: datetime.datetime) -> int:
        end = self.ended_at or now
        return max(0, int((end - self.started_at).total_seconds()))


class NodeState(StrEnum):
    ONLINE = 'online'
    DELAYED = 'delayed'
    OFFLINE = 'offline'
    UNKNOWN = 'unknown'


@dataclass(frozen=True, slots=True)
class NodeStatus:
    """Liveness of one board, derived from when it last posted."""

    room: str
    sensor: str
    label: str
    state: NodeState
    last_seen: datetime.datetime | None
    seconds_since: int | None


@dataclass(frozen=True, slots=True)
class Coordinates:
    """Where the installation is, for looking up outdoor conditions."""

    latitude: float
    longitude: float
    #: Human-readable place name, when the source provides one.
    label: str | None = None
    #: How the coordinates were obtained, for the meta endpoint and logs.
    source: str = 'configured'


@dataclass(frozen=True, slots=True)
class WeatherObservation:
    """Outdoor conditions at a point in time."""

    observed_at: datetime.datetime
    temperature: float | None = None
    humidity: float | None = None
    aq: float | None = None

    def metrics(self) -> dict[str, float]:
        return {
            key: value
            for key, value in (
                ('temperature', self.temperature),
                ('humidity', self.humidity),
                ('aq', self.aq),
            )
            if value is not None
        }


