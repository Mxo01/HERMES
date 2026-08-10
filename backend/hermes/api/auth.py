"""Device authentication for the ingestion endpoint.

The nodes post over plain HTTP on the home LAN — an ESP8266 cannot join the
VPN that protects the dashboard. Without a shared secret, anything on the same
Wi-Fi (a guest, a compromised smart plug) could inject readings, including a
fake gas spike that would reach Telegram.

The token is optional: with none configured the endpoint stays open, which
keeps development and the demo data script frictionless.
"""

import hmac
import logging

from flask import request

from ..domain.errors import DomainError

logger = logging.getLogger(__name__)

HEADER = 'X-Hermes-Token'


class UnauthorizedError(DomainError):
    status_code = 401


def verify_device_token(expected: str | None) -> None:
    """Raise :class:`UnauthorizedError` unless the request carries the token."""
    if not expected:
        return

    presented = request.headers.get(HEADER, '')
    # Constant-time comparison: a timing oracle here would leak the token
    # byte by byte to anyone able to reach the endpoint.
    if not hmac.compare_digest(presented, expected):
        logger.warning('Rejected ingestion from %s: bad or missing device token', request.remote_addr)
        raise UnauthorizedError('Invalid or missing device token')
