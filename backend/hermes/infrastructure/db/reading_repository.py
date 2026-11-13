"""SQLite-backed :class:`~hermes.domain.ports.ReadingRepository`.

Raw samples live in ``readings`` for the retention window and are rolled up
into ``hourly_aggregates`` beyond it. Every read merges both tables so callers
never have to know where a given hour came from; where the two overlap the raw
rows win, because they are the finer-grained source.
"""

import datetime
import sqlite3
from typing import TypedDict

from ...domain import catalog
from ...domain.models import DailyPoint, HourlyPoint, MetricPoint, Resolution
from .database import Database, SqlValue, fetch_rows, from_sql, local_days, to_sql, to_sql_hour

#: Which board reports a metric — lets us derive per-node liveness from the
#: metric-shaped ``readings`` table without a redundant column.
_SENSOR_BY_METRIC: dict[str, str] = {
    metric_id: sensor.id for sensor in catalog.SENSORS.values() for metric_id in sensor.metrics
}

_AggregateKey = tuple[str, str, str]


class _Aggregate(TypedDict):
    """One hour bucket as SQL returns it: the four numbers the rollup keeps."""

    avg_value: float | None
    min_value: float | None
    max_value: float | None
    reading_count: int | None


class _Hour(TypedDict):
    """An hour bucket placed on its local day, before the days are folded."""

    day: datetime.date
    raw: bool
    avg: float
    min: float
    max: float
    count: int


