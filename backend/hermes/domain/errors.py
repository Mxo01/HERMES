class DomainError(Exception):
    """Base class for errors the API layer knows how to translate."""

    status_code: int = 400


class ValidationError(DomainError):
    """Raised when a request or payload cannot be accepted as-is."""

    status_code = 400

    def __init__(self, errors: dict[str, str], message: str = 'Invalid request'):
        super().__init__(message)
        self.errors = errors
        self.message = message
