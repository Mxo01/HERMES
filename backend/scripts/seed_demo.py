"""Fill a database with plausible readings so the dashboard has something to draw.

    python scripts/seed_demo.py [--db hermes-demo.db] [--days 21]

Writes to a separate file by default so a real installation's data is never
touched. Point the server at it with ``DATABASE_PATH=hermes-demo.db``.
"""

import argparse
import datetime
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hermes.domain import catalog  # noqa: E402
from hermes.domain.models import AlarmKind, Severity  # noqa: E402
from hermes.infrastructure.db.alarm_repository import SqliteAlarmRepository  # noqa: E402
from hermes.infrastructure.db.database import Database  # noqa: E402
from hermes.infrastructure.db.reading_repository import SqliteReadingRepository  # noqa: E402

DOMAIN = catalog.AIR_QUALITY_DOMAIN
DEFAULT_DB = 'hermes-demo.db'

#: room -> metric -> (daily mean, daily swing, noise)
PROFILE: dict[str, dict[str, tuple[float, float, float]]] = {
    'kitchen': {
        'temperature': (21.4, 1.8, 0.35),
        'humidity': (54.0, 7.0, 1.6),
        'aq': (62.0, 38.0, 9.0),
        'gas': (38.0, 9.0, 4.0),
    },
    'bedroom': {
        'temperature': (20.1, 1.2, 0.3),
        'humidity': (58.0, 5.0, 1.4),
        'aq': (41.0, 14.0, 5.0),
    },
    'outside': {
        'temperature': (14.2, 5.4, 0.8),
        'humidity': (71.0, 11.0, 2.5),
        'aq': (38.0, 9.0, 3.0),
    },
}

#: Metrics peak at different times of day.
PHASE: dict[str, float] = {'temperature': 15.0, 'humidity': 4.0, 'aq': 20.0, 'gas': 19.0}


def value_at(metric: str, hour_of_day: float, day: int, spec: tuple[float, float, float]) -> float:
    mean, swing, noise = spec
    daily = math.sin((hour_of_day - PHASE[metric]) / 24 * 2 * math.pi)
    drift = math.sin(day / 9.0) * swing * 0.3
    return mean + daily * swing + drift + random.gauss(0, noise)


def clear(database: Database) -> None:
    """Empty the tables this script writes, leaving the schema in place."""
    with database.connect() as conn:
        for table in ('readings', 'hourly_aggregates', 'alarms'):
            conn.execute(f'DELETE FROM {table}')


def has_data(database: Database) -> bool:
    with database.connect() as conn:
        return conn.execute('SELECT EXISTS (SELECT 1 FROM readings)').fetchone()[0] == 1


def seed(db_path: str, days: int, step_minutes: int, append: bool = False) -> None:
    database = Database(db_path)
    database.migrate()

    if not append:
        # A partial run leaves alarms open, and an open alarm collides with the
        # one this script inserts for the same room and sensor. Seeding is
        # meant to produce one coherent 21-day story, so start from empty.
        clear(database)

    readings = SqliteReadingRepository(database)
    alarms = SqliteAlarmRepository(database)

    now = datetime.datetime.now(datetime.UTC)
    start = now.replace(minute=0, second=0, microsecond=0) - datetime.timedelta(days=days)
    steps = int(days * 24 * 60 / step_minutes)

    # The final sample lands on the real current time so the node watchdog sees
    # the demo installation as live rather than long-since offline.
    moments = [start + datetime.timedelta(minutes=index * step_minutes) for index in range(steps + 1)]
    moments = [moment for moment in moments if moment < now] + [now]

    print(f'seeding {db_path}: {days} days, one sample every {step_minutes} min')
    for moment in moments:
        hour_of_day = moment.hour + moment.minute / 60
        day = (moment - start).days

        for room, metrics in PROFILE.items():
            values = {
                metric: round(value_at(metric, hour_of_day, day, spec), 2)
                for metric, spec in metrics.items()
            }
            readings.insert_many(DOMAIN, room, values, moment)

    _seed_alarms(alarms, now)
    print(f'done: readings through {now:%Y-%m-%d %H:%M} UTC')


def _seed_alarms(repository: SqliteAlarmRepository, now: datetime.datetime) -> None:
    events = [
        (3, 19.7, AlarmKind.GAS, Severity.HIGH, 'kitchen', 'mq2', 'gas', 150.0, 168.0,
         'peak 168 over threshold 150', 252, True),
        (5, 20.2, AlarmKind.AIR_QUALITY, Severity.MEDIUM, 'kitchen', 'mq135', 'aq', 300.0, 312.0,
         'sustained 312 for 22 min', 1323, False),
        (6, 2.9, AlarmKind.HUMIDITY, Severity.MEDIUM, 'bedroom', 'mq135', 'humidity', 70.0, 78.0,
         'above 70% overnight', 18040, False),
        (7, 8.05, AlarmKind.NODE, Severity.LOW, 'bedroom', 'mq135', None, None, None,
         'reconnected after 8 min offline', 491, False),
        (11, 13.1, AlarmKind.GAS, Severity.HIGH, 'kitchen', 'mq2', 'gas', 150.0, 204.0,
         'peak 204 · telegram alert sent', 108, True),
    ]

    for days_ago, hour, kind, severity, room, sensor, metric, threshold, peak, detail, duration, notified in events:
        started = (now - datetime.timedelta(days=days_ago)).replace(
            hour=int(hour), minute=int((hour % 1) * 60)
        )
        alarm = repository.open(
            room=room,
            sensor=sensor,
            metric=metric,
            kind=kind,
            severity=severity,
            threshold=threshold,
            value=peak,
            detail=detail,
            started_at=started,
        )
        repository.close(alarm.id, started + datetime.timedelta(seconds=duration))
        if notified:
            repository.mark_notified(alarm.id)

    print(f'seeded {len(events)} alarms')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default=DEFAULT_DB, help='database file to write')
    parser.add_argument('--days', type=int, default=21, help='how much history to generate')
    parser.add_argument('--step', type=int, default=30, help='minutes between samples')
    parser.add_argument('--seed', type=int, default=7, help='RNG seed, for reproducible data')
    parser.add_argument(
        '--append', action='store_true', help='add to existing data instead of replacing it'
    )
    parser.add_argument(
        '--force', action='store_true', help='allow replacing data in a database other than the default'
    )
    args = parser.parse_args()

    # Guard against `--db domotic.db` quietly wiping a real installation.
    if not args.append and args.db != DEFAULT_DB and not args.force:
        database = Database(args.db)
        database.migrate()
        if has_data(database):
            parser.error(
                f'{args.db} already contains readings. Re-run with --append to add to them, '
                f'or --force to replace them.'
            )

    random.seed(args.seed)
    seed(args.db, args.days, args.step, append=args.append)


if __name__ == '__main__':
    main()
