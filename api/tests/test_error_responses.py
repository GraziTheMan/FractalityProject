"""
A server error must arrive as a server error.

Starlette unwinds an unhandled exception PAST the CORS middleware, so the browser
receives a bare 500 with no Access-Control-Allow-Origin and reports it as a CORS
failure. The practical effect is that every bug in this codebase described itself
to the user as a misconfiguration — "CORS_ORIGIN must include exactly …" — and
sent them to check an environment variable while the real cause was a traceback
nobody had seen.

This is exactly the shape of bug that wastes an afternoon, so it is tested rather
than assumed.
"""

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user, optional_user
from api.main import app
from api.settings import Settings, get_settings

# The origin the APP was configured with, read from the app itself.
#
# Not a made-up one, and this is the trap that made writing this test instructive:
# CORSMiddleware is configured at import time from the module-level settings, so
# overriding get_settings as a dependency does not move its allowlist. A test that
# invented an origin was asserting against a middleware that had never heard of it.
#
# The same fact matters in production: changing CORS_ORIGIN on the deployed service
# takes effect on RESTART, not when the variable is saved.
def _configured_origin() -> str:
    from api.main import app
    from starlette.middleware.cors import CORSMiddleware

    for middleware in app.user_middleware:
        if middleware.cls is CORSMiddleware:
            origins = middleware.kwargs["allow_origins"]
            assert origins, "the app has no configured CORS origins to test against"
            return origins[0]
    raise AssertionError("the app has no CORS middleware")


ORIGIN = _configured_origin()


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        clerk_issuer="https://example.clerk.accounts.dev",
    )


@pytest.fixture
def client(monkeypatch, settings):
    async def explode(*_args, **_kwargs):
        raise RuntimeError("something went wrong deep inside")

    monkeypatch.setattr(repo, "list_feed", explode)

    app.dependency_overrides[current_user] = lambda: Principal(subject="user_1")
    app.dependency_overrides[optional_user] = lambda: Principal(subject="user_1")
    app.dependency_overrides[get_settings] = lambda: settings

    # raise_server_exceptions=False, or TestClient re-raises instead of letting the
    # app produce the response a browser would actually receive.
    test_client = TestClient(app, raise_server_exceptions=False)
    yield test_client
    app.dependency_overrides.clear()


def test_a_crash_is_a_500_not_a_transport_failure(client):
    response = client.get("/pulses", headers={"Origin": ORIGIN})
    assert response.status_code == 500


def test_a_crash_still_carries_the_cors_header(client):
    """The whole point.

    Without the header the browser blocks the response and JavaScript sees a
    network error, which is indistinguishable from the API being down or the
    origin being unlisted. With it, the frontend renders "Server error (500)" and
    the reader is told the truth.
    """
    response = client.get("/pulses", headers={"Origin": ORIGIN})
    assert response.headers.get("access-control-allow-origin") == ORIGIN


def test_the_error_body_leaks_nothing(client):
    """The traceback belongs in the server log, not in a browser."""
    response = client.get("/pulses", headers={"Origin": ORIGIN})
    body = response.json()
    assert "detail" in body
    assert "something went wrong deep inside" not in str(body).lower()
    assert "RuntimeError" not in str(body)
    assert "Traceback" not in str(body)


def test_an_unlisted_origin_still_gets_no_cors_header(client):
    """The fix must not become a way around the allowlist.

    Attaching the header unconditionally would make every origin allowed on the
    error path, which is a worse bug than the one being fixed.
    """
    response = client.get("/pulses", headers={"Origin": "https://not-allowed.example"})
    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") is None


def test_health_reports_the_allowed_origins(client):
    """So "is my origin allowed?" is answerable without guessing.

    The failure this exists for is silent from outside the browser: with the wrong
    list the service is healthy and fast and refuses every request the app makes.
    curl sees a working API; the user sees a spinner that never stops.
    """
    body = client.get("/health").json()
    assert "allowed_origins" in body
    assert isinstance(body["allowed_origins"], list)
    assert ORIGIN in body["allowed_origins"]
