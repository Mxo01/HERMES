"""Static description of the physical installation.

This module is the single source of truth for which rooms, sensors and metrics
exist. It is pure data: no I/O, no framework imports. Everything else in the
domain layer validates against it.
"""

from dataclasses import dataclass

GAS: str = 'gas'
TEMPERATURE: str = 'temperature'
HUMIDITY: str = 'humidity'
AIR_QUALITY: str = 'aq'

KITCHEN: str = 'kitchen'
BEDROOM: str = 'bedroom'
OUTSIDE: str = 'outside'

AIR_QUALITY_DOMAIN: str = 'air_quality'


@dataclass(frozen=True, slots=True)
class MetricSpec:
    """A measurable quantity and the bounds a plausible reading falls into."""

    id: str
    label: str
    unit: str
    decimals: int
    valid_min: float
    valid_max: float
    display_min: float
    display_max: float


METRICS: dict[str, MetricSpec] = {
    GAS: MetricSpec(GAS, 'Gas', '', 0, 0.0, 1023.0, 0.0, 1023.0),
    TEMPERATURE: MetricSpec(TEMPERATURE, 'Temperature', '°C', 1, -40.0, 60.0, 5.0, 35.0),
    HUMIDITY: MetricSpec(HUMIDITY, 'Humidity', '%', 0, 0.0, 100.0, 10.0, 95.0),
    AIR_QUALITY: MetricSpec(AIR_QUALITY, 'Air quality', '', 0, 0.0, 1023.0, 0.0, 500.0),
}


@dataclass(frozen=True, slots=True)
class SensorSpec:
    """A sensor board and the metrics one of its payloads must carry."""

    id: str
    label: str
    metrics: tuple[str, ...]


SENSORS: dict[str, SensorSpec] = {
    'mq2': SensorSpec('mq2', 'MQ-2', (GAS,)),
    'mq135': SensorSpec('mq135', 'DHT22 + MQ-135', (TEMPERATURE, HUMIDITY, AIR_QUALITY)),
}


@dataclass(frozen=True, slots=True)
class NodeSpec:
    """One ESP8266 board: identified by the room it sits in and its sensor."""

    room: str
    sensor: str
    label: str


NODES: tuple[NodeSpec, ...] = (
    NodeSpec(KITCHEN, 'mq2', 'Node A'),
    NodeSpec(KITCHEN, 'mq135', 'Node B'),
    NodeSpec(BEDROOM, 'mq135', 'Node C'),
)

#: Rooms a physical node is allowed to report for.
SENSOR_ROOMS: frozenset[str] = frozenset({KITCHEN, BEDROOM})

#: Every room the API may return, including the synthetic outdoor one that is
#: filled in by the weather provider rather than by a node.
KNOWN_ROOMS: tuple[str, ...] = (KITCHEN, BEDROOM, OUTSIDE)


def metric(metric_id: str) -> MetricSpec:
    return METRICS[metric_id]


def node_for(room: str, sensor: str) -> NodeSpec | None:
    for node in NODES:
        if node.room == room and node.sensor == sensor:
            return node
    return None
