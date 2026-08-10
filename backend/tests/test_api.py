from typing import Any

from flask.testing import FlaskClient


def _post(client: FlaskClient, payload: dict[str, Any]) -> Any:
    return client.post('/api/air-quality/data', json=payload)


def test_the_firmware_endpoint_accepts_a_node_payload(client: FlaskClient) -> None:
    response = _post(client, {'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})

    assert response.status_code == 201
    assert response.get_json()['status'] == 'success'


def test_a_bad_payload_returns_field_level_errors(client: FlaskClient) -> None:
    response = _post(client, {'room': 'garage', 'sensor': 'mq2', 'gas': 38})

    assert response.status_code == 400
    body = response.get_json()
    assert body['status'] == 'error'
    assert 'room' in body['errors']


def test_a_non_json_body_is_rejected(client: FlaskClient) -> None:
    response = client.post('/api/air-quality/data', data='not json', content_type='text/plain')

    assert response.status_code == 400


def test_status_returns_the_latest_value_per_room(client: FlaskClient) -> None:
    _post(client, {'room': 'kitchen', 'sensor': 'mq135', 'temperature': 21.4, 'humidity': 54, 'aq': 62})

    data = client.get('/api/air-quality/status').get_json()['data']

    assert data['kitchen']['temperature']['value'] == 21.4
    assert data['kitchen']['temperature']['timestamp'].startswith('2026-08-09')


def test_history_returns_hourly_points(client: FlaskClient) -> None:
    _post(client, {'room': 'kitchen', 'sensor': 'mq2', 'gas': 38})

    response = client.get('/api/air-quality/history?room=kitchen&metric=gas&hours=24')

    assert response.status_code == 200
    points = response.get_json()['data']
    assert points[0]['room'] == 'kitchen'
    assert points[0]['count'] == 1


def test_history_rejects_a_non_numeric_window(client: FlaskClient) -> None:
    assert client.get('/api/air-quality/history?hours=lots').status_code == 400


def test_daily_defaults_to_a_two_week_range(client: FlaskClient) -> None:
    response = client.get('/api/air-quality/daily?room=kitchen&metric=temperature')

    assert response.status_code == 200
    assert response.get_json()['range'] == {'from': '2026-07-27', 'to': '2026-08-09'}


def test_daily_rejects_a_malformed_date(client: FlaskClient) -> None:
    assert client.get('/api/air-quality/daily?from=yesterday').status_code == 400


def test_the_alarm_log_lists_the_breach_that_just_happened(client: FlaskClient) -> None:
    _post(client, {'room': 'kitchen', 'sensor': 'mq2', 'gas': 180})

    alarms = client.get('/api/alarms?days=14').get_json()['data']

    assert len(alarms) == 1
    assert alarms[0]['kind'] == 'gas'
    assert alarms[0]['severity'] == 'high'
    assert alarms[0]['active'] is True


def test_nodes_lists_every_board_in_the_installation(client: FlaskClient) -> None:
    nodes = client.get('/api/nodes').get_json()['data']

    assert [node['label'] for node in nodes] == ['Node A', 'Node B', 'Node C']


def test_meta_describes_thresholds_retention_and_metrics(client: FlaskClient) -> None:
    meta = client.get('/api/meta').get_json()['data']

    assert meta['thresholds']['gas'] == 150.0
    assert meta['retention']['rawDays'] == 7
    assert meta['metrics']['temperature']['unit'] == '°C'
    assert meta['outsideAvailable'] is False
    assert 'outside' in meta['rooms']


def test_health_is_reachable(client: FlaskClient) -> None:
    assert client.get('/api/health').get_json()['data']['ok'] is True


def test_an_unknown_route_returns_the_error_envelope(client: FlaskClient) -> None:
    response = client.get('/api/nope')

    assert response.status_code == 404
    assert response.get_json()['status'] == 'error'
