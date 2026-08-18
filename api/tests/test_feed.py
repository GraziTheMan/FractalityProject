"""
Feed routes: authorization, moderation and rate limiting.

The repository is stubbed, so these run with no database. What is under test is
the part of the feed where a mistake is expensive:

  * an anonymous visitor can read the public feed but write nothing
  * a private pulse is invisible to everyone but its author
  * you cannot delete, or resonate on behalf of, anyone else
  * the posting rate limit actually refuses
  * blocking cannot target yourself
  * a report is recorded once per reporter, not once per press

A feed open to strangers with none of that is not shippable, so it is tested
rather than assumed.
"""

import time

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user, optional_user
from api.main import app
from api.models import Pulse, PulseAuthor, PulseMedia, Visibility
from api.settings import Settings, get_settings

AUTHOR = "user_author"
READER = "user_reader"
PULSE_ID = "pulse-1"


def now_ms():
    return int(time.time() * 1000)


def make_pulse(**overrides):
    base = dict(
        id=PULSE_ID,
        title="A thought",
        preview="Something worth saying.",
        author=PulseAuthor(id="u-author", name="Author"),
        tags=["fractal"],
        media=None,
        visibility=Visibility.PUBLIC,
        timestamp=now_ms(),
        resonance=0.0,
        resonators=0,
        resonated=False,
        own=False,
    )
    base.update(overrides)
    return Pulse(**base)


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        clerk_issuer="https://example.clerk.accounts.dev",
        max_pulses_per_hour=3,
    )


@pytest.fixture
def client(monkeypatch, settings):
    """TestClient with the repository stubbed and the caller injectable."""
    state = {
        "principal": None,
        "pulse": make_pulse(),
        "recent": 0,
        "created": [],
        "deleted": [],
        "resonance": [],
        "reports": {},
        "blocks": [],
        "feed": [make_pulse()],
    }

    async def fake_upsert_user(_s, subject, username=None, email=None):
        return {"id": f"u-{subject}", "subject": subject, "username": username}

    async def fake_list_feed(_s, viewer_subject=None, skip=0, limit=30, tag=None):
        state["feed_call"] = {"viewer": viewer_subject, "skip": skip, "limit": limit, "tag": tag}
        return state["feed"]

    async def fake_list_own(_s, subject, skip=0, limit=30):
        state["own_call"] = subject
        return [make_pulse(own=True, visibility=Visibility.PRIVATE)]

    async def fake_get_pulse(_s, pulse_id, viewer_subject=None):
        pulse = state["pulse"]
        if pulse is None or pulse_id != pulse.id:
            return None
        return pulse.model_copy(update={"own": viewer_subject == AUTHOR})

    async def fake_create_pulse(_s, subject, payload):
        state["created"].append((subject, payload))
        return make_pulse(title=payload.title, preview=payload.preview, tags=payload.tags)

    async def fake_delete_pulse(_s, subject, pulse_id):
        # Mirrors the real Cypher: ownership is part of the match, so a
        # non-author simply finds nothing to delete.
        if subject != AUTHOR:
            return False
        state["deleted"].append(pulse_id)
        return True

    async def fake_set_resonance(_s, subject, pulse_id, on):
        state["resonance"].append((subject, pulse_id, on))
        return True

    async def fake_report(_s, subject, pulse_id, reason):
        # MERGE semantics: one report per reporter, however many times pressed.
        state["reports"].setdefault(pulse_id, set()).add(subject)
        return len(state["reports"][pulse_id])

    async def fake_set_block(_s, subject, target_id, blocked):
        if target_id == f"u-{subject}":
            return False   # self-block, refused by the real query's WHERE
        state["blocks"].append((subject, target_id, blocked))
        return True

    async def fake_list_blocked(_s, subject):
        return [{"id": "u-other", "name": "Other"}]

    async def fake_count_recent(_s, subject, window_ms):
        return state["recent"]

    for name, fn in [
        ("upsert_user", fake_upsert_user),
        ("list_feed", fake_list_feed),
        ("list_own_pulses", fake_list_own),
        ("get_pulse", fake_get_pulse),
        ("create_pulse", fake_create_pulse),
        ("delete_pulse", fake_delete_pulse),
        ("set_resonance", fake_set_resonance),
        ("report_pulse", fake_report),
        ("set_block", fake_set_block),
        ("list_blocked", fake_list_blocked),
        ("count_recent_pulses", fake_count_recent),
    ]:
        monkeypatch.setattr(repo, name, fn)

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[optional_user] = lambda: (
        Principal(subject=state["principal"], username="Someone")
        if state["principal"] else None
    )

    def _current_user():
        if not state["principal"]:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in")
        return Principal(subject=state["principal"], username="Someone")

    app.dependency_overrides[current_user] = _current_user

    with TestClient(app) as c:
        c.state = state
        yield c

    app.dependency_overrides.clear()


