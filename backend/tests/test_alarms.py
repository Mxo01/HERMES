from hermes.container import Services
from hermes.domain.models import AlarmKind, Severity
from hermes.infrastructure.db.alarm_repository import SqliteAlarmRepository

from .conftest import FrozenClock, RecordingPublisher


def _gas(testSubject: Services, value: float) -> None:
    testSubject.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': value})


def test_crossing_the_threshold_opens_one_alarm(testSubject: Services) -> None:
    _gas(testSubject, 180)

    alarms = testSubject.alarms.recent()
    assert len(alarms) == 1
    assert alarms[0].kind is AlarmKind.GAS
    assert alarms[0].severity is Severity.HIGH
    assert alarms[0].active


def test_a_sustained_breach_does_not_open_a_second_alarm(testSubject: Services, clock: FrozenClock) -> None:
    _gas(testSubject, 180)
    clock.advance(seconds=30)
    _gas(testSubject, 204)
    clock.advance(seconds=30)
    _gas(testSubject, 190)

    alarms = testSubject.alarms.recent()
    assert len(alarms) == 1
    assert alarms[0].peak_value == 204


def test_returning_below_the_threshold_closes_the_alarm_with_a_duration(
    testSubject: Services, clock: FrozenClock
) -> None:
    _gas(testSubject, 180)
    clock.advance(minutes=4, seconds=12)
    _gas(testSubject, 40)

    alarm = testSubject.alarms.recent()[0]
    assert not alarm.active
    assert alarm.duration_seconds(clock.now()) == 252


def test_hovering_just_under_the_threshold_keeps_the_alarm_open(testSubject: Services, clock: FrozenClock) -> None:
    _gas(testSubject, 180)
    clock.advance(seconds=30)
    _gas(testSubject, 148)  # inside the release band

    assert testSubject.alarms.recent()[0].active


def test_a_new_breach_after_a_clear_opens_a_second_alarm(testSubject: Services, clock: FrozenClock) -> None:
    _gas(testSubject, 180)
    clock.advance(minutes=5)
    _gas(testSubject, 40)
    clock.advance(minutes=5)
    _gas(testSubject, 200)

    assert len(testSubject.alarms.recent()) == 2


def test_readings_under_the_threshold_never_alarm(testSubject: Services) -> None:
    _gas(testSubject, 38)

    assert testSubject.alarms.recent() == []


def test_humidity_and_air_quality_have_their_own_rules(testSubject: Services) -> None:
    testSubject.ingestion.ingest(
        {'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20.1, 'humidity': 82, 'aq': 340}
    )

    kinds = {alarm.kind for alarm in testSubject.alarms.recent()}
    assert kinds == {AlarmKind.HUMIDITY, AlarmKind.AIR_QUALITY}


def test_opening_an_alarm_publishes_a_realtime_event(
    testSubject: Services, publisher: RecordingPublisher
) -> None:
    _gas(testSubject, 180)

    assert 'alarm_opened' in publisher.names()
    assert 'fire_alert' in publisher.names()


def test_opening_an_already_open_alarm_returns_the_existing_one(
    testSubject: Services, clock: FrozenClock
) -> None:
    """The unique index is an invariant, not a crash: racing writers converge."""
    repository = SqliteAlarmRepository(testSubject.database)
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


def test_alarms_are_counted_per_day(testSubject: Services, clock: FrozenClock) -> None:
    _gas(testSubject, 180)
    clock.advance(minutes=5)
    _gas(testSubject, 40)

    counts = testSubject.alarms.counts_by_day(clock.now().date(), clock.now().date())
    assert counts[clock.now().date()] == 1


def test_an_open_alarm_older_than_the_window_is_still_listed(
    testSubject: Services, clock: FrozenClock
) -> None:
    """The log may drop old history, never an alarm that is still happening."""
    _gas(testSubject, 180)
    clock.advance(days=20)
    _gas(testSubject, 190)  # still breaching: same alarm, still open

    alarms = testSubject.alarms.recent(days=14)
    assert len(alarms) == 1
    assert alarms[0].active


def test_open_alarms_survive_the_row_limit(testSubject: Services, clock: FrozenClock) -> None:
    _gas(testSubject, 180)  # opened first, stays open
    for _ in range(3):
        clock.advance(minutes=5)
        testSubject.ingestion.ingest({'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20, 'humidity': 82, 'aq': 40})
        clock.advance(minutes=5)
        testSubject.ingestion.ingest({'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20, 'humidity': 50, 'aq': 40})

    alarms = testSubject.alarms.recent(limit=2)
    assert any(alarm.kind is AlarmKind.GAS and alarm.active for alarm in alarms)
    assert [alarm.started_at for alarm in alarms] == sorted((alarm.started_at for alarm in alarms), reverse=True)
