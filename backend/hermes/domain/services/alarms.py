"""Alarm engine.

Threshold breaches are stateful: an alarm opens when a metric crosses its
threshold and stays open — tracking its peak — until the metric falls back
below the release level. That gives every event a real duration instead of one
row per sample, and it means a flapping sensor cannot spam Telegram.
"""

import datetime
from dataclasses import dataclass

from .. import catalog
from ..models import Alarm, AlarmKind, SensorReading, Severity
from ..ports import AlarmRepository, Clock, EventPublisher, Notifier


@dataclass(frozen=True, slots=True)
class AlarmRule:
    """Opens when ``value > threshold``, closes under ``threshold * release``."""

    metric: str
    kind: AlarmKind
    severity: Severity
    threshold: float
    label: str
    #: Fraction of the threshold the value must drop back under to clear.
    release: float = 0.9
    #: Whether a breach should also fire the out-of-band notifier.
    notify: bool = False


def default_rules(gas: float, aq: float, humidity: float) -> tuple[AlarmRule, ...]:
    return (
        AlarmRule(catalog.GAS, AlarmKind.GAS, Severity.HIGH, gas, 'Gas / smoke', notify=True),
        AlarmRule(catalog.AIR_QUALITY, AlarmKind.AIR_QUALITY, Severity.MEDIUM, aq, 'Air quality'),
        AlarmRule(catalog.HUMIDITY, AlarmKind.HUMIDITY, Severity.MEDIUM, humidity, 'Humidity'),
    )


class AlarmService:
    def __init__(
        self,
        repository: AlarmRepository,
        rules: tuple[AlarmRule, ...],
        clock: Clock,
        publisher: EventPublisher | None = None,
        notifier: Notifier | None = None,
    ) -> None:
        self._repository = repository
        self._rules = rules
        self._clock = clock
        self._publisher = publisher
        self._notifier = notifier

    # ------------------------------------------------------------------ read

    def recent(self, days: int = 14, room: str | None = None, limit: int = 100) -> list[Alarm]:
        since = self._clock.now() - datetime.timedelta(days=days)
        return self._repository.list_since(since, room, limit)

    def count(self, days: int = 7) -> int:
        return self._repository.count_since(self._clock.now() - datetime.timedelta(days=days))

    def counts_by_day(
        self,
        start: datetime.date,
        end: datetime.date,
        room: str | None = None,
        offset_minutes: int = 0,
    ) -> dict[datetime.date, int]:
        return self._repository.counts_by_day(start, end, room, offset_minutes)

    # ----------------------------------------------------------------- write

    def evaluate(self, reading: SensorReading) -> list[Alarm]:
        """Apply every rule to a fresh reading and return the alarms it opened."""
        opened: list[Alarm] = []
        for rule in self._rules:
            value = reading.get(rule.metric)
            if value is None:
                continue
            alarm = self._apply(rule, reading, value)
            if alarm is not None:
                opened.append(alarm)
        return opened

    def _apply(self, rule: AlarmRule, reading: SensorReading, value: float) -> Alarm | None:
        active = self._repository.find_active(reading.room, rule.kind, rule.metric)

        if value > rule.threshold:
            if active is not None:
                self._repository.touch_peak(active.id, value)
                return None
            alarm = self._repository.open(
                room=reading.room,
                sensor=reading.sensor,
                metric=rule.metric,
                kind=rule.kind,
                severity=rule.severity,
                threshold=rule.threshold,
                value=value,
                detail=f'{self._format(rule, value)} over threshold {self._format(rule, rule.threshold)}',
                started_at=reading.recorded_at,
            )
            self._announce('alarm_opened', alarm)
            if rule.notify:
                self._send_notification(rule, alarm, reading, value)
            return alarm

        if active is not None and value <= rule.threshold * rule.release:
            self._repository.close(active.id, reading.recorded_at)
            self._announce('alarm_closed', active)
        return None

    def open_node_alarm(self, room: str, sensor: str, detail: str, at: datetime.datetime) -> Alarm | None:
        if self._repository.find_active(room, AlarmKind.NODE, None, sensor) is not None:
            return None
        alarm = self._repository.open(
            room=room,
            sensor=sensor,
            metric=None,
            kind=AlarmKind.NODE,
            severity=Severity.LOW,
            threshold=None,
            value=None,
            detail=detail,
            started_at=at,
        )
        self._announce('alarm_opened', alarm)
        return alarm

    def close_node_alarm(self, room: str, sensor: str, at: datetime.datetime) -> Alarm | None:
        active = self._repository.find_active(room, AlarmKind.NODE, None, sensor)
        if active is None:
            return None
        minutes = max(1, active.duration_seconds(at) // 60)
        self._repository.close(active.id, at, detail=f'reconnected after {minutes} min offline')
        self._announce('alarm_closed', active)
        return active

    # ---------------------------------------------------------------- helpers

    def _format(self, rule: AlarmRule, value: float) -> str:
        spec = catalog.metric(rule.metric)
        return f'{value:.{spec.decimals}f}{spec.unit}'

    def _announce(self, event: str, alarm: Alarm) -> None:
        if self._publisher is None:
            return
        self._publisher.publish(
            event,
            {
                'id': alarm.id,
                'room': alarm.room,
                'kind': str(alarm.kind),
                'severity': str(alarm.severity),
                'metric': alarm.metric,
                'detail': alarm.detail,
            },
        )

    def _send_notification(
        self, rule: AlarmRule, alarm: Alarm, reading: SensorReading, value: float
    ) -> None:
        if self._notifier is None or not self._notifier.enabled():
            return
        lines = [f'{rule.label}: {self._format(rule, value)} (threshold {self._format(rule, rule.threshold)})']
        for extra in (catalog.TEMPERATURE, catalog.HUMIDITY):
            other = reading.get(extra)
            if other is not None:
                spec = catalog.metric(extra)
                lines.append(f'{spec.label}: {other:.{spec.decimals}f}{spec.unit}')
        if self._notifier.notify(
            title=f'⚠️ {rule.label.upper()} — {reading.room}',
            body='\n'.join(lines),
            key=f'{alarm.kind}:{alarm.room}',
        ):
            self._repository.mark_notified(alarm.id)
