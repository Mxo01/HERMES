"""Where the installation is.

The house does not move, so the coordinates are configuration, not something
to discover at runtime. They default to Pisa and can be overridden through the
environment — see ``.env.example``.
"""

from ...domain.models import Coordinates


class StaticLocation:
    """Fixed coordinates for the installation."""

    def __init__(self, latitude: float, longitude: float, label: str | None = None) -> None:
        self._coordinates = Coordinates(latitude, longitude, label, source='configured')

    def resolve(self) -> Coordinates | None:
        return self._coordinates

    def cached(self) -> Coordinates | None:
        return self._coordinates
