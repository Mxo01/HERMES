"""Outdoor conditions.

The dashboard compares every indoor reading against the outdoors, but the BOM
has no outdoor sensor. This service fills the gap by storing observations from
a :class:`~hermes.domain.ports.WeatherProvider` under the synthetic
``outside`` room, so outdoor data flows through exactly the same queries,
charts and downsampling as the real nodes.

It is entirely optional: with no provider configured the room stays empty and
the UI hides the comparison.
"""

import datetime

from .. import catalog
from ..models import Coordinates
from ..ports import Clock, EventPublisher, ReadingRepository, WeatherProvider


class WeatherSyncService:
    def __init__(
        self,
        repository: ReadingRepository,
        provider: WeatherProvider | None,
        clock: Clock,
        publisher: EventPublisher | None = None,
    ) -> None:
        self._repository = repository
        self._provider = provider
        self._clock = clock
        self._publisher = publisher

    @property
    def enabled(self) -> bool:
        return self._provider is not None

    def location(self) -> Coordinates | None:
        """Where outdoor readings are being taken, once resolved."""
        return self._provider.location() if self._provider else None

    def sync_current(self) -> bool:
        """Store the latest outdoor observation. Returns whether one arrived."""
        if self._provider is None:
            return False

        observation = self._provider.current()
        if observation is None:
            return False

        values = observation.metrics()
        if not values:
            return False

        self._repository.insert_many(
            catalog.AIR_QUALITY_DOMAIN, catalog.OUTSIDE, values, observation.observed_at
        )
        if self._publisher is not None:
            self._publisher.publish(
                'sensor_update',
                {
                    'room': catalog.OUTSIDE,
                    'sensor': 'weather',
                    'timestamp': observation.observed_at.isoformat(),
                    **values,
                },
            )
        return True

    def backfill(self, days: int = 7) -> int:
        """Seed hourly outdoor history so charts have a baseline immediately."""
        if self._provider is None:
            return 0

        written = 0
        for observation in self._provider.history(days):
            hour = observation.observed_at.replace(minute=0, second=0, microsecond=0)
            for metric_id, value in observation.metrics().items():
                self._repository.upsert_hourly(
                    catalog.AIR_QUALITY_DOMAIN, catalog.OUTSIDE, metric_id, hour, value, value, value, 1
                )
                written += 1
        return written

    def next_run_at(self, interval_seconds: int) -> datetime.datetime:
        return self._clock.now() + datetime.timedelta(seconds=interval_seconds)
