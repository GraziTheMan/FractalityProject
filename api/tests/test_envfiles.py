"""
Finding local credentials.

This is small logic with a large failure mode: get it wrong and the integration
tests skip while telling you a variable is unset, which is what happened before it
existed. The tests below are mostly about precedence and about the ways a file can
look correct while being inert.

`_reset` is essential — envfiles caches after its first load, and every test here
needs a fresh view of a different fake repository.
"""

import os

import pytest

from api.tests import envfiles


@pytest.fixture
def env(tmp_path, monkeypatch):
    """A throwaway repo root, with envfiles' module state reset around it."""
    monkeypatch.setattr(envfiles, "_loaded", False)
    monkeypatch.setattr(envfiles, "_found_files", [])
    monkeypatch.setattr(envfiles, "_commented", [])
    monkeypatch.setattr(envfiles, "_values", {})
    monkeypatch.setattr(envfiles, "_file_provided", set())
    monkeypatch.setattr(envfiles, "repo_root", lambda: tmp_path)

    # Popped, not monkeypatched: load_env_files writes to the real environment, and
    # monkeypatch.delenv on an absent key records nothing to undo. Restoring is
    # conftest's isolate_environment fixture, which snapshots the whole environment.
    for key in ("NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD", "SOME_OTHER"):
        os.environ.pop(key, None)
    return tmp_path


def write(root, name, text):
    (root / name).write_text(text, encoding="utf-8")


# --- loading ---------------------------------------------------------------


def test_values_are_readable(env):
    write(env, ".env.local", "NEO4J_URI=neo4j+s://a.test\nNEO4J_PASSWORD=secret\n")

    assert envfiles.get("NEO4J_URI") == "neo4j+s://a.test"
    assert envfiles.get("NEO4J_PASSWORD") == "secret"


def test_values_do_not_reach_os_environ(env):
    """
    The loader must not reconfigure the process. api.main builds its Settings from
    ambient config at import and its lifespan connects with them, so injecting a real
    URI here made the unit tests open a connection to that database — and hang during
    collection when the host was unreachable.
    """
    write(env, ".env.local", "NEO4J_URI=neo4j+s://a.test\nNEO4J_PASSWORD=secret\n")
    envfiles.load_env_files()

    assert "NEO4J_URI" not in os.environ
    assert "NEO4J_PASSWORD" not in os.environ


def test_a_missing_file_is_not_an_error(env):
    envfiles.load_env_files()
    assert envfiles.skip_reason() != ""


def test_loading_twice_does_not_reread(env):
    write(env, ".env", "NEO4J_URI=first\n")
    envfiles.load_env_files()
    write(env, ".env", "NEO4J_URI=second\n")
    envfiles.load_env_files()
    assert envfiles.get("NEO4J_URI") == "first"


# --- precedence ------------------------------------------------------------


def test_env_local_beats_env(env):
    write(env, ".env", "NEO4J_URI=from-plain\n")
    write(env, ".env.local", "NEO4J_URI=from-local\n")
    assert envfiles.get("NEO4J_URI") == "from-local"


def test_the_real_environment_beats_every_file(env, monkeypatch):
    """
    The safety-relevant one. These tests write to whatever database they are given,
    so `NEO4J_URI=... pytest` has to override a stale file rather than being quietly
    ignored by it.
    """
    monkeypatch.setenv("NEO4J_URI", "from-shell")
    write(env, ".env", "NEO4J_URI=from-plain\n")
    write(env, ".env.local", "NEO4J_URI=from-local\n")
    assert envfiles.get("NEO4J_URI") == "from-shell"


def test_the_source_is_reported_per_key(env, monkeypatch):
    monkeypatch.setenv("NEO4J_URI", "from-shell")
    write(env, ".env.local", "NEO4J_URI=from-local\nNEO4J_USERNAME=from-local\n")
    envfiles.load_env_files()

    assert envfiles.source_of("NEO4J_URI") == "the environment"
    assert envfiles.source_of("NEO4J_USERNAME") == ".env.local"
    # And the printed line credits the shell, not the file, for the URI — an earlier
    # version credited the file whenever ANY value came from one.
    assert "URI from the environment" in envfiles.target_description()


# --- parsing ---------------------------------------------------------------


def test_quotes_are_stripped(env):
    write(env, ".env.local", 'NEO4J_URI="neo4j+s://a.test"\nNEO4J_PASSWORD=\'p@ss\'\n')
    assert envfiles.get("NEO4J_URI") == "neo4j+s://a.test"
    # Otherwise the quote becomes part of the password and the failure is an
    # authentication error that looks like a wrong password.
    assert envfiles.get("NEO4J_PASSWORD") == "p@ss"


def test_a_password_containing_an_equals_sign_survives(env):
    # Base64-ish Aura passwords contain '=' regularly, and splitting on every one
    # would silently truncate them.
    write(env, ".env.local", "NEO4J_PASSWORD=ab==cd=\n")
    assert envfiles.get("NEO4J_PASSWORD") == "ab==cd="


