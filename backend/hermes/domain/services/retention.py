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
        return self._repository.aggregate_and_purge(cutoff)
