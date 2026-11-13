"""The application factory: which jobs run, and when they are allowed to start.

The job list is a deployment decision — enabling Telegram or the outdoor feed
must be the only thing that changes it — and the reloader guard is what keeps
`make dev` from running every job twice.
"""

import dataclasses

import pytest

from hermes.config import Settings, TelegramSettings
from hermes.factory import create_app


def _job_names(settings: Settings, *, start_jobs: bool = False) -> list[str]:
    application = create_app(settings, start_jobs=start_jobs)
    application.scheduler.stop()
    return [job.name for job in application.scheduler.jobs]


def test_the_always_on_jobs_are_registered(settings: Settings) -> None:
    assert _job_names(settings) == ['downsampling', 'node-watchdog']


def test_telegram_adds_the_notification_job(settings: Settings) -> None:
    configured = dataclasses.replace(
        settings, telegram=TelegramSettings(bot_token='token', chat_id='42', cooldown_seconds=60)
    )

    assert 'notifications' in _job_names(configured)


def test_the_outdoor_feed_adds_its_sync_and_backfill_jobs(settings: Settings) -> None:
    configured = dataclasses.replace(settings, weather=dataclasses.replace(settings.weather, enabled=True))

    names = _job_names(configured)

    assert 'weather-sync' in names
    assert 'weather-backfill' in names


def test_jobs_stay_idle_when_the_caller_asks_them_to(settings: Settings) -> None:
    application = create_app(settings, start_jobs=False)

    assert application.scheduler.started is False


def test_debug_mode_does_not_start_jobs_under_the_reloader_parent(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv('WERKZEUG_RUN_MAIN', raising=False)

    application = create_app(dataclasses.replace(settings, debug=True), start_jobs=True)
    try:
        assert application.scheduler.started is False
    finally:
        application.scheduler.stop()


def test_debug_mode_starts_jobs_in_the_reloader_child(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv('WERKZEUG_RUN_MAIN', 'true')

    application = create_app(dataclasses.replace(settings, debug=True), start_jobs=True)
    try:
        assert application.scheduler.started is True
    finally:
        application.scheduler.stop()


def test_the_application_carries_its_services_and_a_migrated_database(
    settings: Settings,
) -> None:
    application = create_app(settings, start_jobs=False)

    assert application.services.settings is settings
    assert application.services.readings.latest() == {}
