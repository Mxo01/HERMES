import sqlite3
from typing import Any

import pytest

from hermes.infrastructure.db import migrations
from hermes.infrastructure.db.database import Database


def _version(path: str) -> int:
    with sqlite3.connect(path) as conn:
        return int(conn.execute('PRAGMA user_version').fetchone()[0])


def test_a_fresh_database_lands_on_the_current_schema(tmp_path: Any) -> None:
    path = str(tmp_path / 'fresh.db')
    Database(path).migrate()

    assert _version(path) == migrations.SCHEMA_VERSION


def test_a_failed_migration_keeps_the_ones_before_it(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each step is recorded on its own, so a retry resumes instead of replaying."""
    path = str(tmp_path / 'broken.db')
    broken = migrations.SCHEMA_VERSION + 1
    monkeypatch.setitem(
        migrations.MIGRATIONS,
        broken,
        'CREATE TABLE half_done (id INTEGER); SELECT * FROM no_such_table;',
    )
    monkeypatch.setattr(migrations, 'SCHEMA_VERSION', broken)

    with pytest.raises(sqlite3.OperationalError):
        Database(path).migrate()

    assert _version(path) == broken - 1
    with sqlite3.connect(path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    # The failed step rolled back as a whole...
    assert 'half_done' not in tables
    # ...and the steps before it are still there, so a retry starts at `broken`.
    assert 'alarms' in tables

    with pytest.raises(sqlite3.OperationalError):
        Database(path).migrate()
    assert _version(path) == broken - 1
