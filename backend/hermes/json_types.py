"""The JSON boundary.

Payloads arriving from the sensor nodes and from Open-Meteo are arbitrary JSON:
nothing about them can be trusted until it has been checked. ``JsonObject`` is
``dict[str, object]`` rather than ``dict[str, Any]`` on purpose — a value read
out of it can only be used after an ``isinstance`` narrowing, so the type
checker refuses the "it is probably a string" that ``Any`` would wave through.
"""

from typing import TypeAlias, cast

#: A decoded JSON object whose values are still unverified.
JsonObject: TypeAlias = dict[str, object]


def as_object(value: object) -> JsonObject | None:
    """Narrow an untrusted value to a JSON object, or ``None`` if it is not one.

    JSON object keys are always strings, so the cast is what ``isinstance``
    already proved; the values stay ``object`` and still need their own check.
    """
    if not isinstance(value, dict):
        return None
    return cast(JsonObject, value)
