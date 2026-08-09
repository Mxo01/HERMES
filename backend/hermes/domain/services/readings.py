"""The read path: everything the dashboard charts."""

import datetime

from .. import catalog
from ..errors import ValidationError
from ..models import DailyPoint, HourlyPoint, MetricPoint
from ..ports import Clock, ReadingRepository
from .alarms import AlarmService

MAX_HISTORY_HOURS: int = 24 * 30
MAX_RANGE_DAYS: int = 366


class ReadingQueryService:
    def __init__(
        self,
        repository: ReadingRepository,
        clock: Clock,
        alarms: AlarmService | None = None,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._alarms = alarms

    def latest(self) -> dict[str, dict[str, MetricPoint]]:
        return self._repository.latest(catalog.AIR_QUALITY_DOMAIN, catalog.KNOWN_ROOMS)

    def hourly(self, room: str | None, metric: str | None, hours: int) -> list[HourlyPoint]:
        room = self._check_room(room)
        metric = self._check_metric(metric)
        if not 1 <= hours <= MAX_HISTORY_HOURS:
            raise ValidationError({'hours': f'Must be between 1 and {MAX_HISTORY_HOURS}'})

        since = self._clock.now() - datetime.timedelta(hours=hours)
        return self._repository.hourly(catalog.AIR_QUALITY_DOMAIN, room, metric, since)

    def daily(
        self,
        room: str | None,
        metric: str | None,
        start: datetime.date,
        end: datetime.date,
        offset_minutes: int = 0,
    ) -> list[DailyPoint]:
        """Daily min/avg/max, annotated with alarm counts and data resolution."""
        room = self._check_room(room)
        metric = self._check_metric(metric)
        if end < start:
            raise ValidationError({'from': 'Start date must not be after the end date'})
        if (end - start).days + 1 > MAX_RANGE_DAYS:
            raise ValidationError({'from': f'Range must not exceed {MAX_RANGE_DAYS} days'})
        if abs(offset_minutes) > 14 * 60:
            raise ValidationError({'offset': 'Timezone offset must be within ±14 hours'})

        points = self._repository.daily(
            catalog.AIR_QUALITY_DOMAIN, room, metric, start, end, offset_minutes
        )
        if self._alarms is None:
            return points

        per_day = self._alarms.counts_by_day(start, end, room)
        return [
            DailyPoint(
                room=point.room,
                metric=point.metric,
                day=point.day,
                avg=point.avg,
                min=point.min,
                max=point.max,
                count=point.count,
                resolution=point.resolution,
                alarms=per_day.get(point.day, 0),
            )
            for point in points
        ]

    # ---------------------------------------------------------------- helpers

    def _check_room(self, room: str | None) -> str | None:
        if room is None or room == 'all':
            return None
        if room not in catalog.KNOWN_ROOMS:
            raise ValidationError({'room': f'Unknown room. Must be one of: {", ".join(catalog.KNOWN_ROOMS)}'})
        return room

    def _check_metric(self, metric: str | None) -> str | None:
        if metric is None:
            return None
        if metric not in catalog.METRICS:
            raise ValidationError({'metric': f'Unknown metric. Must be one of: {", ".join(catalog.METRICS)}'})
        return metric
