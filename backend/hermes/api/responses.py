"""One response envelope for the whole API, plus the error handlers."""

import logging
from typing import Any

from flask import Flask, Response, jsonify
from werkzeug.exceptions import HTTPException

from ..domain.errors import DomainError, ValidationError

logger = logging.getLogger(__name__)


def success(data: Any, status_code: int = 200, **extra: Any) -> tuple[Response, int]:
    return jsonify({'status': 'success', 'data': data, **extra}), status_code


def failure(message: str, status_code: int = 400, errors: dict[str, str] | None = None) -> tuple[Response, int]:
    body: dict[str, Any] = {'status': 'error', 'message': message}
    if errors:
        body['errors'] = errors
    return jsonify(body), status_code


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ValidationError)
    def _on_validation_error(error: ValidationError) -> tuple[Response, int]:
        return failure(error.message, error.status_code, error.errors)

    @app.errorhandler(DomainError)
    def _on_domain_error(error: DomainError) -> tuple[Response, int]:
        return failure(str(error), error.status_code)

    @app.errorhandler(HTTPException)
    def _on_http_error(error: HTTPException) -> tuple[Response, int]:
        return failure(error.description or error.name, error.code or 500)

    @app.errorhandler(Exception)
    def _on_unexpected_error(error: Exception) -> tuple[Response, int]:
        logger.exception('Unhandled error', exc_info=error)
        return failure('Internal server error', 500)
