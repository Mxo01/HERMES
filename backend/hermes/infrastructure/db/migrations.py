import sqlite3

SCHEMA_VERSION: int = 5

MIGRATIONS: dict[int, str] = {
    1: '''
        CREATE TABLE IF NOT EXISTS live_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            temperature REAL,
            humidity REAL,
            gas INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS hourly_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            avg_temperature REAL,
            avg_humidity REAL,
            avg_gas REAL,
            max_gas INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''',
    2: '''
        CREATE TABLE IF NOT EXISTS gas_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            gas INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS environment_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            temperature REAL,
            humidity REAL,
            aq INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO gas_readings (room, gas, timestamp)
            SELECT room, gas, timestamp FROM live_readings WHERE gas IS NOT NULL;

        INSERT INTO environment_readings (room, temperature, humidity, timestamp)
            SELECT room, temperature, humidity, timestamp FROM live_readings
            WHERE temperature IS NOT NULL OR humidity IS NOT NULL;

        DROP TABLE IF EXISTS live_readings;
    ''',
    3: '''
        DROP TABLE IF EXISTS hourly_readings;

        CREATE TABLE hourly_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            hour TEXT NOT NULL,
            avg_temperature REAL,
            avg_humidity REAL,
            avg_aq REAL,
            avg_gas REAL,
            max_gas INTEGER,
            UNIQUE (room, hour)
        );
    ''',
    4: '''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            room TEXT NOT NULL,
            metric TEXT NOT NULL,
            value REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_readings_lookup
            ON readings (domain, room, metric, timestamp);

        CREATE TABLE IF NOT EXISTS hourly_aggregates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT NOT NULL,
            room TEXT NOT NULL,
            metric TEXT NOT NULL,
            hour TEXT NOT NULL,
            avg_value REAL,
            min_value REAL,
            max_value REAL,
            reading_count INTEGER,
            UNIQUE (domain, room, metric, hour)
        );

        INSERT INTO readings (domain, room, metric, value, timestamp)
            SELECT 'air_quality', room, 'gas', gas, timestamp
            FROM gas_readings WHERE gas IS NOT NULL;

        INSERT INTO readings (domain, room, metric, value, timestamp)
            SELECT 'air_quality', room, 'temperature', temperature, timestamp
            FROM environment_readings WHERE temperature IS NOT NULL;

        INSERT INTO readings (domain, room, metric, value, timestamp)
            SELECT 'air_quality', room, 'humidity', humidity, timestamp
            FROM environment_readings WHERE humidity IS NOT NULL;

        INSERT INTO readings (domain, room, metric, value, timestamp)
            SELECT 'air_quality', room, 'aq', aq, timestamp
            FROM environment_readings WHERE aq IS NOT NULL;

        INSERT INTO hourly_aggregates (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
            SELECT 'air_quality', room, 'temperature', hour, avg_temperature, avg_temperature, avg_temperature, 1
            FROM hourly_readings WHERE avg_temperature IS NOT NULL;

        INSERT INTO hourly_aggregates (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
            SELECT 'air_quality', room, 'humidity', hour, avg_humidity, avg_humidity, avg_humidity, 1
            FROM hourly_readings WHERE avg_humidity IS NOT NULL;

        INSERT INTO hourly_aggregates (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
            SELECT 'air_quality', room, 'aq', hour, avg_aq, avg_aq, avg_aq, 1
            FROM hourly_readings WHERE avg_aq IS NOT NULL;

        INSERT INTO hourly_aggregates (domain, room, metric, hour, avg_value, min_value, max_value, reading_count)
            SELECT 'air_quality', room, 'gas', hour, avg_gas, avg_gas, max_gas, 1
            FROM hourly_readings WHERE avg_gas IS NOT NULL;

        DROP TABLE IF EXISTS gas_readings;
        DROP TABLE IF EXISTS environment_readings;
        DROP TABLE IF EXISTS hourly_readings;
    ''',
    5: '''
        CREATE TABLE IF NOT EXISTS alarms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room TEXT NOT NULL,
            sensor TEXT,
            metric TEXT,
            kind TEXT NOT NULL,
            severity TEXT NOT NULL,
            threshold REAL,
            peak_value REAL,
            detail TEXT NOT NULL DEFAULT '',
            started_at DATETIME NOT NULL,
            ended_at DATETIME,
            notified INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_alarms_started
            ON alarms (started_at DESC);

        -- At most one open alarm per (room, kind, metric, sensor): the engine
        -- updates the existing row instead of inserting one per breaching
        -- sample. Threshold alarms are keyed by metric, node alarms — which
        -- have no metric — by the board that went quiet.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_alarms_active
            ON alarms (room, kind, IFNULL(metric, ''), IFNULL(sensor, ''))
            WHERE ended_at IS NULL;

        CREATE INDEX IF NOT EXISTS idx_readings_room_time
            ON readings (domain, room, timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_hourly_lookup
            ON hourly_aggregates (domain, room, metric, hour);
    ''',
}


def apply_migrations(conn: sqlite3.Connection) -> None:
    version = conn.execute('PRAGMA user_version').fetchone()[0]

    for target in range(version + 1, SCHEMA_VERSION + 1):
        conn.executescript(MIGRATIONS[target])

    if version < SCHEMA_VERSION:
        conn.execute(f'PRAGMA user_version = {SCHEMA_VERSION}')
        conn.commit()