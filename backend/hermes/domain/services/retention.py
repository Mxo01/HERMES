"""Downsampling: keep raw samples for a window, hourly averages forever.

At 30s per node the raw table grows by ~8.6k rows a day. Rolling anything past
the retention window into hourly rows keeps the SQLite file small enough for a
Pi Zero while preserving the long-term trend the history view draws.
"""

import datetime

from ..ports import Clock, ReadingRepository


class RetentionService:
    def __init__(self, repository: ReadingRepository, clock: Clock, keep_days: int = 7) -> None:
        self._repository = repository
        self._clock = clock
        self._keep_days = keep_days

    @property
    def keep_days(self) -> int:
        return self._keep_days

    def downsample(self, keep_days: int | None = None) -> dict[str, int]:
        days = self._keep_days if keep_days is None else keep_days
        cutoff = self._clock.now() - datetime.timedelta(days=days)

        # Truncate to the top of the hour so only whole hours are ever rolled
        # up. A cutoff falling mid-hour writes an aggregate covering just the
        # first part of it; the next run cannot extend that row — the insert
        # conflicts and is skipped — yet it still deletes the remaining raw
        # samples, losing them for good.
        return self._repository.aggregate_and_purge(
            cutoff.replace(minute=0, second=0, microsecond=0)
        )
