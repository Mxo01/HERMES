"""SQLite access primitives.

One connection per operation keeps the repositories usable from the Flask
request threads and the background jobs at the same time; WAL mode lets the
downsampling writer run while the dashboard reads.
"""

import datetime
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from .migrations import apply_migrations

#: SQLite stores our timestamps in this (naive, UTC) format.
SQL_TIMESTAMP: str = '%Y-%m-%d %H:%M:%S'
SQL_HOUR: str = '%Y-%m-%d %H:00:00'


def to_sql(value: datetime.datetime) -> str:
    """Render an aware datetime the way the schema stores it."""
    if value.tzinfo is not None:
        value = value.astimezone(datetime.UTC).replace(tzinfo=None)
    return value.strftime(SQL_TIMESTAMP)


def to_sql_hour(value: datetime.datetime) -> str:
    if value.tzinfo is not None:
        value = value.astimezone(datetime.UTC).replace(tzinfo=None)
    return value.strftime(SQL_HOUR)


def from_sql(value: str | None) -> datetime.datetime | None:
    """Parse a stored timestamp back into an aware UTC datetime."""
    if not value:
        return None
    text = value.strip().replace('T', ' ')
    if '.' in text:
        text = text.split('.', 1)[0]
    try:
        parsed = datetime.datetime.strptime(text, SQL_TIMESTAMP)
    except ValueError:
        try:
            parsed = datetime.datetime.strptime(text, '%Y-%m-%d')
        except ValueError:
            return None
    return parsed.replace(tzinfo=datetime.UTC)


class Database:
    def __init__(self, path: str) -> None:
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection, committing on success and rolling back on error."""
        conn = sqlite3.connect(self.path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA busy_timeout = 5000')
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def migrate(self) -> None:
        with self.connect() as conn:
            apply_migrations(conn)
