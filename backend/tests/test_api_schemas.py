"""The wire format: every value the dashboard receives is shaped here."""

import datetime

from hermes.api import schemas
from hermes.domain import catalog
from hermes.domain.models import Coordinates, DailyPoint, Resolution


def test_a_missing_location_is_null_not_an_empty_object() -> None:
    assert schemas.location(None) is None


def test_a_location_is_rounded_to_four_decimals() -> None:
    coordinates = Coordinates(43.722839, 10.401689, 'Pisa, Italy', 'configured')

    assert schemas.location(coordinates) == {
        'latitude': 43.7228,
        'longitude': 10.4017,
        'label': 'Pisa, Italy',
        'source': 'configured',
    }


def test_a_daily_point_carries_its_resolution_and_alarm_count() -> None:
    point = DailyPoint(
        room=catalog.KITCHEN,
        metric=catalog.GAS,
        day=datetime.date(2026, 8, 9),
        avg=40.0,
        min=30.0,
        max=50.0,
        count=12,
        resolution=Resolution.HOURLY,
        alarms=2,
    )

    assert schemas.daily_point(point) == {
        'room': catalog.KITCHEN,
        'metric': catalog.GAS,
        'day': '2026-08-09',
        'avg': 40.0,
        'min': 30.0,
        'max': 50.0,
        'count': 12,
        'resolution': str(Resolution.HOURLY),
        'alarms': 2,
    }
