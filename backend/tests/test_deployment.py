"""The production surface: device authentication and dashboard serving."""

import dataclasses
from pathlib import Path
from typing import Any, Iterator

import pytest
from flask import Flask
from flask.testing import FlaskClient

from hermes.api import register_api
from hermes.api.spa import register_spa
from hermes.config import Settings
from hermes.container import Services, build_services

from .conftest import FrozenClock, RecordingPublisher

READING = {'room': 'kitchen', 'sensor': 'mq2', 'gas': 38}


def _client(settings: Settings, clock: FrozenClock, publisher: RecordingPublisher) -> FlaskClient:
    services: Services = build_services(settings, publisher=publisher, clock=clock)
    services.database.migrate()

    app = Flask(__name__)
    app.config['TESTING'] = True
    register_api(app, services)
    if settings.frontend_dist:
        register_spa(app, Path(settings.frontend_dist))
    return app.test_client()


# ------------------------------------------------------------ device token


@pytest.fixture
def secured(settings: Settings, clock: FrozenClock, publisher: RecordingPublisher) -> FlaskClient:
    return _client(dataclasses.replace(settings, ingest_token='s3cret'), clock, publisher)


def test_a_node_with_the_token_is_accepted(secured: FlaskClient) -> None:
    response = secured.post('/api/air-quality/data', json=READING, headers={'X-Hermes-Token': 's3cret'})

    assert response.status_code == 201


def test_a_node_without_the_token_is_rejected(secured: FlaskClient) -> None:
    response = secured.post('/api/air-quality/data', json=READING)

    assert response.status_code == 401
    assert response.get_json()['status'] == 'error'


def test_a_node_with_the_wrong_token_is_rejected(secured: FlaskClient) -> None:
    response = secured.post('/api/air-quality/data', json=READING, headers={'X-Hermes-Token': 'guess'})

    assert response.status_code == 401


def test_the_token_never_gates_reads(secured: FlaskClient) -> None:
    """Only the write path is protected; the dashboard is behind the VPN."""
    assert secured.get('/api/air-quality/status').status_code == 200
    assert secured.get('/api/meta').status_code == 200


def test_ingestion_stays_open_when_no_token_is_configured(client: FlaskClient) -> None:
    assert client.post('/api/air-quality/data', json=READING).status_code == 201


# --------------------------------------------------------- dashboard files


@pytest.fixture
def dashboard(
    settings: Settings, clock: FrozenClock, publisher: RecordingPublisher, tmp_path: Any
) -> Iterator[FlaskClient]:
    dist = tmp_path / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('<!doctype html><title>HERMES</title>')
    (dist / 'assets' / 'app-abc123.js').write_text('console.log(1)')

    yield _client(dataclasses.replace(settings, frontend_dist=str(dist)), clock, publisher)


def test_the_root_serves_the_dashboard(dashboard: FlaskClient) -> None:
    response = dashboard.get('/')

    assert response.status_code == 200
    assert b'HERMES' in response.data


def test_hashed_assets_are_served_and_cached_hard(dashboard: FlaskClient) -> None:
    response = dashboard.get('/assets/app-abc123.js')

    assert response.status_code == 200
    assert 'immutable' in response.headers['Cache-Control']


def test_the_shell_is_never_cached(dashboard: FlaskClient) -> None:
    """A stale index.html would keep pointing at assets a deploy replaced."""
    assert dashboard.get('/').headers['Cache-Control'] == 'no-cache'


def test_a_client_side_route_falls_back_to_the_shell(dashboard: FlaskClient) -> None:
    response = dashboard.get('/history')

    assert response.status_code == 200
    assert b'HERMES' in response.data


def test_the_api_still_wins_over_the_catch_all(dashboard: FlaskClient) -> None:
    assert dashboard.get('/api/health').get_json()['data']['ok'] is True


def test_an_unknown_api_path_fails_as_json(dashboard: FlaskClient) -> None:
    response = dashboard.get('/api/does-not-exist')

    assert response.status_code == 404
    assert response.get_json()['status'] == 'error'


def test_a_relative_dist_path_is_resolved_against_the_working_directory(
    settings: Settings,
    clock: FrozenClock,
    publisher: RecordingPublisher,
    tmp_path: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Flask would otherwise resolve it inside the package and serve nothing."""
    dist = tmp_path / 'build'
    dist.mkdir()
    (dist / 'index.html').write_text('<!doctype html><title>HERMES</title>')
    monkeypatch.chdir(tmp_path)

    client = _client(dataclasses.replace(settings, frontend_dist='./build'), clock, publisher)

    assert client.get('/').status_code == 200
