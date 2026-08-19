"""
Test setup shared by every test in this package.

Two jobs.

**Load env files before the test modules import.** That ordering is the point: the
integration tests decide whether to run with a module-level `skipif`, evaluated at
import time, and pytest imports conftest.py first. Without this, credentials in a
file could not be found by anything — the check read os.environ directly and no env
file was ever loaded — so a correctly filled-in file produced the same silent skip as
no file at all.

**Keep os.environ changes from escaping one test.** See `isolate_environment`.
"""

import os

import pytest

from api.settings import Settings

from .envfiles import load_env_files

load_env_files()

# Keep Settings from reading .env / .env.local for the duration of the test run.
#
# api.main builds its Settings at import time from ambient config, and the app's
# lifespan connects with them — so on a machine with real credentials in a file, the
# unit tests opened a connection to that database and, with an unreachable host,
# hung during collection with no output at all.
#
# Set before any test module imports api.main, which is why it is here at module
# level rather than in a fixture. The integration tests pass _env_file=None and their
# values explicitly, so they are unaffected.
Settings.model_config["env_file"] = None


@pytest.fixture(autouse=True)
def isolate_environment():
    """Snapshot os.environ before each test and restore it after.

    Here rather than in one test module, because the failure it prevents is a
    cross-file one and any future test that touches the environment inherits the
    protection.

    monkeypatch is not sufficient and the reason is subtle: `monkeypatch.delenv(key,
    raising=False)` on a key that is ABSENT records nothing to undo, because there
    was nothing to delete. Code under test that then SETS that key leaves it set,
    with monkeypatch unaware it ever existed. That is exactly what happened —
    test_envfiles leaked NEO4J_URI and NEO4J_PASSWORD into test_feed, which then saw
    a configured database and failed its 503 test. Only in a full-suite run, never
    when either file ran alone.
    """
    saved = dict(os.environ)
    try:
        yield
    finally:
        os.environ.clear()
        os.environ.update(saved)
