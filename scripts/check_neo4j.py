#!/usr/bin/env python
"""
scripts/check_neo4j.py

Diagnose a Neo4j / AuraDB connection and say plainly what is wrong.

    python scripts/check_neo4j.py

Reads NEO4J_URI, NEO4J_USER (or NEO4J_USERNAME), NEO4J_PASSWORD and
NEO4J_DATABASE from the environment. Prints no secrets.

Deliberately uses the SYNCHRONOUS driver even though the app is async: this has
to work reliably as a one-shot script, and async-on-Windows adds event-loop
failure modes that obscure the very problem we are trying to diagnose.

Checks, in order, stopping at the first that fails:
    1. env vars present and plausibly shaped
    2. DNS resolves
    3. TCP + TLS handshake reaches the server
    4. credentials are accepted
    5. the target database exists and answers a query
    6. write permission
"""

from __future__ import annotations

import os
import socket
import sys
from urllib.parse import urlparse

try:
    from neo4j import GraphDatabase
    from neo4j.exceptions import (
        AuthError,
        ClientError,
        ConfigurationError,
        ServiceUnavailable,
    )
except ImportError:
    print("FAIL  The neo4j driver is not installed.")
    print("      Fix:  pip install -r api/requirements.txt")
    sys.exit(2)


GREEN, RED, YELLOW, DIM, RESET = "\033[32m", "\033[31m", "\033[33m", "\033[2m", "\033[0m"

# Suppress colour when output is not a terminal (piped or redirected), and on
# legacy Windows consoles that print the escape codes literally.
if not sys.stdout.isatty() or (os.name == "nt" and not os.getenv("WT_SESSION")):
    GREEN = RED = YELLOW = DIM = RESET = ""


def ok(msg: str) -> None:
    print(f"{GREEN}  OK  {RESET}{msg}")


def fail(msg: str, *fixes: str) -> None:
    print(f"{RED} FAIL {RESET}{msg}")
    for f in fixes:
        print(f"       -> {f}")


def warn(msg: str) -> None:
    print(f"{YELLOW} WARN {RESET}{msg}")


