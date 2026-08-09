"""Gunicorn configuration for the Raspberry Pi.

Run with:  gunicorn -c gunicorn.conf.py wsgi:app
"""

import os

bind = f"{os.environ.get('HOST', '0.0.0.0')}:{os.environ.get('PORT', '5001')}"

# Exactly one worker, deliberately. The process owns the background jobs
# (downsampling, node watchdog, weather) and holds the Socket.IO client
# registry in memory; a second worker would duplicate every job and would only
# broadcast events to the clients it happens to hold. Scaling out would need a
# message queue, which three sensors do not justify.
workers = 1

# Socket.IO runs in threading mode, so concurrency comes from threads. Each
# polling client occupies one for the length of its long-poll.
threads = int(os.environ.get('GUNICORN_THREADS', 25))
worker_class = 'gthread'

# Long-polling connections are idle by design; the default 30s would kill them.
timeout = 120
graceful_timeout = 30
keepalive = 5

accesslog = None  # request logging comes from the app's own logger
errorlog = '-'
loglevel = os.environ.get('LOG_LEVEL', 'info')

proc_name = 'hermes'
