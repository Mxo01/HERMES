"""Liveness of the ESP8266 nodes, derived from when each last posted."""

import datetime

from .. import catalog
from ..models import NodeState, NodeStatus
from ..ports import Clock, EventPublisher, ReadingRepository
from .alarms import AlarmService


class NodeService:
    def __init__(
        self,
        repository: ReadingRepository,
        alarms: AlarmService,
        clock: Clock,
        delayed_after_seconds: int = 90,
        offline_after_seconds: int = 300,
        publisher: EventPublisher | None = None,
    ) -> None:
        self._repository = repository
        self._alarms = alarms
        self._clock = clock
        self._delayed_after = delayed_after_seconds
        self._offline_after = offline_after_seconds
        self._publisher = publisher

    def list_status(self) -> list[NodeStatus]:
        now = self._clock.now()
        last_seen = self._repository.last_seen_per_node(catalog.AIR_QUALITY_DOMAIN)
        return [self._status_of(node, last_seen.get((node.room, node.sensor)), now) for node in catalog.NODES]

    def record_seen(self, room: str, sensor: str, at: datetime.datetime) -> None:
        """A node just reported: clear any offline alarm it had open."""
        self._alarms.close_node_alarm(room, sensor, at)

    def check_offline(self) -> list[NodeStatus]:
        """Watchdog pass: raise an alarm for every node that went quiet."""
        statuses = self.list_status()
        now = self._clock.now()
        for status in statuses:
            if status.state is not NodeState.OFFLINE:
                continue
            since = status.last_seen or now
            minutes = max(1, int((now - since).total_seconds()) // 60)
            self._alarms.open_node_alarm(
                status.room,
                status.sensor,
                f'{status.label} silent for {minutes} min',
                now,
            )
        if self._publisher is not None:
            self._publisher.publish(
                'node_status',
                {'nodes': [{'room': s.room, 'sensor': s.sensor, 'state': str(s.state)} for s in statuses]},
            )
        return statuses

    def _status_of(
        self, node: catalog.NodeSpec, last_seen: datetime.datetime | None, now: datetime.datetime
    ) -> NodeStatus:
        if last_seen is None:
            return NodeStatus(node.room, node.sensor, node.label, NodeState.UNKNOWN, None, None)

        elapsed = int((now - last_seen).total_seconds())
        if elapsed >= self._offline_after:
            state = NodeState.OFFLINE
        elif elapsed >= self._delayed_after:
            state = NodeState.DELAYED
        else:
            state = NodeState.ONLINE
        return NodeStatus(node.room, node.sensor, node.label, state, last_seen, elapsed)