def main() -> int:
    print("Neo4j connection check")
    print("=" * 66)

    uri = os.getenv("NEO4J_URI", "").strip()
    # Aura's downloaded credentials file calls it NEO4J_USERNAME; accept both.
    user = (os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME") or "neo4j").strip()
    password = os.getenv("NEO4J_PASSWORD", "")
    # Empty means "let the server choose". Deliberately NOT defaulted to "neo4j":
    # forcing that name is what produced DatabaseNotFound on an instance whose
    # default database is called something else.
    database = (os.getenv("NEO4J_DATABASE") or "").strip()

    # --- 1. environment ---------------------------------------------------
    if not uri:
        fail(
            "NEO4J_URI is not set.",
            "PowerShell:  $env:NEO4J_URI = 'neo4j+s://xxxxxxxx.databases.neo4j.io'",
            "These variables only live in the current terminal window.",
        )
        return 1
    if not password:
        fail(
            "NEO4J_PASSWORD is not set.",
            "It is in the credentials file Aura made you download at creation.",
            "Lost it? Reset it from the Aura console; it is shown only once.",
        )
        return 1

    print(f"  URI      {uri}")
    print(f"  user     {user}")
    print(f"  password {'*' * 8} ({len(password)} chars)")
    print(f"  database {database or '<server default>'}")
    print()

    # Note: current AuraDB issues the INSTANCE ID as the username (matching the
    # URI subdomain), not "neo4j". Both are valid depending on when the instance
    # was created, so neither is warned about here.

    parsed = urlparse(uri)
    host = parsed.hostname
    port = parsed.port or 7687

    if not parsed.scheme.startswith(("neo4j", "bolt")):
        fail(f"URI scheme {parsed.scheme!r} is not a Neo4j scheme.",
             "AuraDB URIs look like neo4j+s://xxxxxxxx.databases.neo4j.io")
        return 1
    if "databases.neo4j.io" in (host or "") and "+s" not in parsed.scheme:
        fail("AuraDB requires TLS but the scheme has no '+s'.",
             f"Change {parsed.scheme}:// to neo4j+s://")
        return 1

    ok(f"URI parsed (host {host}, port {port})")

    # --- 2. DNS -----------------------------------------------------------
    try:
        addr = socket.gethostbyname(host)
        ok(f"DNS resolves to {addr}")
    except socket.gaierror as exc:
        fail(f"DNS lookup for {host} failed ({exc}).",
             "Check the URI for typos.",
             "A deleted Aura instance stops resolving.")
        return 1

    # --- 3. TCP -----------------------------------------------------------
    try:
        with socket.create_connection((host, port), timeout=10):
            ok(f"TCP connect to {host}:{port} succeeded")
    except OSError as exc:
        fail(f"Cannot open a TCP connection to {host}:{port} ({exc}).",
             "A firewall or VPN may be blocking outbound port 7687.")
        return 1

    # --- 4/5/6. driver ----------------------------------------------------
    try:
        driver = GraphDatabase.driver(uri, auth=(user, password))
    except ConfigurationError as exc:
        fail(f"Driver configuration rejected ({exc}).")
        return 1

    with driver:
        # Auth is verified against the system database, which always exists, so
        # a failure here is unambiguously credentials rather than the database.
        try:
            driver.verify_authentication()
            ok("Credentials accepted")
        except AuthError:
            fail("Authentication failed — user or password is wrong.",
                 "Use the values from the Aura credentials file verbatim.",
                 "In PowerShell wrap the password in SINGLE quotes: '...'")
            return 1
        except ServiceUnavailable as exc:
            fail(f"Server unreachable during authentication ({exc}).",
                 "A paused AuraDB instance can look like this. Resume it in the console.")
            return 1

        # Which databases actually exist? This is the question that a
        # DatabaseNotFound error should have answered for you directly.
        available = []
        try:
            with driver.session(database="system") as s:
                for record in s.run("SHOW DATABASES"):
                    available.append({
                        "name": record.get("name"),
                        "status": record.get("currentStatus") or record.get("requestedStatus"),
                        "default": record.get("default"),
                    })
        except Exception as exc:  # noqa: BLE001 - best effort
            warn(f"Could not list databases ({type(exc).__name__}).")

        if available:
            print()
            print("  Databases on this instance:")
            for entry in available:
                marker = " (default)" if entry["default"] else ""
                print(f"    - {entry['name']}  [{entry['status']}]{marker}")
            print()

            names = {e["name"] for e in available}
            default_name = next((e["name"] for e in available if e["default"]), None)

            if database and database not in names:
                fail(
                    f"Configured database {database!r} is not on this instance.",
                    f"Unset NEO4J_DATABASE to use the default ({default_name!r})."
                    if default_name
                    else "No usable database found.",
                )
                return 1

            if not database and default_name:
                ok(f"Server default database is {default_name!r}")

            target = database or default_name
            if target:
                state = next(
                    (e["status"] for e in available if e["name"] == target), None
                )
                if state and state.lower() != "online":
                    fail(
                        f"Database {target!r} exists but its status is {state!r}.",
                        "Wait for provisioning to finish, or resume it in the Aura console.",
                    )
                    return 1

        # Can we actually read?
        try:
            with driver.session(database=database or None) as s:
                value = s.run("RETURN 1 AS ok").single()["ok"]
            ok(f"Read query against {database or '<server default>'} returned {value}")
        except ClientError as exc:
            if "DatabaseNotFound" in str(exc.code or ""):
                fail(f"Database {database or '<server default>'} does not exist.",
                     "See the list above for the real name, then set NEO4J_DATABASE.",
                     "A still-provisioning or paused Aura instance also reports this.")
            else:
                fail(f"Read query failed: {exc}")
            return 1

        # Can we write? Constraint creation on boot needs this.
        try:
            with driver.session(database=database or None) as s:
                s.run(
                    "MERGE (n:__FractalityConnectionCheck {id: 'probe'}) "
                    "SET n.at = timestamp()"
                ).consume()
                s.run("MATCH (n:__FractalityConnectionCheck) DELETE n").consume()
            ok("Write and delete succeeded")
        except ClientError as exc:
            fail(f"Write failed: {exc}",
                 "The user may be read-only.")
            return 1

    print()
    print(f"{GREEN}All checks passed.{RESET} The API can use this database.")
    print(f"{DIM}Next:  pytest api/tests/test_integration_neo4j.py -v{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
