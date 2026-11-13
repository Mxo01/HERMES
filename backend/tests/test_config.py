"""Configuration: what the environment says, and what a broken value means.

Every setting has a documented default, and a value the deployment got wrong
must degrade to that default rather than crash the Pi at boot.
"""

from pathlib import Path

import pytest

from hermes import config
from hermes.config import PISA_LATITUDE, PISA_LONGITUDE, Settings, load_env_file


def test_the_defaults_are_the_documented_ones() -> None:
    testSubject = Settings.from_env({})

    assert testSubject.database_path == 'domotic.db'
    assert testSubject.port == 5001
    assert testSubject.debug is False
    assert testSubject.retention_days == 7
    assert testSubject.ingest_token is None
    assert testSubject.telegram.enabled is False
    assert testSubject.alarms.gas_threshold == 150.0
    assert testSubject.weather.latitude == PISA_LATITUDE
    assert testSubject.weather.longitude == PISA_LONGITUDE
    assert testSubject.weather.enabled is True


def test_the_environment_overrides_the_defaults() -> None:
    testSubject = Settings.from_env(
        {
            'DATABASE_PATH': '/var/lib/hermes/hermes.db',
            'PORT': '8080',
            'DEBUG': 'yes',
            'INGEST_TOKEN': 'node-secret',
            'TELEGRAM_BOT_TOKEN': 'bot-token',
            'TELEGRAM_CHAT_ID': '42',
            'GAS_ALERT_THRESHOLD': '200.5',
            'WEATHER_ENABLED': 'off',
        }
    )

    assert testSubject.database_path == '/var/lib/hermes/hermes.db'
    assert testSubject.port == 8080
    assert testSubject.debug is True
    assert testSubject.ingest_token == 'node-secret'
    assert testSubject.telegram.enabled is True
    assert testSubject.alarms.gas_threshold == 200.5
    assert testSubject.weather.enabled is False


def test_an_empty_value_is_read_as_absent() -> None:
    """`INGEST_TOKEN=` in a dotenv file means "no token", not an empty token."""
    testSubject = Settings.from_env({'INGEST_TOKEN': '', 'TELEGRAM_CHAT_ID': ''})

    assert testSubject.ingest_token is None
    assert testSubject.telegram.chat_id is None


@pytest.mark.parametrize(
    'value',
    [
        pytest.param('not-a-number', id='not a number'),
        pytest.param('', id='empty'),
        pytest.param('12.5', id='float for an int setting'),
    ],
)
def test_an_unparsable_int_falls_back_to_the_default(value: str) -> None:
    testSubject = Settings.from_env({'PORT': value})

    assert testSubject.port == 5001


@pytest.mark.parametrize(
    'value',
    [
        pytest.param('not-a-number', id='not a number'),
        pytest.param('', id='empty'),
    ],
)
def test_an_unparsable_float_falls_back_to_the_default(value: str) -> None:
    testSubject = Settings.from_env({'GAS_ALERT_THRESHOLD': value})

    assert testSubject.alarms.gas_threshold == 150.0


@pytest.mark.parametrize(
    'value,expected',
    [
        pytest.param('1', True, id='1'),
        pytest.param('true', True, id='true'),
        pytest.param(' TRUE ', True, id='padded and upper case'),
        pytest.param('yes', True, id='yes'),
        pytest.param('on', True, id='on'),
        pytest.param('0', False, id='0'),
        pytest.param('no', False, id='no'),
        pytest.param('anything else', False, id='anything else'),
    ],
)
def test_a_boolean_is_read_the_way_the_env_file_writes_it(value: str, expected: bool) -> None:
    testSubject = Settings.from_env({'DEBUG': value})

    assert testSubject.debug is expected


def test_a_dotenv_file_is_loaded_without_overriding_the_real_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / '.env'
    env_file.write_text(
        '\n'.join(
            [
                '# a comment',
                '',
                'HERMES_TEST_NEW=from-file',
                'HERMES_TEST_EXISTING=from-file',
                'QUOTED="quoted value"',
                'not a pair',
            ]
        )
    )
    monkeypatch.delenv('HERMES_TEST_NEW', raising=False)
    monkeypatch.setenv('HERMES_TEST_EXISTING', 'from-environment')

    load_env_file(str(env_file))

    assert config.os.environ['HERMES_TEST_NEW'] == 'from-file'
    assert config.os.environ['HERMES_TEST_EXISTING'] == 'from-environment'
    assert config.os.environ['QUOTED'] == 'quoted value'
    assert 'not a pair' not in config.os.environ


def test_a_missing_dotenv_file_is_not_an_error(tmp_path: Path) -> None:
    load_env_file(str(tmp_path / 'absent.env'))
