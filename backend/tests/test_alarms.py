from hermes.container import Services
from hermes.domain.models import AlarmKind, Severity
from hermes.infrastructure.db.alarm_repository import SqliteAlarmRepository

from .conftest import FrozenClock, RecordingPublisher


def _gas(services: Services, value: float) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': value})


def test_crossing_the_threshold_opens_one_alarm(services: Services) -> None:
    _gas(services, 180)

    alarms = services.alarms.recent()
    assert len(alarms) == 1
    assert alarms[0].kind is AlarmKind.GAS
    assert alarms[0].severity is Severity.HIGH
    assert alarms[0].active


def test_a_sustained_breach_does_not_open_a_second_alarm(services: Services, clock: FrozenClock) -> None:
    _gas(services, 180)
    clock.advance(seconds=30)
    _gas(services, 204)
    clock.advance(seconds=30)
    _gas(services, 190)

    alarms = services.alarms.recent()
    assert len(alarms) == 1
    assert alarms[0].peak_value == 204


def test_returning_below_the_threshold_closes_the_alarm_with_a_duration(
    services: Services, clock: FrozenClock
) -> None:
    _gas(services, 180)
    clock.advance(minutes=4, seconds=12)
    _gas(services, 40)

    alarm = services.alarms.recent()[0]
    assert not alarm.active
    assert alarm.duration_seconds(clock.now()) == 252


def test_hovering_just_under_the_threshold_keeps_the_alarm_open(services: Services, clock: FrozenClock) -> None:
    _gas(services, 180)
    clock.advance(seconds=30)
    _gas(services, 148)  # inside the release band

    assert services.alarms.recent()[0].active


def test_a_new_breach_after_a_clear_opens_a_second_alarm(services: Services, clock: FrozenClock) -> None:
    _gas(services, 180)
    clock.advance(minutes=5)
    _gas(services, 40)
    clock.advance(minutes=5)
    _gas(services, 200)

    assert len(services.alarms.recent()) == 2


def test_readings_under_the_threshold_never_alarm(services: Services) -> None:
    _gas(services, 38)

    assert services.alarms.recent() == []


def test_humidity_and_air_quality_have_their_own_rules(services: Services) -> None:
    services.ingestion.ingest(
        {'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20.1, 'humidity': 82, 'aq': 340}
    )

    kinds = {alarm.kind for alarm in services.alarms.recent()}
    assert kinds == {AlarmKind.HUMIDITY, AlarmKind.AIR_QUALITY}


def test_opening_an_alarm_publishes_a_realtime_event(
    services: Services, publisher: RecordingPublisher
) -> None:
    _gas(services, 180)

    assert 'alarm_opened' in publisher.names()
    assert 'fire_alert' in publisher.names()


def test_opening_an_already_open_alarm_returns_the_existing_one(
    services: Services, clock: FrozenClock
) -> None:
    """The unique index is an invariant, not a crash: racing writers converge."""
    repository = SqliteAlarmRepository(services.database)
    first = repository.open(
        room='kitchen',
        sensor='mq2',
        metric=None,
        kind=AlarmKind.NODE,
        severity=Severity.LOW,
        threshold=None,
        value=None,
        detail='Node A silent',
        started_at=clock.now(),
    )

    second = repository.open(
        room='kitchen',
        sensor='mq2',
        metric=None,
        kind=AlarmKind.NODE,
        severity=Severity.LOW,
        threshold=None,
        value=None,
        detail='Node A silent again',
        started_at=clock.now(),
    )

    assert second.id == first.id
    assert len(repository.list_active()) == 1


def test_alarms_are_counted_per_day(services: Services, clock: FrozenClock) -> None:
    _gas(services, 180)
    clock.advance(minutes=5)
    _gas(services, 40)

    counts = services.alarms.counts_by_day(clock.now().date(), clock.now().date())
    assert counts[clock.now().date()] == 1
