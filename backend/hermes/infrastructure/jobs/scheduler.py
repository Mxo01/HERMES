"""A tiny periodic-job runner.

The Pi Zero runs one process, so background maintenance (downsampling, the node
watchdog, weather polling) lives in daemon threads rather than a broker. Each
job owns its own thread and swallows its own errors, so a failing job never
takes the others — or the web server — down with it.
"""

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class PeriodicJob:
    name: str
    interval_seconds: int
    run: Callable[[], object]
    #: Run once at startup before entering the interval loop.
    run_on_start: bool = True


class JobScheduler:
    def __init__(self) -> None:
        self._jobs: list[PeriodicJob] = []
        self._threads: list[threading.Thread] = []
        self._stop = threading.Event()
        self._started = False

    def add(self, job: PeriodicJob) -> None:
        self._jobs.append(job)

    def start(self) -> None:
        if self._started:
            return
        self._started = True

        for job in self._jobs:
            thread = threading.Thread(target=self._loop, args=(job,), daemon=True, name=job.name)
            thread.start()
            self._threads.append(thread)

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=timeout)

    def _loop(self, job: PeriodicJob) -> None:
        if not job.run_on_start:
            self._stop.wait(job.interval_seconds)

        while not self._stop.is_set():
            try:
                result = job.run()
                logger.info('job %s completed: %s', job.name, result)
            except Exception:  # noqa: BLE001 - a job must never kill its thread
                logger.exception('job %s failed', job.name)
            self._stop.wait(job.interval_seconds)
