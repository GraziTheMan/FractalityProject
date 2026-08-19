"""
Finding local credentials for the integration tests.

Why this exists: the integration tests decided whether to run by reading
`os.getenv("NEO4J_URI")` directly, and nothing in that path loaded an env file. So
putting credentials in a file — any file, correctly named or not — could not work,
and the run reported "NEO4J_URI is not set" with no hint that a file it never read
was sitting right there.

Two smaller traps behind that one:

  * `.env.example` says to copy it to `.env.local`, because it began life as a
    frontend file and that is Vite's convention. The API's Settings loaded `.env`.
    Following the instruction printed in the file produced a file nothing read.
  * Every server-side line in `.env.example` is commented out, so copying it
    wholesale yields a file where `NEO4J_URI` is present but inert.

All three produced the same silent skip. The loading below fixes the first, Settings
now reads both filenames, and `skip_reason()` names whichever of these is actually
the case rather than restating that the variable is unset.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import List, Tuple

#: Searched in order; later files win, matching Vite's precedence so the two halves
#: of the project do not disagree about which file is the more specific one.
ENV_FILENAMES = (".env", ".env.local")

#: What the integration tests need before they can run.
REQUIRED = ("NEO4J_URI", "NEO4J_PASSWORD")

_loaded = False
_found_files: List[Path] = []
_commented: List[str] = []
#: Keys found in a file, and their values. Kept here rather than in os.environ so
#: reading this module cannot reconfigure anything else.
_values: dict = {}
#: Keys that appeared in a file at all, for reporting where a value came from.
_file_provided: set = set()


def repo_root() -> Path:
    """The directory holding api/, found by walking up from this file."""
    return Path(__file__).resolve().parents[2]


def load_env_files() -> None:
    """Read .env and .env.local into this module's own store, once.

    Deliberately does NOT write to os.environ. An earlier version did, and it was
    wrong twice over:

      * It leaked into other tests. `monkeypatch.delenv(key, raising=False)` on an
        absent key records nothing to undo, so a test that then set the key left it
        set — test_envfiles put NEO4J_URI into the session and test_feed's
        "503 without a database" check failed, but only in a full-suite run.
      * It reconfigured the application under test. api.main builds its Settings at
        import from ambient config, and the app's lifespan connects with them. So
        populating os.environ made the unit tests open a real connection to whatever
        database happened to be in the file.

    Values live here and are read explicitly by the code that wants them.
    """
    global _loaded
    if _loaded:
        return
    _loaded = True

    root = repo_root()
    for name in ENV_FILENAMES:
        path = root / name
        if not path.is_file():
            continue
        _found_files.append(path)
        for key, value, was_commented in _parse(path):
            if was_commented:
                if key in REQUIRED:
                    _commented.append(f"{name}:{key}")
                continue
            # Later files win over earlier ones. Neither wins over the real
            # environment — see get().
            _values[key] = value
            _file_provided.add(key)


def get(key: str, default: str = "") -> str:
    """The value for `key`: the real environment first, then the files.

    That precedence matters for safety, not just convention: the integration tests
    write to whatever database they are given, so `NEO4J_URI=... pytest` has to
    override a stale file rather than being quietly ignored by it.
    """
    load_env_files()
    from_env = os.environ.get(key)
    if from_env:
        return from_env
    return _values.get(key, default)


def _parse(path: Path) -> List[Tuple[str, str, bool]]:
    """Parse KEY=VALUE lines, reporting commented ones separately.

    Hand-rolled rather than using python-dotenv's loader because the commented
    lines are the interesting part here: a copied `.env.example` has the right keys
    with a `#` in front of every one, and silently ignoring them is how someone
    ends up certain they set a variable they did not.
    """
    out: List[Tuple[str, str, bool]] = []
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return out

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue

        commented = line.startswith("#")
        if commented:
            line = line.lstrip("#").strip()

        if "=" not in line:
            continue

        key, _, value = line.partition("=")
        key = key.strip()
        if not key or not key.replace("_", "").isalnum():
            continue

        value = value.strip()
        # Strip one layer of matching quotes, which people add out of habit and
        # which would otherwise become part of the password.
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        if commented and not value:
            # `# NEO4J_PASSWORD=` in the example file: a placeholder, not a setting
            # somebody forgot to uncomment. Reporting it would be noise.
            continue

        out.append((key, value, commented))
    return out


def skip_reason() -> str:
    """Why the integration tests are being skipped, in terms of what to do next.

    Returns '' when they can run.
    """
    load_env_files()

    missing = [name for name in REQUIRED if not get(name)]
    if not missing:
        return ""

    lines = [f"{' and '.join(missing)} not set — skipping Neo4j integration tests."]

    if _commented:
        lines.append(
            f"Found but COMMENTED OUT: {', '.join(_commented)}. "
            "Remove the leading '#'."
        )
    elif _found_files:
        names = ", ".join(p.name for p in _found_files)
        lines.append(
            f"Read {names} and found no value for {' or '.join(missing)}."
        )
    else:
        lines.append(
            f"No {' or '.join(ENV_FILENAMES)} in {repo_root()}. "
            "Create one with NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD "
            "from your AuraDB credentials file."
        )
        # The likeliest reason a file exists but was not found: an editor appended
        # an extension. On Windows, Notepad saving as ".env.local" without "All
        # Files" selected produces ".env.local.txt", and Explorer hides the ".txt"
        # — so the file looks correctly named while being invisible to every reader.
        nearby = sorted(
            p.name for p in repo_root().glob(".env*")
            if p.is_file() and p.name not in ENV_FILENAMES and p.name != ".env.example"
        )
        if nearby:
            lines.append(
                f"These look close but are not read: {', '.join(nearby)}. "
                "Rename to exactly '.env.local' — an editor may have added an "
                "extension that Explorer hides."
            )

    lines.append("See api/README.md, or run: python scripts/check_neo4j.py")
    return " ".join(lines)


def source_of(key: str) -> str:
    """Where get(key) is taking its value from: the real environment, or a file."""
    load_env_files()
    if os.environ.get(key):
        return "the environment"
    if key in _file_provided:
        return _found_files[-1].name if _found_files else "a file"
    return "nowhere"


def target_description() -> str:
    """Which database the tests are about to write to, for printing before they do.

    These tests create and delete data. Which host that happens on should never be
    something the person running them has to infer — and the source is reported for
    the URI specifically, because that is the value that decides which database. An
    earlier version credited the file whenever any value came from one, which said
    "from .env.local" for a URI that had been overridden in the shell.
    """
    uri = get("NEO4J_URI")
    user = get("NEO4J_USERNAME") or get("NEO4J_USER") or "neo4j"
    return f"{uri} as {user} (URI from {source_of('NEO4J_URI')})"
