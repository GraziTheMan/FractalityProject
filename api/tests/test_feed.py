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
from api.resonance import ReaderModel
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
        my_rating=0,
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
        "impressions": [],
        "models_loaded": [],
        # (rating, tags, author_id) triples standing in for the caller's history.
        "reader_ratings": [],
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

    async def fake_set_resonance(_s, subject, pulse_id, value):
        state["resonance"].append((subject, pulse_id, value))
        return True

    async def fake_load_reader_model(_s, subject, limit=2000):
        state["models_loaded"].append(subject)
        # Mirrors the real function's early return. Without this the fake would be
        # more capable than the thing it stands for, and the anonymous case would
        # pass here while failing in production.
        if not subject:
            return ReaderModel.empty()
        return ReaderModel.from_ratings(state["reader_ratings"])

    async def fake_record_impressions(_s, subject, pulse_ids):
        state["impressions"].append((subject, list(pulse_ids)))
        return len(pulse_ids)

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
        ("load_reader_model", fake_load_reader_model),
        ("record_impressions", fake_record_impressions),
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


def test_a_rating_is_recorded_against_the_caller(client):
    client.state["principal"] = READER
    response = client.put(f"/pulses/{PULSE_ID}/resonance?value=2")
    assert response.status_code == 200
    assert client.state["resonance"] == [(READER, PULSE_ID, 2)]


def test_the_whole_scale_is_accepted(client):
    client.state["principal"] = READER
    for value in (-2, -1, 0, 1, 2):
        assert client.put(f"/pulses/{PULSE_ID}/resonance?value={value}").status_code == 200
    assert [v for _, _, v in client.state["resonance"]] == [-2, -1, 0, 1, 2]


def test_a_rating_off_the_scale_is_refused(client):
    """The scale is the vocabulary. A client that can send 97 has a different one."""
    client.state["principal"] = READER
    for value in (-3, 3, 100, -100):
        assert client.put(f"/pulses/{PULSE_ID}/resonance?value={value}").status_code == 422
    assert client.state["resonance"] == []


def test_a_rating_can_be_taken_back_with_zero(client):
    client.state["principal"] = READER
    client.put(f"/pulses/{PULSE_ID}/resonance?value=0")
    assert client.state["resonance"] == [(READER, PULSE_ID, 0)]


def test_no_tally_of_anyone_else_is_ever_returned(client):
    """
    The core of the design, asserted as an absence.

    A count of who rated a post, or any aggregate of how they rated it, turns
    writing into competing. This checks the wire format itself rather than the UI,
    because a field that exists will eventually get rendered.
    """
    client.state["principal"] = READER
    for body in (
        client.get("/pulses").json(),
        [client.get(f"/pulses/{PULSE_ID}").json()],
        [client.put(f"/pulses/{PULSE_ID}/resonance?value=1").json()],
    ):
        for pulse in body:
            for forbidden in ("resonators", "resonance", "resonated", "score",
                              "likes", "ratings", "rating_count", "seen"):
                assert forbidden not in pulse, f"{forbidden} is on the wire"
            assert "my_rating" in pulse


# --- what the reader is predicted to make of a post ------------------------

def test_no_prediction_without_enough_history(client):
    """
    Below the threshold the arithmetic still produces a number, and that number is
    noise. A confident-looking gauge invites the reader to believe it.
    """
    client.state["principal"] = READER
    client.state["reader_ratings"] = [(2, ["fractal"], "u-author")]

    pulse = client.get("/pulses").json()[0]
    assert pulse["predicted"] is None
    assert pulse["prediction_confidence"] == 0


def test_a_prediction_appears_once_there_is_history(client):
    client.state["principal"] = READER
    client.state["reader_ratings"] = [(2, ["fractal"], "u-author")] * 10

    pulse = client.get("/pulses").json()[0]
    assert pulse["predicted"] is not None
    assert pulse["predicted"] > 0
    assert pulse["prediction_confidence"] > 0


def test_a_history_of_dissonance_predicts_dissonance(client):
    client.state["principal"] = READER
    client.state["reader_ratings"] = [(-2, ["fractal"], "u-author")] * 10

    assert client.get("/pulses").json()[0]["predicted"] < 0


def test_an_anonymous_reader_gets_no_prediction(client):
    """Nothing to predict from, and nothing that could be predicted about them."""
    client.state["principal"] = None
    client.state["reader_ratings"] = [(2, ["fractal"], "u-author")] * 10

    pulse = client.get("/pulses").json()[0]
    assert pulse["predicted"] is None


def test_rating_a_pulse_returns_a_freshly_computed_prediction(client):
    """
    The new rating is part of the reader's history now, so the gauge the response
    carries must reflect it rather than the model from before the write.
    """
    client.state["principal"] = READER
    client.state["reader_ratings"] = [(2, ["fractal"], "u-author")] * 10

    body = client.put(f"/pulses/{PULSE_ID}/resonance?value=2").json()
    assert body["predicted"] is not None
    # Loaded after the write, not before: the model call happens on the way out.
    assert client.state["models_loaded"][-1] == READER


async def _no_db(*_a, **_k):
    raise AssertionError("the database must not be touched for an anonymous reader")


def test_the_real_loader_returns_an_empty_model_for_anonymous(monkeypatch, settings):
    """
    Tests the real repository function, not the fake above.

    The fake mirrors this early return, and a fake that agrees with itself proves
    nothing — so the guard is also asserted against the code that ships. Patching
    the database to explode proves the return happens BEFORE any query, which is
    what makes it safe to call on every anonymous feed request.
    """
    import asyncio
    from api import db

    monkeypatch.setattr(db, "run_read", _no_db)
    model = asyncio.run(repo.load_reader_model(settings, None))

    assert model.total_ratings == 0
    assert model.predict(["fractal"], "u-author").value is None


# --- impressions -----------------------------------------------------------

def test_impressions_require_sign_in(client):
    response = client.post("/pulses/impressions", json={"pulse_ids": [PULSE_ID]})
    assert response.status_code == 401
    assert client.state["impressions"] == []


def test_impressions_are_recorded_for_the_caller(client):
    client.state["principal"] = READER
    response = client.post("/pulses/impressions", json={"pulse_ids": [PULSE_ID, "p-2"]})
    assert response.status_code == 204
    assert client.state["impressions"] == [(READER, [PULSE_ID, "p-2"])]


def test_repeated_ids_in_one_batch_are_collapsed(client):
    client.state["principal"] = READER
    client.post("/pulses/impressions", json={"pulse_ids": [PULSE_ID, PULSE_ID, "p-2"]})
    assert client.state["impressions"] == [(READER, [PULSE_ID, "p-2"])]


def test_an_oversized_impression_batch_is_refused(client):
    client.state["principal"] = READER
    response = client.post(
        "/pulses/impressions", json={"pulse_ids": [f"p-{i}" for i in range(201)]}
    )
    assert response.status_code == 422
    assert client.state["impressions"] == []


def test_an_empty_impression_batch_is_accepted_and_writes_nothing(client):
    client.state["principal"] = READER
    assert client.post("/pulses/impressions", json={"pulse_ids": []}).status_code == 204
    assert client.state["impressions"] == [(READER, [])]


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
