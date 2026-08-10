"""WSGI entrypoint for production servers."""

from app import app, socketio

__all__ = ['app', 'socketio']
