import pytest

from hermes.container import Services
from hermes.domain.errors import ValidationError

from .conftest import RecordingPublisher


def test_ingest_stores_every_metric_of_the_payload(services: Services) -> None:
    services.ingestion.ingest(
        {'room': 'kitchen', 'sensor': 'mq135', 'temperature': 21.4, 'humidity': 54, 'aq': 62}
    )

    latest = services.readings.latest()
    assert latest['kitchen']['temperature'].value == pytest.approx(21.4)
    assert latest['kitchen']['humidity'].value == pytest.approx(54)
    assert latest['kitchen']['aq'].value == pytest.approx(62)


def test_ingest_normalises_room_and_sensor_casing(services: Services) -> None:
    reading = services.ingestion.ingest({'room': ' Kitchen ', 'sensor': 'MQ2', 'gas': 40})

    assert reading.room == 'kitchen'
    assert reading.sensor == 'mq2'


def test_ingest_broadcasts_a_sensor_update(services: Services, publisher: RecordingPublisher) -> None:
    services.ingestion.ingest({'room': 'bedroom', 'sensor': 'mq2', 'gas': 12})

    assert 'sensor_update' in publisher.names()


@pytest.mark.parametrize(
    'payload,field',
    [
        ({'room': 'garage', 'sensor': 'mq2', 'gas': 10}, 'room'),
        ({'room': 'kitchen', 'sensor': 'dht99', 'gas': 10}, 'sensor'),
        ({'room': 'kitchen', 'sensor': 'mq2'}, 'gas'),
        ({'room': 'kitchen', 'sensor': 'mq2', 'gas': 5000}, 'gas'),
        ({'room': 'kitchen', 'sensor': 'mq2', 'gas': 'high'}, 'gas'),
        ({'room': 'kitchen', 'sensor': 'mq135', 'temperature': 20}, 'humidity'),
    ],
)
def test_ingest_rejects_bad_payloads(services: Services, payload: dict[str, object], field: str) -> None:
    with pytest.raises(ValidationError) as caught:
        services.ingestion.ingest(payload)

    assert field in caught.value.errors


def test_ingest_rejects_a_non_object_body(services: Services) -> None:
    with pytest.raises(ValidationError):
        services.ingestion.ingest(None)


def test_outside_room_cannot_be_written_by_a_node(services: Services) -> None:
    with pytest.raises(ValidationError) as caught:
        services.ingestion.ingest({'room': 'outside', 'sensor': 'mq135', 'temperature': 14, 'humidity': 71, 'aq': 38})

    assert 'room' in caught.value.errors
