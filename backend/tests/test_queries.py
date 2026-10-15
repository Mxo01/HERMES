import datetime
import zoneinfo

import pytest

from hermes.container import Services
from hermes.domain.errors import ValidationError
from hermes.domain.models import NodeState, Resolution
from hermes.infrastructure.db.reading_repository import SqliteReadingRepository

from .conftest import FrozenClock

ROME = zoneinfo.ZoneInfo('Europe/Rome')


def _seed_days(services: Services, clock: FrozenClock, days: int) -> None:
    """One reading per hour, walking forward to now."""
    repository = SqliteReadingRepository(services.database)
    start = clock.now() - datetime.timedelta(days=days)
    for hour in range(days * 24):
        repository.insert_many(
            'air_quality',
            'kitchen',
            {'temperature': 20 + (hour % 12) * 0.25},
            start + datetime.timedelta(hours=hour),
        )


def test_hourly_history_covers_the_requested_window(services: Services, clock: FrozenClock) -> None:
    _seed_days(services, clock, days=2)

    points = services.readings.hourly('kitchen', 'temperature', hours=24)

    assert 20 <= len(points) <= 25
    assert all(point.metric == 'temperature' for point in points)
    assert points == sorted(points, key=lambda point: point.hour)


def test_hourly_rejects_an_out_of_range_window(services: Services) -> None:
    with pytest.raises(ValidationError):
        services.readings.hourly(None, None, hours=10_000)


def test_hourly_rejects_an_unknown_metric(services: Services) -> None:
    with pytest.raises(ValidationError):
        services.readings.hourly(None, 'pressure', hours=24)


def test_daily_summarises_each_day_in_the_range(services: Services, clock: FrozenClock) -> None:
    _seed_days(services, clock, days=3)
    today = clock.now().date()

    points = services.readings.daily('kitchen', 'temperature', today - datetime.timedelta(days=2), today)

    assert len(points) == 3
    assert all(point.min <= point.avg <= point.max for point in points)
    assert all(point.resolution is Resolution.RAW for point in points)


def test_daily_reports_hourly_resolution_after_downsampling(services: Services, clock: FrozenClock) -> None:
    _seed_days(services, clock, days=10)
    services.retention.downsample(keep_days=7)
    today = clock.now().date()

    points = services.readings.daily(
        'kitchen', 'temperature', today - datetime.timedelta(days=9), today
    )
    by_day = {point.day: point for point in points}

    old = by_day[today - datetime.timedelta(days=9)]
    recent = by_day[today - datetime.timedelta(days=1)]
    assert old.resolution is Resolution.HOURLY
    assert recent.resolution is Resolution.RAW


def test_downsampling_preserves_the_daily_average(services: Services, clock: FrozenClock) -> None:
    _seed_days(services, clock, days=10)
    today = clock.now().date()
    day = today - datetime.timedelta(days=9)
    before = {p.day: p for p in services.readings.daily('kitchen', 'temperature', day, day)}[day]

    services.retention.downsample(keep_days=7)

    after = {p.day: p for p in services.readings.daily('kitchen', 'temperature', day, day)}[day]
    assert after.avg == pytest.approx(before.avg, abs=0.01)
    assert after.min == pytest.approx(before.min, abs=0.01)
    assert after.max == pytest.approx(before.max, abs=0.01)


def test_daily_rejects_an_inverted_range(services: Services, clock: FrozenClock) -> None:
    today = clock.now().date()
    with pytest.raises(ValidationError):
        services.readings.daily(None, None, today, today - datetime.timedelta(days=3))


def test_daily_carries_the_alarm_count_of_each_day(services: Services, clock: FrozenClock) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 180})
    today = clock.now().date()

    points = services.readings.daily('kitchen', 'gas', today, today)

    assert points[0].alarms == 1


def test_a_fresh_reading_puts_its_node_online(services: Services) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})

    node = next(n for n in services.nodes.list_status() if n.sensor == 'mq2' and n.room == 'kitchen')
    assert node.state is NodeState.ONLINE


def test_a_silent_node_degrades_then_goes_offline(services: Services, clock: FrozenClock) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})

    clock.advance(seconds=120)
    assert _kitchen_gas_node(services).state is NodeState.DELAYED

    clock.advance(seconds=400)
    assert _kitchen_gas_node(services).state is NodeState.OFFLINE


def test_a_node_that_never_reported_is_unknown(services: Services) -> None:
    assert _kitchen_gas_node(services).state is NodeState.UNKNOWN


def test_the_watchdog_opens_and_clears_a_node_alarm(services: Services, clock: FrozenClock) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})
    clock.advance(seconds=600)

    services.nodes.check_offline()
    assert any(alarm.active for alarm in services.alarms.recent())

    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})
    assert not any(alarm.active for alarm in services.alarms.recent())


