"""HERMES backend entrypoint.

    python app.py            # development
    gunicorn -k eventlet wsgi:app   # or any WSGI server, see wsgi.py
"""

from hermes.config import Settings, load_env_file
from hermes.factory import create_app

load_env_file()

settings = Settings.from_env()
application = create_app(settings)

app = application.app
socketio = application.socketio

if __name__ == '__main__':
    socketio.run(
        app,
        host=settings.host,
        port=settings.port,
        debug=settings.debug,
        allow_unsafe_werkzeug=True,
    )