# --- reading ---------------------------------------------------------------

def test_anonymous_can_read_the_public_feed(client):
    # The feed is the part a visitor should be able to read before signing up.
    response = client.get("/pulses")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert client.state["feed_call"]["viewer"] is None


def test_signing_in_scopes_the_feed_to_the_viewer(client):
    client.state["principal"] = READER
    client.get("/pulses")
    # The viewer is passed through so blocks apply and `resonated` is accurate.
    assert client.state["feed_call"]["viewer"] == READER


def test_tag_filter_is_passed_through(client):
    client.get("/pulses?tag=%23Fractal")
    assert client.state["feed_call"]["tag"] == "#Fractal"


def test_feed_paging_is_bounded(client):
    assert client.get("/pulses?limit=101").status_code == 422
    assert client.get("/pulses?limit=0").status_code == 422
    assert client.get("/pulses?skip=-1").status_code == 422


def test_mine_route_is_not_shadowed_by_the_pulse_id_route(client):
    # /pulses/mine and /pulses/{pulse_id} are both one segment deep, so a
    # declaration in the wrong order would send "mine" to the id handler.
    client.state["principal"] = AUTHOR
    response = client.get("/pulses/mine")
    assert response.status_code == 200
    assert client.state["own_call"] == AUTHOR


def test_mine_requires_sign_in(client):
    assert client.get("/pulses/mine").status_code == 401


def test_blocked_list_route_is_not_shadowed(client):
    client.state["principal"] = READER
    response = client.get("/pulses/authors/blocked")
    assert response.status_code == 200
    assert response.json()[0]["id"] == "u-other"


# --- private pulses --------------------------------------------------------

def test_a_private_pulse_is_hidden_from_others(client):
    client.state["pulse"] = make_pulse(visibility=Visibility.PRIVATE)
    client.state["principal"] = READER

    response = client.get(f"/pulses/{PULSE_ID}")
    # 404, not 403: confirming a private pulse exists is itself a leak.
    assert response.status_code == 404


def test_a_private_pulse_is_visible_to_its_author(client):
    client.state["pulse"] = make_pulse(visibility=Visibility.PRIVATE)
    client.state["principal"] = AUTHOR

    response = client.get(f"/pulses/{PULSE_ID}")
    assert response.status_code == 200
    assert response.json()["own"] is True


def test_a_private_pulse_is_hidden_from_anonymous(client):
    client.state["pulse"] = make_pulse(visibility=Visibility.PRIVATE)
    assert client.get(f"/pulses/{PULSE_ID}").status_code == 404


def test_a_missing_pulse_is_404(client):
    client.state["pulse"] = None
    assert client.get("/pulses/nope").status_code == 404


# --- writing ---------------------------------------------------------------

def test_anonymous_cannot_post(client):
    response = client.post("/pulses", json={"title": "Hi"})
    assert response.status_code == 401
    assert client.state["created"] == []


def test_posting_works_when_signed_in(client):
    client.state["principal"] = AUTHOR
    response = client.post("/pulses", json={"title": "Hi", "preview": "there"})
    assert response.status_code == 201
    assert client.state["created"][0][0] == AUTHOR


def test_posting_normalises_tags(client):
    client.state["principal"] = AUTHOR
    client.post("/pulses", json={"title": "Hi", "tags": ["#Fractal", "fractal", "Math"]})
    assert client.state["created"][0][1].tags == ["fractal", "math"]


def test_an_empty_title_is_refused(client):
    client.state["principal"] = AUTHOR
    assert client.post("/pulses", json={"title": "   "}).status_code == 422


def test_an_over_long_body_is_refused(client):
    client.state["principal"] = AUTHOR
    response = client.post("/pulses", json={"title": "Hi", "preview": "x" * 2001})
    assert response.status_code == 422


def test_a_javascript_url_in_media_is_refused(client):
    # This would be a stored XSS the moment anything rendered it as a link.
    client.state["principal"] = AUTHOR
    response = client.post("/pulses", json={
        "title": "Hi",
        "media": {"kind": "link", "url": "javascript:alert(1)"},
    })
    assert response.status_code == 422