def test_two_boards_in_one_room_get_their_own_node_alarms(
    services: Services, clock: FrozenClock
) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})
    services.ingestion.ingest(
        {'room': 'kitchen', 'sensor': 'mq135', 'temperature': 21, 'humidity': 54, 'aq': 62}
    )
    clock.advance(seconds=600)

    services.nodes.check_offline()

    sensors = {alarm.sensor for alarm in services.alarms.recent() if alarm.active}
    assert sensors == {'mq2', 'mq135'}


def _kitchen_gas_node(services: Services):  # type: ignore[no-untyped-def]
    return next(n for n in services.nodes.list_status() if n.room == 'kitchen' and n.sensor == 'mq2')


def test_downsampling_preserves_a_day_split_across_both_tables(
    services: Services, clock: FrozenClock
) -> None:
    """The day at the retention boundary has rolled and raw hours at once."""
    repository = SqliteReadingRepository(services.database)
    day = clock.now().replace(hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(days=9)
    for hour in range(24):
        repository.insert_many(
            'air_quality',
            'kitchen',
            {'temperature': 30.0 if hour < 12 else 10.0},
            day + datetime.timedelta(hours=hour),
        )

    before = services.readings.daily('kitchen', 'temperature', day.date(), day.date())[0]

    # A cutoff inside that day rolls up only its first half.
    services.retention.downsample(keep_days=9)

    after = services.readings.daily('kitchen', 'temperature', day.date(), day.date())[0]
    assert (after.min, after.avg, after.max) == (before.min, before.avg, before.max)
    assert after.count == before.count
    # Half its hours no longer have individual samples, and it says so.
    assert after.resolution is Resolution.HOURLY


def test_downsampling_never_splits_an_hour(services: Services, clock: FrozenClock) -> None:
    """A half-rolled hour could never be completed: the second insert is a no-op."""
    repository = SqliteReadingRepository(services.database)
    hour = clock.now().replace(minute=0, second=0, microsecond=0) - datetime.timedelta(days=8)
    for minute, value in ((0, 10.0), (15, 20.0), (30, 30.0), (45, 40.0)):
        repository.insert_many(
            'air_quality', 'kitchen', {'temperature': value}, hour + datetime.timedelta(minutes=minute)
        )

    # Two runs whose raw cutoffs both land inside that hour.
    services.retention.downsample(keep_days=8)
    clock.advance(minutes=30)
    services.retention.downsample(keep_days=8)

    day = hour.date()
    point = services.readings.daily('kitchen', 'temperature', day, day)[0]
    assert (point.min, point.max, point.count) == (10.0, 40.0, 4)
    assert point.avg == pytest.approx(25.0)


def test_alarm_counts_follow_the_same_day_boundary_as_the_readings(
    services: Services, clock: FrozenClock
) -> None:
    """An alarm just after local midnight belongs to the local day, not the UTC one."""
    # The clock starts at 14:32 UTC; move it to 23:30, which is 01:30 the
    # following day in Rome (UTC+2 in August).
    clock.advance(hours=8, minutes=58)
    assert clock.now().hour == 23
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': 180})

    utc_day = clock.now().date()
    local_day = utc_day + datetime.timedelta(days=1)

    counts = services.alarms.counts_by_day(utc_day, local_day, tz=ROME)
    assert counts.get(local_day) == 1
    assert counts.get(utc_day) is None


def test_daily_days_follow_the_zone_across_a_dst_change(services: Services) -> None:
    """One range, two offsets: Rome is UTC+2 until 25 Oct 2026 and UTC+1 after.

    A single fixed offset (whatever applied when the page loaded) would put one
    side of the change an hour off, moving these late-evening readings onto
    the wrong day.
    """
    repository = SqliteReadingRepository(services.database)
    utc = datetime.UTC
    # 00:30 on 21 Oct in Rome (CEST), and 23:30 on 30 Oct in Rome (CET).
    repository.insert_many('air_quality', 'kitchen', {'temperature': 18.0},
                           datetime.datetime(2026, 10, 20, 22, 30, tzinfo=utc))
    repository.insert_many('air_quality', 'kitchen', {'temperature': 12.0},
                           datetime.datetime(2026, 10, 30, 22, 30, tzinfo=utc))

    points = services.readings.daily(
        'kitchen', 'temperature', datetime.date(2026, 10, 20), datetime.date(2026, 10, 31), tz=ROME
    )

    assert {point.day: point.avg for point in points} == {
        datetime.date(2026, 10, 21): 18.0,
        datetime.date(2026, 10, 30): 12.0,
    }


def test_daily_leaves_out_hours_outside_the_local_range(services: Services) -> None:
    repository = SqliteReadingRepository(services.database)
    # 23:30 on 9 Aug in Rome: inside the 9th, outside the 10th.
    repository.insert_many('air_quality', 'kitchen', {'temperature': 25.0},
                           datetime.datetime(2026, 8, 9, 21, 30, tzinfo=datetime.UTC))

    day = datetime.date(2026, 8, 10)
    assert services.readings.daily('kitchen', 'temperature', day, day, tz=ROME) == []
