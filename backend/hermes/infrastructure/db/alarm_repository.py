"""SQLite-backed :class:`~hermes.domain.ports.AlarmRepository`."""

import datetime
import logging
import sqlite3
from typing import Any

from ...domain.models import Alarm, AlarmKind, Severity
from .database import Database, from_sql, to_sql

logger = logging.getLogger(__name__)

_COLUMNS = (
    'id, room, sensor, metric, kind, severity, threshold, peak_value, detail, '
    'started_at, ended_at, notified'
)


def _to_alarm(row: sqlite3.Row) -> Alarm:
    started = from_sql(row['started_at'])
    if started is None:  # pragma: no cover - started_at is NOT NULL
        started = datetime.datetime.now(datetime.UTC)
    return Alarm(
        id=row['id'],
        room=row['room'],
        sensor=row['sensor'],
        metric=row['metric'],
        kind=AlarmKind(row['kind']),
        severity=Severity(row['severity']),
        threshold=row['threshold'],
        peak_value=row['peak_value'],
        started_at=started,
        ended_at=from_sql(row['ended_at']),
        notified=bool(row['notified']),
        detail=row['detail'] or '',
    )


class SqliteAlarmRepository:
    def __init__(self, database: Database) -> None:
        self._db = database

    # ----------------------------------------------------------------- write

    def open(
        self,
        room: str,
        sensor: str | None,
        metric: str | None,
        kind: AlarmKind,
        severity: Severity,
        threshold: float | None,
        value: float | None,
        detail: str,
        started_at: datetime.datetime,
    ) -> Alarm:
        """Open an alarm, or return the one already open for the same condition.

        A partial unique index enforces "at most one open alarm per room, kind,
        metric and sensor". Callers check ``find_active`` first, but that check
        and this insert are not atomic — an ingesting request and the node
        watchdog can interleave. Treating the conflict as "already open"
        upholds the invariant instead of turning a race into a 500.
        """
        with self._db.connect() as conn:
            try:
                cursor = conn.execute(
                    '''
                    INSERT INTO alarms
                        (room, sensor, metric, kind, severity, threshold, peak_value, detail, started_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (room, sensor, metric, str(kind), str(severity), threshold, value, detail, to_sql(started_at)),
                )
            except sqlite3.IntegrityError:
                existing = conn.execute(
                    f'''
                    SELECT {_COLUMNS} FROM alarms
                    WHERE room = ? AND kind = ? AND IFNULL(metric, '') = ?
                      AND IFNULL(sensor, '') = ? AND ended_at IS NULL
                    ORDER BY started_at DESC LIMIT 1
                    ''',
                    (room, str(kind), metric or '', sensor or ''),
                ).fetchone()
                if existing is None:
                    raise
                logger.debug('Alarm already open for %s/%s/%s, reusing it', room, kind, metric)
                return _to_alarm(existing)

            row = conn.execute(
                f'SELECT {_COLUMNS} FROM alarms WHERE id = ?', (cursor.lastrowid,)
            ).fetchone()
        return _to_alarm(row)

    def close(self, alarm_id: int, ended_at: datetime.datetime, detail: str | None = None) -> None:
        with self._db.connect() as conn:
            if detail is None:
                conn.execute(
                    'UPDATE alarms SET ended_at = ? WHERE id = ? AND ended_at IS NULL',
                    (to_sql(ended_at), alarm_id),
                )
            else:
                conn.execute(
                    'UPDATE alarms SET ended_at = ?, detail = ? WHERE id = ? AND ended_at IS NULL',
                    (to_sql(ended_at), detail, alarm_id),
                )

    def touch_peak(self, alarm_id: int, value: float) -> None:
        with self._db.connect() as conn:
            conn.execute(
                'UPDATE alarms SET peak_value = MAX(IFNULL(peak_value, ?), ?) WHERE id = ?',
                (value, value, alarm_id),
            )

    def mark_notified(self, alarm_id: int) -> None:
        with self._db.connect() as conn:
            conn.execute('UPDATE alarms SET notified = 1 WHERE id = ?', (alarm_id,))

    # ------------------------------------------------------------------ read

    def find_active(
        self, room: str, kind: AlarmKind, metric: str | None, sensor: str | None = None
    ) -> Alarm | None:
        clause = ''
        params: list[Any] = [room, str(kind), metric or '']
        if sensor is not None:
            clause = " AND IFNULL(sensor, '') = ?"
            params.append(sensor)

        with self._db.connect() as conn:
            row = conn.execute(
                f'''
                SELECT {_COLUMNS} FROM alarms
                WHERE room = ? AND kind = ? AND IFNULL(metric, '') = ?{clause}
                  AND ended_at IS NULL
                ORDER BY started_at DESC LIMIT 1
                ''',
                params,
            ).fetchone()
        return _to_alarm(row) if row else None

    def list_active(self) -> list[Alarm]:
        with self._db.connect() as conn:
            rows = conn.execute(
                f'SELECT {_COLUMNS} FROM alarms WHERE ended_at IS NULL ORDER BY started_at DESC'
            ).fetchall()
        return [_to_alarm(row) for row in rows]

    def list_since(self, since: datetime.datetime, room: str | None, limit: int) -> list[Alarm]:
        clause = ''
        params: list[Any] = [to_sql(since)]
        if room:
            clause = ' AND room = ?'
            params.append(room)
        params.append(limit)

        with self._db.connect() as conn:
            rows = conn.execute(
                f'''
                SELECT {_COLUMNS} FROM alarms
                WHERE started_at >= ?{clause}
                ORDER BY started_at DESC
                LIMIT ?
                ''',
                params,
            ).fetchall()
        return [_to_alarm(row) for row in rows]

    def count_since(self, since: datetime.datetime) -> int:
        with self._db.connect() as conn:
            row = conn.execute(
                'SELECT COUNT(*) AS total FROM alarms WHERE started_at >= ?', (to_sql(since),)
            ).fetchone()
        return int(row['total'])

    def counts_by_day(
        self, start: datetime.date, end: datetime.date, room: str | None
    ) -> dict[datetime.date, int]:
        clause = ''
        params: list[Any] = [start.isoformat(), end.isoformat()]
        if room:
            clause = ' AND room = ?'
            params.append(room)

        with self._db.connect() as conn:
            rows = conn.execute(
                f'''
                SELECT date(started_at) AS day, COUNT(*) AS total
                FROM alarms
                WHERE date(started_at) BETWEEN ? AND ?{clause}
                GROUP BY day
                ''',
                params,
            ).fetchall()

        counts: dict[datetime.date, int] = {}
        for row in rows:
            try:
                counts[datetime.date.fromisoformat(row['day'])] = int(row['total'])
            except (TypeError, ValueError):
                continue
        return counts