class _Day(TypedDict):
    """Running totals for one local day while the hours are folded in."""

    weighted: float
    count: int
    min: float
    max: float
    raw: bool


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
            found = fetch_rows(
                conn,
                f'''
                SELECT room, metric, value, timestamp
                FROM readings
                WHERE domain = ? AND room IN ({placeholders}) AND id IN (
                    SELECT MAX(id) FROM readings WHERE domain = ? GROUP BY room, metric
                )
                ''',
                (domain, *rooms, domain),
            )

        latest: dict[str, dict[str, MetricPoint]] = {}
        for item in found:
            timestamp = from_sql(item['timestamp'])
            if timestamp is None:
                continue
            latest.setdefault(item['room'], {})[item['metric']] = MetricPoint(
                item['value'], timestamp
            )
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
            raw = fetch_rows(conn, raw_sql, [domain, floor, *params, *tail])
            rolled = fetch_rows(conn, rolled_sql, [domain, floor, *params, *tail])

        merged = self._merge(rolled, raw)
        points: list[HourlyPoint] = []
        for (room_id, metric_id, bucket), aggregate in merged.items():
            hour = from_sql(bucket)
            # The aggregate columns are nullable in SQLite, and `_days_from_hours`
            # already skips a bucket whose average is missing; an hour with no
            # numbers is not a data point.
            average = aggregate['avg_value']
            minimum = aggregate['min_value']
            maximum = aggregate['max_value']
            count = aggregate['reading_count']
            if (
                hour is None
                or average is None
                or minimum is None
                or maximum is None
                or count is None
            ):
                continue
            points.append(
                HourlyPoint(
                    room=room_id,
                    metric=metric_id,
                    hour=hour,
                    avg=average,
                    min=minimum,
                    max=maximum,
                    count=count,
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
        tz: datetime.tzinfo = datetime.UTC,
    ) -> list[DailyPoint]:
        """Daily summaries between ``start`` and ``end`` inclusive.

        Built up from hour buckets rather than from two independent day-level
        queries. A day sitting at the retention boundary has some hours already
        rolled up and some still raw; summarising each table separately and
        letting one win would report only that half of the day. Resolving the
        overlap per hour instead means each hour is counted exactly once, so
        the outdoor room — whose backfill deliberately covers hours it also has
        raw samples for — is not double counted either.

        ``tz`` is the viewer's zone. Hours are bucketed in UTC and each one is
        then assigned to the local day it starts in, so every day — including
        those either side of a DST change — breaks at the viewer's midnight. A
        fixed offset cannot do that: it is right for half the range at best.
        """
        first, after = local_days(start, end, tz)
        # Whole UTC hours covering the window; zones whose offset is not a
        # whole hour get their boundary hour assigned to the day it starts in.
        floor = to_sql_hour(first)
        ceiling = to_sql_hour(after + datetime.timedelta(minutes=59, seconds=59))
        filters, params = self._filters(room, metric)

        raw_sql = f'''
            SELECT room, metric,
                   strftime('%Y-%m-%d %H:00:00', timestamp) AS bucket,
                   AVG(value) AS avg_value, MIN(value) AS min_value,
                   MAX(value) AS max_value, COUNT(*) AS reading_count
            FROM readings
            WHERE domain = ? AND timestamp >= ? AND timestamp < ?{filters}
            GROUP BY room, metric, bucket
        '''
        rolled_sql = f'''
            SELECT room, metric, hour AS bucket,
                   avg_value, min_value, max_value, reading_count
            FROM hourly_aggregates
            WHERE domain = ? AND hour >= ? AND hour < ?{filters}
        '''
        args = [domain, floor, ceiling, *params]
        with self._db.connect() as conn:
            raw = fetch_rows(conn, raw_sql, args)
            rolled = fetch_rows(conn, rolled_sql, args)

        return self._days_from_hours(rolled, raw, start, end, tz)

    @staticmethod
    def _days_from_hours(
        rolled: list[sqlite3.Row],
        raw: list[sqlite3.Row],
        start: datetime.date,
        end: datetime.date,
        tz: datetime.tzinfo,
    ) -> list[DailyPoint]:
        """Fold hour buckets into local days, raw winning wherever both tables have one."""
        hours: dict[tuple[str, str, str], _Hour] = {}
        for source, is_raw in ((rolled, False), (raw, True)):
            for row in source:
                begins = from_sql(row['bucket'])
                if row['avg_value'] is None or begins is None:
                    continue
                local_day = begins.astimezone(tz).date()
                if not start <= local_day <= end:
                    continue
                hours[(row['room'], row['metric'], row['bucket'])] = {
                    'day': local_day,
                    'raw': is_raw,
                    'avg': row['avg_value'],
                    'min': row['min_value'],
                    'max': row['max_value'],
                    'count': row['reading_count'] or 1,
                }

        days: dict[tuple[str, str, datetime.date], _Day] = {}
        for (room_id, metric_id, _), hour in hours.items():
            key = (room_id, metric_id, hour['day'])
            day = days.get(key)
            if day is None:
                days[key] = {
                    'weighted': hour['avg'] * hour['count'],
                    'count': hour['count'],
                    'min': hour['min'],
                    'max': hour['max'],
                    # A day only counts as full resolution if every hour of it
                    # still has its individual samples.
                    'raw': hour['raw'],
                }
                continue
            day['weighted'] += hour['avg'] * hour['count']
            day['count'] += hour['count']
            day['min'] = min(day['min'], hour['min'])
            day['max'] = max(day['max'], hour['max'])
            day['raw'] = day['raw'] and hour['raw']

        points: list[DailyPoint] = []
        for (room_id, metric_id, local_day), day in days.items():
            points.append(
                DailyPoint(
                    room=room_id,
                    metric=metric_id,
                    day=local_day,
                    avg=day['weighted'] / day['count'],
                    min=day['min'],
                    max=day['max'],
                    count=day['count'],
                    resolution=Resolution.RAW if day['raw'] else Resolution.HOURLY,
                )
            )
        points.sort(key=lambda point: (point.day, point.room, point.metric))
        return points

    def last_seen_per_node(self, domain: str) -> dict[tuple[str, str], datetime.datetime]:
        with self._db.connect() as conn:
            found = fetch_rows(
                conn,
                '''
                SELECT room, metric, MAX(timestamp) AS last_seen
                FROM readings
                WHERE domain = ?
                GROUP BY room, metric
                ''',
                (domain,),
            )

        last_seen: dict[tuple[str, str], datetime.datetime] = {}
        for item in found:
            sensor = _SENSOR_BY_METRIC.get(item['metric'])
            seen_at = from_sql(item['last_seen'])
            if sensor is None or seen_at is None:
                continue
            key = (item['room'], sensor)
            if seen_at > last_seen.get(key, seen_at - datetime.timedelta(seconds=1)):
                last_seen[key] = seen_at
        return last_seen

    # --------------------------------------------------------------- helpers

    @staticmethod
    def _filters(room: str | None, metric: str | None) -> tuple[str, list[SqlValue]]:
        clauses = ''
        params: list[SqlValue] = []
        if room:
            clauses += ' AND room = ?'
            params.append(room)
        if metric:
            clauses += ' AND metric = ?'
            params.append(metric)
        return clauses, params

    @staticmethod
    def _merge(
        rolled: list[sqlite3.Row], raw: list[sqlite3.Row]
    ) -> dict[_AggregateKey, _Aggregate]:
        """Overlay raw buckets on rolled-up ones, keyed by room/metric/bucket."""
        merged: dict[_AggregateKey, _Aggregate] = {}
        for source in (rolled, raw):
            for item in source:
                merged[(item['room'], item['metric'], item['bucket'])] = {
                    'avg_value': item['avg_value'],
                    'min_value': item['min_value'],
                    'max_value': item['max_value'],
                    'reading_count': item['reading_count'],
                }
        return merged
