"""Small infrastructure guarantees: job scheduling and schema migrations."""

import datetime
import sqlite3
from pathlib import Path

from hermes.domain.models import WeatherObservation
from hermes.infrastructure.db.migrations import MIGRATIONS, apply_migrations
from hermes.infrastructure.jobs.scheduler import JobScheduler, PeriodicJob


def test_a_job_with_no_positive_interval_is_disabled_not_spun() -> None:
    scheduler = JobScheduler()
    scheduler.add(PeriodicJob(name='off', interval_seconds=0, run=lambda: None))
    scheduler.add(PeriodicJob(name='typo', interval_seconds=-5, run=lambda: None))
    scheduler.add(PeriodicJob(name='on', interval_seconds=60, run=lambda: None))

    assert [job.name for job in scheduler._jobs] == ['on']


def test_outdoor_air_quality_is_its_own_metric() -> None:
    observation = WeatherObservation(
        observed_at=datetime.datetime(2026, 8, 9, 14, tzinfo=datetime.UTC), temperature=14.0, humidity=70.0, aqi=35.0
    )

    assert observation.metrics() == {'temperature': 14.0, 'humidity': 70.0, 'aqi': 35.0}


def test_migration_6_moves_outdoor_air_quality_off_the_indoor_id(tmp_path: Path) -> None:
    conn = sqlite3.connect(tmp_path / 'v5.db')
    for version in range(1, 6):
        conn.executescript(MIGRATIONS[version])
    conn.execute('PRAGMA user_version = 5')
    rows = [('air_quality', 'outside', 'aq', 35.0), ('air_quality', 'kitchen', 'aq', 280.0)]
    conn.executemany(
        "INSERT INTO readings (domain, room, metric, value, timestamp) VALUES (?, ?, ?, ?, '2026-08-09 14:00:00')",
        rows,
    )
    conn.executemany(
        'INSERT INTO hourly_aggregates (domain, room, metric, hour, avg_value, min_value, max_value, reading_count) '
        "VALUES (?, ?, ?, '2026-08-01 10:00:00', ?, ?, ?, 1)",
        [(*row, row[3], row[3]) for row in rows],
    )
    conn.commit()

    apply_migrations(conn)

    for table in ('readings', 'hourly_aggregates'):
        metrics = dict(conn.execute(f'SELECT room, metric FROM {table}').fetchall())
        assert metrics == {'outside': 'aqi', 'kitchen': 'aq'}
