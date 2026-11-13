"""Socket.IO implementation of :class:`~hermes.domain.ports.EventPublisher`."""

from flask_socketio import SocketIO

from ...json_types import JsonObject


class SocketIOPublisher:
    def __init__(self, socketio: SocketIO) -> None:
        self._socketio = socketio

    def publish(self, event: str, payload: JsonObject) -> None:
        self._socketio.emit(event, payload)


class NullPublisher:
    """No-op publisher, used in tests and CLI contexts."""

    def publish(self, event: str, payload: JsonObject) -> None:
        return None
