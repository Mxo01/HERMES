"""Telegram delivery: the rate limit, and never letting a send failure propagate.

The bot client is replaced wholesale: `notify` must be safe to call from a
background thread while the network is down, so its behaviour is pinned here
rather than discovered in production.
"""

import pytest

from hermes.infrastructure.notifications import telegram
from hermes.infrastructure.notifications.telegram import NullNotifier, TelegramNotifier

CHAT_ID = '12345'
COOLDOWN = 60
TITLE = 'GAS ALERT'
BODY = 'kitchen peaked at 180'
KEY = 'gas:kitchen'


class FakeBot:
    """Stands in for telebot.TeleBot: records messages, can be told to fail."""

    def __init__(self, token: str) -> None:
        self.token = token
        self.sent: list[tuple[str, str]] = []
        self.failing = False

    def send_message(self, chat_id: str, text: str) -> None:
        if self.failing:
            raise ConnectionError('telegram is down')
        self.sent.append((chat_id, text))


class FakeClock:
    """A monotonic clock the test moves by hand."""

    def __init__(self) -> None:
        # Non-zero: the notifier compares against `_last_sent.get(key, 0.0)`,
        # so a clock starting at 0 would look like a send one second ago.
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    fake = FakeClock()
    monkeypatch.setattr(telegram.time, 'monotonic', fake.monotonic)
    return fake


@pytest.fixture
def bot(monkeypatch: pytest.MonkeyPatch) -> list[FakeBot]:
    created: list[FakeBot] = []

    def build(token: str) -> FakeBot:
        created.append(FakeBot(token))
        return created[-1]

    monkeypatch.setattr(telegram.telebot, 'TeleBot', build)
    return created


def _notifier() -> TelegramNotifier:
    return TelegramNotifier(bot_token='token', chat_id=CHAT_ID, cooldown_seconds=COOLDOWN)


def test_a_message_is_sent_with_the_title_and_the_body(clock: FakeClock, bot: list[FakeBot]) -> None:
    testSubject = _notifier()

    assert testSubject.notify(TITLE, BODY, KEY) is True

    assert bot[0].sent == [(CHAT_ID, f'{TITLE}\n{BODY}')]


def test_a_second_message_inside_the_cooldown_is_dropped(
    clock: FakeClock, bot: list[FakeBot]
) -> None:
    testSubject = _notifier()
    testSubject.notify(TITLE, BODY, KEY)

    clock.now += COOLDOWN / 2

    assert testSubject.notify(TITLE, BODY, KEY) is False
    assert len(bot[0].sent) == 1


def test_the_cooldown_has_passed_after_the_interval(clock: FakeClock, bot: list[FakeBot]) -> None:
    testSubject = _notifier()
    testSubject.notify(TITLE, BODY, KEY)

    clock.now += COOLDOWN

    assert testSubject.notify(TITLE, BODY, KEY) is True
    assert len(bot[0].sent) == 2


def test_the_cooldown_is_per_alarm_key(clock: FakeClock, bot: list[FakeBot]) -> None:
    testSubject = _notifier()
    testSubject.notify(TITLE, BODY, KEY)

    assert testSubject.notify(TITLE, BODY, 'aq:bedroom') is True


def test_a_failed_send_is_reported_and_does_not_hold_the_cooldown(
    clock: FakeClock, bot: list[FakeBot]
) -> None:
    """A retry must be possible immediately: the failure was not a delivery."""
    testSubject = _notifier()
    bot[0].failing = True

    assert testSubject.notify(TITLE, BODY, KEY) is False

    bot[0].failing = False
    assert testSubject.notify(TITLE, BODY, KEY) is True


def test_without_a_chat_id_nothing_is_sent(clock: FakeClock, bot: list[FakeBot]) -> None:
    testSubject = TelegramNotifier(bot_token='token', chat_id=None)

    assert testSubject.enabled() is False
    assert testSubject.notify(TITLE, BODY, KEY) is False


def test_without_a_token_nothing_is_sent(clock: FakeClock, bot: list[FakeBot]) -> None:
    testSubject = TelegramNotifier(bot_token=None, chat_id=CHAT_ID)

    assert testSubject.enabled() is False
    assert testSubject.notify(TITLE, BODY, KEY) is False


def test_an_invalid_token_disables_notifications(
    monkeypatch: pytest.MonkeyPatch, clock: FakeClock
) -> None:
    def reject(_token: str) -> FakeBot:
        raise ValueError('invalid token')

    monkeypatch.setattr(telegram.telebot, 'TeleBot', reject)

    testSubject = TelegramNotifier(bot_token='nonsense', chat_id=CHAT_ID)

    assert testSubject.enabled() is False


def test_the_null_notifier_never_sends_anything() -> None:
    testSubject = NullNotifier()

    assert testSubject.enabled() is False
    assert testSubject.notify(TITLE, BODY, KEY) is False
