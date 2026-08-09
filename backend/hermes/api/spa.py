"""Serving the built dashboard.

The Pi runs one process: Flask serves both the API and the compiled frontend.
That removes nginx from the picture, keeps everything same-origin (so CORS is
not needed in production), and means the Pi never has to build anything — the
``dist`` directory arrives already compiled.
"""

import logging
from pathlib import Path

from flask import Flask, Response, send_from_directory

from .responses import failure

logger = logging.getLogger(__name__)

#: Hashed asset filenames may be cached forever; index.html must not be.
ASSET_MAX_AGE = 60 * 60 * 24 * 365


def register_spa(app: Flask, dist_dir: Path) -> None:
    """Serve ``dist`` at the root, leaving ``/api`` to the blueprints."""
    # Flask resolves relative paths against the package directory, not the
    # working directory, so FRONTEND_DIST=../frontend/dist would silently
    # resolve inside hermes/ and 404 on every request.
    dist_dir = dist_dir.resolve()

    if not dist_dir.is_dir():
        logger.warning(
            'Frontend build not found at %s — the API will run but the dashboard '
            'will not be served. Run "npm run build" or deploy a release.',
            dist_dir,
        )
        return

    index = dist_dir / 'index.html'

    @app.get('/', defaults={'path': ''})
    @app.get('/<path:path>')
    def dashboard(path: str) -> Response | tuple[Response, int]:
        # Explicit /api rules win over this catch-all, but an unmatched API
        # path must still fail as JSON rather than silently returning the app.
        if path.startswith('api/'):
            return failure('Not found', 404)

        requested = dist_dir / path
        if path and requested.is_file():
            response = send_from_directory(dist_dir, path)
            if requested.parent.name == 'assets':
                response.headers['Cache-Control'] = f'public, max-age={ASSET_MAX_AGE}, immutable'
            return response

        # Any other path is a client-side route: hand back the shell.
        response = send_from_directory(dist_dir, index.name)
        response.headers['Cache-Control'] = 'no-cache'
        return response

    logger.info('Serving dashboard from %s', dist_dir)
