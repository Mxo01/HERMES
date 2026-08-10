"""The write path: a node posts, everything downstream reacts."""

from typing import Any

from .. import catalog
from ..models import AlarmKind, SensorReading
from ..ports import Clock, EventPublisher, ReadingRepository
from ..validation import parse_reading
from .alarms import AlarmService
from .nodes import NodeService


class IngestionService:
    def __init__(
        self,
        repository: ReadingRepository,
        alarms: AlarmService,
        nodes: NodeService,
        clock: Clock,
        publisher: EventPublisher | None = None,
    ) -> None:
        self._repository = repository
        self._alarms = alarms
        self._nodes = nodes
        self._clock = clock
        self._publisher = publisher

    def ingest(self, payload: Any) -> SensorReading:
        """Validate, persist, broadcast and run the alarm rules over a payload.

        Raises :class:`~hermes.domain.errors.ValidationError` on a bad payload.
        """
        reading = parse_reading(payload, self._clock.now())

        self._repository.insert_many(
            catalog.AIR_QUALITY_DOMAIN, reading.room, reading.values, reading.recorded_at
        )
        self._nodes.record_seen(reading.room, reading.sensor, reading.recorded_at)

        if self._publisher is not None:
            self._publisher.publish(
                'sensor_update',
                {
                    'room': reading.room,
                    'sensor': reading.sensor,
                    'timestamp': reading.recorded_at.isoformat(),
                    **reading.values,
                },
            )

        opened = self._alarms.evaluate(reading)
        if self._publisher is not None and any(alarm.kind is AlarmKind.GAS for alarm in opened):
            # Kept for backwards compatibility with the original dashboard event.
            self._publisher.publish('fire_alert', {'room': reading.room, **reading.values})

        return reading
