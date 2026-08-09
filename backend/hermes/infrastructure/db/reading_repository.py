"""SQLite-backed :class:`~hermes.domain.ports.ReadingRepository`.

Raw samples live in ``readings`` for the retention window and are rolled up
into ``hourly_aggregates`` beyond it. Every read merges both tables so callers
never have to know where a given hour came from; where the two overlap the raw
rows win, because they are the finer-grained source.
"""

import datetime
from typing import Any

from ...domain import catalog
from ...domain.models import DailyPoint, HourlyPoint, MetricPoint, Resolution
from .database import Database, from_sql, to_sql, to_sql_hour

#: Which board reports a metric — lets us derive per-node liveness from the
#: metric-shaped ``readings`` table without a redundant column.
_SENSOR_BY_METRIC: dict[str, str] = {
    metric_id: sensor.id for sensor in catalog.SENSORS.values() for metric_id in sensor.metrics
}

_AggregateKey = tuple[str, str, str]


class SqliteReadingRepository:
    def __init__(self, database: Database) -> None:
        self._db = database

    # ----------------------------------------------------------------- write

    def insert_many(
        self,
        domain: str,
        room: str,
        values: dict[str, float],
        recorded_at: datetime.datetime | None = None,
    ) -> None:
        timestamp = to_sql(recorded_at) if recorded_at else to_sql(datetime.datetime.now(datetime.UTC))
        rows = [(domain, room, metric, value, timestamp) for metric, value in values.items()]
        with self._db.connect() as conn:
            conn.executemany(
                'INSERT INTO readings (domain, room, metric, value, timestamp) VALUES (?, ?, ?, ?, ?)',
                rows,
            )

    def upsert_hourly(
        self,
        domain: str,
        room: str,
        metric: str,
        hour: datetime.datetime,
        avg: float,
        minimum: float,
        maximum: float,
        count: int,
    ) -> None:
        with self._db.connect() as conn:
            conn.execute(
                '''
                INSERT INTO hourly_aggregates
                    (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (domain, room, metric, hour) DO UPDATE SET
                    avg_value = excluded.avg_value,
                    min_value = excluded.min_value,
                    max_value = excluded.max_value,
                    reading_count = excluded.reading_count
                ''',
                (domain, room, metric, to_sql_hour(hour), avg, minimum, maximum, count),
            )

    def aggregate_and_purge(self, cutoff: datetime.datetime) -> dict[str, int]:
        """Roll everything older than ``cutoff`` into hourly rows, then drop it."""
        boundary = to_sql(cutoff)
        with self._db.connect() as conn:
            conn.execute(
                '''
                INSERT INTO hourly_aggregates
                    (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
                SELECT domain, room, metric,
                       strftime('%Y-%m-%d %H:00:00', timestamp),
                       AVG(value), MIN(value), MAX(value), COUNT(*)
                FROM readings
                WHERE timestamp < ?
                GROUP BY domain, room, metric, strftime('%Y-%m-%d %H:00:00', timestamp)
                ON CONFLICT (domain, room, metric, hour) DO NOTHING
                ''',
                (boundary,),
            )
            deleted = conn.execute('DELETE FROM readings WHERE timestamp < ?', (boundary,)).rowcount
        return {'deleted_readings': deleted}

    # ------------------------------------------------------------------ read

    def latest(self, domain: str, rooms: tuple[str, ...]) -> dict[str, dict[str, MetricPoint]]:
        placeholders = ','.join('?' * len(rooms))
        with self._db.connect() as conn:
            rows = conn.execute(
                f'''
                SELECT room, metric, value, timestamp
                FROM readings
                WHERE domain = ? AND room IN ({placeholders}) AND id IN (
                    SELECT MAX(id) FROM readings WHERE domain = ? GROUP BY room, metric
                )
                ''',
                (domain, *rooms, domain),
            ).fetchall()

        latest: dict[str, dict[str, MetricPoint]] = {}
        for row in rows:
            timestamp = from_sql(row['timestamp'])
            if timestamp is None:
                continue
            latest.setdefault(row['room'], {})[row['metric']] = MetricPoint(row['value'], timestamp)
        return latest

    def hourly(
        self,
        domain: str,
        room: str | None,
        metric: str | None,
        since: datetime.datetime,
        until: datetime.datetime | None = None,
    ) -> list[HourlyPoint]:
        floor = to_sql_hour(since)
        ceiling = to_sql(until) if until else None
        filters, params = self._filters(room, metric)

        raw_sql = f'''
            SELECT room, metric,
                   strftime('%Y-%m-%d %H:00:00', timestamp) AS bucket,
                   AVG(value) AS avg_value, MIN(value) AS min_value,
                   MAX(value) AS max_value, COUNT(*) AS reading_count
            FROM readings
            WHERE domain = ? AND timestamp >= ?{filters}
              {'AND timestamp <= ?' if ceiling else ''}
            GROUP BY room, metric, bucket
        '''
        rolled_sql = f'''
            SELECT room, metric, hour AS bucket,
                   avg_value, min_value, max_value, reading_count
            FROM hourly_aggregates
            WHERE domain = ? AND hour >= ?{filters}
              {'AND hour <= ?' if ceiling else ''}
        '''
        tail = [ceiling] if ceiling else []
        with self._db.connect() as conn:
            raw = conn.execute(raw_sql, [domain, floor, *params, *tail]).fetchall()
            rolled = conn.execute(rolled_sql, [domain, floor, *params, *tail]).fetchall()

        merged = self._merge(rolled, raw)
        points: list[HourlyPoint] = []
        for (room_id, metric_id, bucket), row in merged.items():
            hour = from_sql(bucket)
            if hour is None:
                continue
            points.append(
                HourlyPoint(
                    room=room_id,
                    metric=metric_id,
                    hour=hour,
                    avg=row['avg_value'],
                    min=row['min_value'],
                    max=row['max_value'],
                    count=row['reading_count'],
                )
            )
        points.sort(key=lambda point: (point.hour, point.room, point.metric))
        return points

    def daily(
        self,
        domain: str,
        room: str | None,
        metric: str | None,
        start: datetime.date,
        end: datetime.date,
        offset_minutes: int = 0,
    ) -> list[DailyPoint]:
        """Daily summaries between ``start`` and ``end`` inclusive.

        ``offset_minutes`` shifts the day boundary so rows line up with the
        viewer's local midnight rather than UTC's.
        """
        shift = f'{offset_minutes:+d} minutes'
        first = start.isoformat()
        last = end.isoformat()
        filters, params = self._filters(room, metric)

        raw_sql = f'''
            SELECT room, metric,
                   date(timestamp, ?) AS bucket,
                   AVG(value) AS avg_value, MIN(value) AS min_value,
                   MAX(value) AS max_value, COUNT(*) AS reading_count
            FROM readings
            WHERE domain = ? AND date(timestamp, ?) BETWEEN ? AND ?{filters}
            GROUP BY room, metric, bucket
        '''
        rolled_sql = f'''
            SELECT room, metric,
                   date(hour, ?) AS bucket,
                   SUM(avg_value * reading_count) / SUM(reading_count) AS avg_value,
                   MIN(min_value) AS min_value, MAX(max_value) AS max_value,
                   SUM(reading_count) AS reading_count
            FROM hourly_aggregates
            WHERE domain = ? AND date(hour, ?) BETWEEN ? AND ?{filters}
            GROUP BY room, metric, bucket
        '''
        args = [shift, domain, shift, first, last, *params]
        with self._db.connect() as conn:
            raw = conn.execute(raw_sql, args).fetchall()
            rolled = conn.execute(rolled_sql, args).fetchall()

        raw_keys = {(row['room'], row['metric'], row['bucket']) for row in raw}
        merged = self._merge(rolled, raw)

        points: list[DailyPoint] = []
        for key, row in merged.items():
            room_id, metric_id, bucket = key
            try:
                day = datetime.date.fromisoformat(bucket)
            except ValueError:
                continue
            points.append(
                DailyPoint(
                    room=room_id,
                    metric=metric_id,
                    day=day,
                    avg=row['avg_value'],
                    min=row['min_value'],
                    max=row['max_value'],
                    count=row['reading_count'],
                    resolution=Resolution.RAW if key in raw_keys else Resolution.HOURLY,
                )
            )
        points.sort(key=lambda point: (point.day, point.room, point.metric))
        return points

    def last_seen_per_node(self, domain: str) -> dict[tuple[str, str], datetime.datetime]:
        with self._db.connect() as conn:
            rows = conn.execute(
                '''
                SELECT room, metric, MAX(timestamp) AS last_seen
                FROM readings
                WHERE domain = ?
                GROUP BY room, metric
                ''',
                (domain,),
            ).fetchall()

        last_seen: dict[tuple[str, str], datetime.datetime] = {}
        for row in rows:
            sensor = _SENSOR_BY_METRIC.get(row['metric'])
            seen_at = from_sql(row['last_seen'])
            if sensor is None or seen_at is None:
                continue
            key = (row['room'], sensor)
            if seen_at > last_seen.get(key, seen_at - datetime.timedelta(seconds=1)):
                last_seen[key] = seen_at
        return last_seen

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _filters(room: str | None, metric: str | None) -> tuple[str, list[Any]]:
        clauses = ''
        params: list[Any] = []
        if room:
            clauses += ' AND room = ?'
            params.append(room)
        if metric:
            clauses += ' AND metric = ?'
            params.append(metric)
        return clauses, params

    @staticmethod
    def _merge(rolled: list[Any], raw: list[Any]) -> dict[_AggregateKey, dict[str, Any]]:
        """Overlay raw buckets on rolled-up ones, keyed by room/metric/bucket."""
        merged: dict[_AggregateKey, dict[str, Any]] = {}
        for source in (rolled, raw):
            for row in source:
                merged[(row['room'], row['metric'], row['bucket'])] = {
                    'avg_value': row['avg_value'],
                    'min_value': row['min_value'],
                    'max_value': row['max_value'],
                    'reading_count': row['reading_count'],
                }
        return merged
