"""Telegram implementation of :class:`~hermes.domain.ports.Notifier`.

Rate limiting lives here rather than in the alarm engine: the engine already
guarantees one event per breach, this guards against a node that flaps.
"""

import logging
import time

import telebot

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, bot_token: str | None, chat_id: str | None, cooldown_seconds: int = 60) -> None:
        self._chat_id = chat_id
        self._cooldown = cooldown_seconds
        self._last_sent: dict[str, float] = {}
        self._bot: telebot.TeleBot | None = None

        if bot_token:
            try:
                self._bot = telebot.TeleBot(bot_token)
            except ValueError as exc:
                logger.warning('Invalid Telegram bot token, notifications disabled: %s', exc)

    def enabled(self) -> bool:
        return self._bot is not None and bool(self._chat_id)

    def notify(self, title: str, body: str, key: str) -> bool:
        if self._bot is None or not self._chat_id:
            return False

        now = time.monotonic()
        if now - self._last_sent.get(key, 0.0) < self._cooldown:
            return False

        try:
            self._bot.send_message(self._chat_id, f'{title}\n{body}')
        except Exception as exc:  # noqa: BLE001 - third-party client, any failure is non-fatal
            logger.warning('Telegram send failed: %s', exc)
            return False

        self._last_sent[key] = now
        return True


class NullNotifier:
    """Used when no Telegram credentials are configured."""

    def enabled(self) -> bool:
        return False

    def notify(self, title: str, body: str, key: str) -> bool:
        return False