def test_surrounding_whitespace_is_trimmed(env):
    write(env, ".env.local", "  NEO4J_URI = neo4j+s://a.test  \n")
    assert envfiles.get("NEO4J_URI") == "neo4j+s://a.test"


def test_comments_and_blank_lines_are_skipped(env):
    write(env, ".env.local", "\n# a comment\n\nNEO4J_URI=a\n")
    assert envfiles.get("NEO4J_URI") == "a"
    assert envfiles.get("a comment") == ""


def test_a_commented_setting_does_not_take_effect(env):
    write(env, ".env.local", "# NEO4J_URI=neo4j+s://a.test\n")
    assert envfiles.get("NEO4J_URI") == ""


# --- the skip reason -------------------------------------------------------


def test_a_complete_file_means_no_skip(env):
    write(env, ".env.local", "NEO4J_URI=a\nNEO4J_PASSWORD=b\n")
    assert envfiles.skip_reason() == ""


def test_a_uri_without_a_password_still_skips(env):
    write(env, ".env.local", "NEO4J_URI=a\n")
    reason = envfiles.skip_reason()
    assert "NEO4J_PASSWORD" in reason
    assert "NEO4J_URI" not in reason.split("—")[0]


def test_a_commented_setting_is_called_out_by_name(env):
    """The copied-example case: right names, every one inert."""
    write(env, ".env.local", "# NEO4J_URI=neo4j+s://a.test\n# NEO4J_PASSWORD=x\n")
    reason = envfiles.skip_reason()
    assert "COMMENTED OUT" in reason
    assert ".env.local:NEO4J_URI" in reason
    assert "Remove the leading '#'" in reason


def test_an_example_placeholder_is_not_reported_as_commented_out(env):
    """
    `# NEO4J_PASSWORD=` with no value is a placeholder, not something forgotten.
    Reporting it would be noise on top of the real message.
    """
    write(env, ".env.local", "# NEO4J_PASSWORD=\n# NEO4J_URI=neo4j+s://a.test\n")
    reason = envfiles.skip_reason()
    assert "NEO4J_PASSWORD" not in reason.split("COMMENTED OUT")[1].split(".")[0]


def test_a_file_that_was_read_says_so(env):
    write(env, ".env.local", "VITE_API_BASE=https://x.test\n")
    reason = envfiles.skip_reason()
    assert "Read .env.local" in reason


def test_no_file_names_the_directory_searched(env):
    reason = envfiles.skip_reason()
    assert str(env) in reason
    assert ".env or .env.local" in reason


def test_a_misnamed_file_is_pointed_out(env):
    """
    The Windows case: Notepad saving as ".env.local" without "All Files" produces
    ".env.local.txt", and Explorer hides the extension — so the file looks correctly
    named while being invisible to every reader of it.
    """
    write(env, ".env.local.txt", "NEO4J_URI=a\nNEO4J_PASSWORD=b\n")
    reason = envfiles.skip_reason()
    assert ".env.local.txt" in reason
    assert "extension" in reason


def test_the_example_file_is_not_offered_as_a_misnamed_one(env):
    write(env, ".env.example", "# NEO4J_URI=\n")
    reason = envfiles.skip_reason()
    assert ".env.example" not in reason.replace("api/README.md", "")


def test_the_skip_reason_always_says_where_to_look(env):
    assert "check_neo4j" in envfiles.skip_reason()


# --- startup must not hang -------------------------------------------------


def test_startup_gives_up_on_an_unresponsive_database(monkeypatch):
    """
    The lifespan's try/except cannot catch a hang, only a raise.

    An unreachable host does not raise — it blocks. DNS that never answers, or a
    paused Aura instance behind a TLS handshake that never completes, held startup
    open indefinitely: on Render a deploy that never goes live and reports nothing,
    locally a test run that hung during collection with no output at all. The intent
    was always "boot anyway and let /health report it", and that needs a deadline to
    be real.
    """
    import asyncio

    from api import main as api_main

    async def never_answers():
        await asyncio.sleep(3600)

    monkeypatch.setattr(api_main, "_connect_database", never_answers)
    monkeypatch.setattr(api_main.settings, "startup_db_timeout_seconds", 0.05)

    async def boot():
        # A deadline of its own, an order of magnitude above the one under test. A
        # test for "this must not hang" that hangs when it fails is nearly as useless
        # as no test: it stops the suite dead with no output instead of telling you
        # what broke.
        async def start():
            async with api_main.lifespan(api_main.app):
                return "booted"

        return await asyncio.wait_for(start(), timeout=5)

    assert asyncio.run(boot()) == "booted", "startup did not give up on a dead database"


def test_startup_survives_a_database_that_raises(monkeypatch):
    """The pre-existing behaviour, kept: a refused connection must not stop boot."""
    import asyncio

    from api import main as api_main

    async def refuses():
        raise OSError("connection refused")

    monkeypatch.setattr(api_main, "_connect_database", refuses)

    async def boot():
        async with api_main.lifespan(api_main.app):
            return "booted"

    assert asyncio.run(boot()) == "booted"
