import datetime

import pytest

from hermes.container import Services
from hermes.domain.errors import ValidationError
from hermes.domain.models import NodeState, Resolution
from hermes.infrastructure.db.reading_repository import SqliteReadingRepository

from .conftest import FrozenClock


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
