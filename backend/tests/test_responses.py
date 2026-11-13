"""One error envelope for the whole API.

The point of handling errors centrally is that no endpoint can leak a stack
trace or a third-party message to a dashboard, so that guarantee is pinned here
against a route that fails on purpose.
"""

from collections.abc import Iterator

import pytest
from flask import Flask
from flask.testing import FlaskClient
from flask.typing import ResponseReturnValue

from hermes.api.responses import failure, register_error_handlers, success
from hermes.domain.errors import DomainError, ValidationError

DOMAIN_ERROR_STATUS = 409
VALIDATION_MESSAGE = 'room is unknown'
FIELD_ERRORS = {'room': 'Unknown room. Must be one of: kitchen'}
SECRET_DETAIL = 'the database password is hunter2'


class ConflictError(DomainError):
    status_code = DOMAIN_ERROR_STATUS


@pytest.fixture
def context() -> Iterator[None]:
    """`jsonify` needs an application to serialize against, even outside a request."""
    with Flask(__name__).app_context():
        yield


@pytest.fixture
def client() -> FlaskClient:
    app = Flask(__name__)
    register_error_handlers(app)

    @app.get('/domain-error')
    def _domain_error() -> ResponseReturnValue:
        raise ConflictError('already exists')

    @app.get('/validation-error')
    def _validation_error() -> ResponseReturnValue:
        raise ValidationError(FIELD_ERRORS, VALIDATION_MESSAGE)

    @app.get('/unexpected-error')
    def _unexpected_error() -> ResponseReturnValue:
        raise RuntimeError(SECRET_DETAIL)

    return app.test_client()


def test_success_wraps_the_payload_and_the_extra_fields(context: None) -> None:
    response, status = success({'ok': True}, 201, extra='value')

    assert status == 201
    assert response.get_json() == {
        'status': 'success',
        'data': {'ok': True},
        'extra': 'value',
    }


def test_failure_carries_the_field_errors(context: None) -> None:
    response, status = failure(VALIDATION_MESSAGE, 400, FIELD_ERRORS)

    assert status == 400
    assert response.get_json() == {
        'status': 'error',
        'message': VALIDATION_MESSAGE,
        'errors': FIELD_ERRORS,
    }


def test_failure_without_field_errors_omits_the_key(context: None) -> None:
    response, _status = failure('gone', 404)

    assert 'errors' not in response.get_json()


def test_a_domain_error_maps_to_its_own_status(client: FlaskClient) -> None:
    response = client.get('/domain-error')

    assert response.status_code == DOMAIN_ERROR_STATUS
    assert response.get_json() == {'status': 'error', 'message': 'already exists'}


def test_a_validation_error_carries_the_fields_that_failed(client: FlaskClient) -> None:
    response = client.get('/validation-error')

    assert response.status_code == 400
    assert response.get_json()['errors'] == FIELD_ERRORS


def test_an_unexpected_error_is_a_500_without_the_internals(client: FlaskClient) -> None:
    response = client.get('/unexpected-error')

    assert response.status_code == 500
    assert response.get_json() == {'status': 'error', 'message': 'Internal server error'}
    assert SECRET_DETAIL not in response.get_data(as_text=True)
