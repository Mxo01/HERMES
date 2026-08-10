"""Socket.IO implementation of :class:`~hermes.domain.ports.EventPublisher`."""

from typing import Any

from flask_socketio import SocketIO


class SocketIOPublisher:
    def __init__(self, socketio: SocketIO) -> None:
        self._socketio = socketio

    def publish(self, event: str, payload: dict[str, Any]) -> None:
        self._socketio.emit(event, payload)


class NullPublisher:
    """No-op publisher, used in tests and CLI contexts."""

    def publish(self, event: str, payload: dict[str, Any]) -> None:
        return None
