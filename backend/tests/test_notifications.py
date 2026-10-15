"""Out-of-band notifications: sent from a background pass, retried until delivered."""

from hermes.config import Settings
from hermes.container import Services
from hermes.domain.services.alarms import AlarmService, default_rules
from hermes.infrastructure.db.alarm_repository import SqliteAlarmRepository

from .conftest import FrozenClock


class FakeNotifier:
    """Records every message; can be told to fail, like Telegram during an outage."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []
        self.failing = False

    def enabled(self) -> bool:
        return True

    def notify(self, title: str, body: str, key: str) -> bool:
        if self.failing:
            return False
        self.sent.append((title, body, key))
        return True


def _engine(services: Services, settings: Settings, clock: FrozenClock, notifier: FakeNotifier) -> AlarmService:
    """An alarm service over the same database as `services`, but with a notifier we control."""
    return AlarmService(
        repository=SqliteAlarmRepository(services.database),
        rules=default_rules(
            gas=settings.alarms.gas_threshold,
            aq=settings.alarms.aq_threshold,
            humidity=settings.alarms.humidity_threshold,
        ),
        clock=clock,
        notifier=notifier,
    )


def _gas(services: Services, value: float) -> None:
    services.ingestion.ingest({'room': 'kitchen', 'sensor': 'mq2', 'gas': value})


def test_a_gas_alarm_is_notified_once(services: Services, settings: Settings, clock: FrozenClock) -> None:
    notifier = FakeNotifier()
    engine = _engine(services, settings, clock, notifier)
    _gas(services, 180)

    assert engine.dispatch_pending() == 1
    assert engine.dispatch_pending() == 0
    assert len(notifier.sent) == 1
    title, body, _ = notifier.sent[0]
    assert 'GAS' in title and 'kitchen' in title
    assert '180' in body and '150' in body


def test_a_failed_send_is_retried_while_the_alarm_is_open(
    services: Services, settings: Settings, clock: FrozenClock
) -> None:
    notifier = FakeNotifier()
    engine = _engine(services, settings, clock, notifier)
    _gas(services, 180)

    notifier.failing = True
    assert engine.dispatch_pending() == 0
    assert not services.alarms.recent()[0].notified

    notifier.failing = False
    assert engine.dispatch_pending() == 1
    assert services.alarms.recent()[0].notified


def test_an_alarm_that_closed_before_delivery_is_not_sent_late(
    services: Services, settings: Settings, clock: FrozenClock
) -> None:
    notifier = FakeNotifier()
    engine = _engine(services, settings, clock, notifier)
    _gas(services, 180)
    clock.advance(seconds=30)
    _gas(services, 40)

    assert engine.dispatch_pending() == 0


def test_alarms_whose_rule_does_not_notify_stay_quiet(
    services: Services, settings: Settings, clock: FrozenClock
) -> None:
    notifier = FakeNotifier()
    engine = _engine(services, settings, clock, notifier)
    services.ingestion.ingest({'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20, 'humidity': 82, 'aq': 340})

    assert engine.dispatch_pending() == 0


def test_the_gas_board_going_silent_is_notified(
    services: Services, settings: Settings, clock: FrozenClock
) -> None:
    notifier = FakeNotifier()
    engine = _engine(services, settings, clock, notifier)
    _gas(services, 38)
    services.ingestion.ingest({'room': 'bedroom', 'sensor': 'mq135', 'temperature': 20, 'humidity': 50, 'aq': 40})
    clock.advance(seconds=600)
    services.nodes.check_offline()

    assert engine.dispatch_pending() == 1
    title, body, _ = notifier.sent[0]
    assert 'NODE OFFLINE' in title
    assert 'gas alerts are off' in body
    # Only the gas board: the bedroom board's silence stays a dashboard matter.
    assert all('bedroom' not in sent_title for sent_title, _, _ in notifier.sent)


def test_ingestion_never_waits_on_the_notifier(
    services: Services, settings: Settings, clock: FrozenClock
) -> None:
    """The node's POST must not block on Telegram: sending is the job's work."""
    notifier = FakeNotifier()
    _engine(services, settings, clock, notifier)
    _gas(services, 180)

    assert notifier.sent == []


def test_node_alarm_text_carries_no_server_clock_time(services: Services, clock: FrozenClock) -> None:
    _gas(services, 38)
    clock.advance(seconds=600)
    services.nodes.check_offline()

    detail = next(alarm.detail for alarm in services.alarms.recent() if alarm.sensor == 'mq2')
    assert ':' not in detail