def test_an_unknown_media_kind_is_refused(client):
    client.state["principal"] = AUTHOR
    response = client.post("/pulses", json={
        "title": "Hi",
        "media": {"kind": "image", "url": "https://example.com/x.png"},
    })
    # Images need object storage and scanning, which do not exist yet, so the
    # whitelist refuses rather than accepting something unservable.
    assert response.status_code == 422


# --- rate limiting ---------------------------------------------------------

def test_the_posting_rate_limit_refuses_and_says_when_to_retry(client):
    client.state["principal"] = AUTHOR
    client.state["recent"] = 3          # settings.max_pulses_per_hour

    response = client.post("/pulses", json={"title": "Spam"})
    assert response.status_code == 429
    assert response.headers.get("Retry-After") == "3600"
    assert client.state["created"] == [], "a refused post must not be written"


def test_posting_is_allowed_just_below_the_limit(client):
    client.state["principal"] = AUTHOR
    client.state["recent"] = 2
    assert client.post("/pulses", json={"title": "Fine"}).status_code == 201


# --- deleting --------------------------------------------------------------

def test_you_cannot_delete_someone_elses_pulse(client):
    client.state["principal"] = READER
    response = client.delete(f"/pulses/{PULSE_ID}")
    assert response.status_code == 404
    assert client.state["deleted"] == []


def test_you_can_delete_your_own_pulse(client):
    client.state["principal"] = AUTHOR
    assert client.delete(f"/pulses/{PULSE_ID}").status_code == 204
    assert client.state["deleted"] == [PULSE_ID]


def test_anonymous_cannot_delete(client):
    assert client.delete(f"/pulses/{PULSE_ID}").status_code == 401


# --- resonance -------------------------------------------------------------

def test_resonance_requires_sign_in(client):
    assert client.put(f"/pulses/{PULSE_ID}/resonance").status_code == 401
    assert client.state["resonance"] == []


def test_resonance_is_recorded_against_the_caller(client):
    client.state["principal"] = READER
    response = client.put(f"/pulses/{PULSE_ID}/resonance")
    assert response.status_code == 200
    assert client.state["resonance"] == [(READER, PULSE_ID, True)]


def test_resonance_can_be_taken_back(client):
    client.state["principal"] = READER
    client.put(f"/pulses/{PULSE_ID}/resonance?on=false")
    assert client.state["resonance"] == [(READER, PULSE_ID, False)]


# --- moderation ------------------------------------------------------------

def test_reporting_requires_sign_in(client):
    response = client.post(f"/pulses/{PULSE_ID}/report", json={"reason": "spam"})
    assert response.status_code == 401


def test_a_report_is_accepted_and_counted(client):
    client.state["principal"] = READER
    response = client.post(f"/pulses/{PULSE_ID}/report", json={"reason": "spam"})
    # 202: recorded, but no human has decided anything yet.
    assert response.status_code == 202
    assert response.json()["reports"] == 1


def test_one_reporter_cannot_inflate_the_count(client):
    client.state["principal"] = READER
    for _ in range(4):
        client.post(f"/pulses/{PULSE_ID}/report", json={"reason": "spam"})
    assert client.state["reports"][PULSE_ID] == {READER}


def test_an_invented_report_reason_is_refused(client):
    # Free text on an unmoderated endpoint is itself an abuse channel.
    client.state["principal"] = READER
    response = client.post(f"/pulses/{PULSE_ID}/report", json={"reason": "i just dislike it"})
    assert response.status_code == 422


def test_blocking_an_author_works(client):
    client.state["principal"] = READER
    response = client.put("/pulses/authors/u-other/block")
    assert response.status_code == 200
    assert client.state["blocks"] == [(READER, "u-other", True)]


def test_unblocking_works(client):
    client.state["principal"] = READER
    client.put("/pulses/authors/u-other/block?blocked=false")
    assert client.state["blocks"] == [(READER, "u-other", False)]


def test_you_cannot_block_yourself(client):
    # It would silently empty your own feed.
    client.state["principal"] = READER
    response = client.put(f"/pulses/authors/u-{READER}/block")
    assert response.status_code == 404
    assert client.state["blocks"] == []


def test_blocking_requires_sign_in(client):
    assert client.put("/pulses/authors/u-other/block").status_code == 401


# --- degradation -----------------------------------------------------------

def test_feed_routes_report_503_without_a_database(client, monkeypatch, settings):
    # Better a clear 503 than an exception trace, and better than pretending the
    # feed is simply empty.
    unconfigured = Settings(environment="development", clerk_issuer="https://x.clerk.accounts.dev")
    app.dependency_overrides[get_settings] = lambda: unconfigured
    assert client.get("/pulses").status_code == 503
