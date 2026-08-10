"""Query-string parsing that fails with domain errors instead of 500s."""

import datetime

from flask import request

from ..domain.errors import ValidationError


def string_arg(name: str, default: str | None = None) -> str | None:
    value = request.args.get(name)
    return value.strip() if value and value.strip() else default


def int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == '':
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValidationError({name: 'Must be an integer'}) from None


def date_arg(name: str, default: datetime.date) -> datetime.date:
    raw = request.args.get(name)
    if raw is None or raw.strip() == '':
        return default
    try:
        return datetime.date.fromisoformat(raw.strip()[:10])
    except ValueError:
        raise ValidationError({name: 'Must be an ISO date (YYYY-MM-DD)'}) from None
