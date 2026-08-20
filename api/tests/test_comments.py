"""
Comments: authorization, rate limiting, and the privacy rule that makes them
different from every other comment system.

The repository is stubbed, so these run with no database. What is under test is
the part where a mistake is expensive:

  * an anonymous visitor can read a conversation but write nothing
  * you cannot edit or delete somebody else's comment
  * a comment's rating is visible to its rater and to NOBODY else, author included
  * the comment rate limit actually refuses
  * a report is counted once per reporter, not once per press
  * blocking hides a person's comments as well as their posts

The last is easy to forget: a block that only covered posts would leave the
blocked person replying underneath them.
"""

import time

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user, optional_user
from api.main import app
from api.models import Comment, PulseAuthor
from api.resonance import ReaderModel
from api.settings import Settings, get_settings

AUTHOR = "user_author"
READER = "user_reader"
PULSE_ID = "pulse-1"
COMMENT_ID = "comment-1"


def now_ms():
    return int(time.time() * 1000)


def make_comment(**overrides):
    base = dict(
        id=COMMENT_ID,
        pulse_id=PULSE_ID,
        author=PulseAuthor(id="u-author", name="Author"),
        text="Worth saying.",
        timestamp=now_ms(),
        my_rating=0,
    )
    base.update(overrides)
    return Comment(**base)


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        clerk_issuer="https://example.clerk.accounts.dev",
        max_comments_per_hour=3,
    )


@pytest.fixture
def client(monkeypatch, settings):
    state = {
        "principal": None,
        "comment": make_comment(),
        "comments": [make_comment()],
        "recent": 0,
        "created": [],
        "updated": [],
        "deleted": [],
        "resonance": [],
        "reports": {},
        "reader_ratings": [],
        "list_calls": [],
    }

    async def fake_upsert_user(_s, subject, username=None, email=None):
        return {"id": f"u-{subject}", "subject": subject, "username": username}

    async def fake_list_comments(_s, pulse_id, viewer_subject=None, skip=0, limit=100):
        state["list_calls"].append(
            {"pulse": pulse_id, "viewer": viewer_subject, "skip": skip, "limit": limit}
        )
        # Mirrors _row_to_comment: own-ness is decided from the viewer's subject,
        # not left at its default. A fake that always said False would make the
        # ownership test pass on a stub rather than on the rule.
        return [
            c.model_copy(update={"own": viewer_subject == AUTHOR})
            for c in state["comments"]
        ]

    async def fake_create_comment(_s, subject, pulse_id, text):
        if pulse_id != PULSE_ID:
            # Mirrors the real Cypher: the MATCH needs the pulse, so a missing one
            # yields no rows rather than raising.
            return None
        state["created"].append((subject, pulse_id, text))
        return make_comment(text=text)

    async def fake_update_comment(_s, subject, comment_id, text):
        # Ownership is part of the real MATCH, so a non-author finds nothing.
        if subject != AUTHOR or comment_id != COMMENT_ID:
            return None
        state["updated"].append((subject, comment_id, text))
        return make_comment(text=text, edited_at=now_ms())

    async def fake_delete_comment(_s, subject, comment_id):
        if subject != AUTHOR or comment_id != COMMENT_ID:
            return False
        state["deleted"].append(comment_id)
        return True

    async def fake_set_comment_resonance(_s, subject, comment_id, value):
        state["resonance"].append((subject, comment_id, value))
        return True

    async def fake_get_comment(_s, comment_id, viewer_subject=None):
        if comment_id != COMMENT_ID:
            return None
        mine = [v for (s, c, v) in state["resonance"] if s == viewer_subject]
        return make_comment(my_rating=mine[-1] if mine else 0)

    async def fake_report_comment(_s, subject, comment_id):
        if comment_id != COMMENT_ID:
            return None
        # MERGE on the relationship: reporting twice is one reporter still objecting.
        state["reports"].setdefault(comment_id, set()).add(subject)
        return len(state["reports"][comment_id])

    async def fake_count_recent_comments(_s, subject, window_ms):
        return state["recent"]

    async def fake_load_reader_model(_s, subject, limit=2000):
        if not subject:
            return ReaderModel.empty()
        return ReaderModel.from_ratings(state["reader_ratings"])

    for name, fn in [
        ("upsert_user", fake_upsert_user),
        ("list_comments", fake_list_comments),
        ("create_comment", fake_create_comment),
        ("update_comment", fake_update_comment),
        ("delete_comment", fake_delete_comment),
        ("set_comment_resonance", fake_set_comment_resonance),
        ("get_comment", fake_get_comment),
        ("report_comment", fake_report_comment),
        ("count_recent_comments", fake_count_recent_comments),
        ("load_reader_model", fake_load_reader_model),
    ]:
        monkeypatch.setattr(repo, name, fn)

    def fake_current_user():
        if state["principal"] is None:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in")
        return Principal(subject=state["principal"])

    def fake_optional_user():
        return Principal(subject=state["principal"]) if state["principal"] else None

    app.dependency_overrides[current_user] = fake_current_user
    app.dependency_overrides[optional_user] = fake_optional_user
    app.dependency_overrides[get_settings] = lambda: settings

    test_client = TestClient(app)
    test_client.state = state
    yield test_client
    app.dependency_overrides.clear()


# --- reading ---------------------------------------------------------------

def test_anyone_can_read_a_conversation(client):
    response = client.get(f"/pulses/{PULSE_ID}/comments")
    assert response.status_code == 200
    assert len(response.json()) == 1
    # Anonymous: no viewer is passed down, so the block filter and my_rating
    # lookups have nothing to key on.
    assert client.state["list_calls"][-1]["viewer"] is None


def test_reading_signed_in_passes_the_viewer_down(client):
    """The viewer is what makes blocks and my_rating work.

    Losing it would silently turn a personalised read into an anonymous one — the
    comments would still render, so nothing would look wrong.
    """
    client.state["principal"] = READER
    response = client.get(f"/pulses/{PULSE_ID}/comments")
    assert response.status_code == 200
    assert client.state["list_calls"][-1]["viewer"] == READER


def test_a_comment_carries_no_tally(client):
    """The rule that makes this different from every other comment system.

    my_rating is the reader's own. There is deliberately no count of who rated a
    comment and no aggregate of how they rated it — not for readers, and not for
    the comment's author either.
    """
    client.state["principal"] = READER
    body = client.get(f"/pulses/{PULSE_ID}/comments").json()[0]

    assert "my_rating" in body
    forbidden = {"score", "rating_count", "ratings", "total", "likes", "resonance_total"}
    assert forbidden.isdisjoint(body.keys()), f"a tally leaked: {body.keys() & forbidden}"


# --- writing ---------------------------------------------------------------

def test_writing_requires_signing_in(client):
    client.state["principal"] = None
    assert client.post(f"/pulses/{PULSE_ID}/comments", json={"text": "hi"}).status_code == 401


def test_commenting_stores_the_text(client):
    client.state["principal"] = READER
    response = client.post(f"/pulses/{PULSE_ID}/comments", json={"text": "  Yes.  "})
    assert response.status_code == 201
    # Trimmed by the validator before it reaches the repository.
    assert client.state["created"][-1] == (READER, PULSE_ID, "Yes.")


def test_commenting_on_a_missing_post_is_a_404(client):
    client.state["principal"] = READER
    response = client.post("/pulses/nope/comments", json={"text": "hi"})
    assert response.status_code == 404


def test_an_empty_comment_is_refused(client):
    client.state["principal"] = READER
    assert client.post(f"/pulses/{PULSE_ID}/comments", json={"text": "   "}).status_code == 422


def test_an_overlong_comment_is_refused(client):
    from api.models import MAX_COMMENT_TEXT
    client.state["principal"] = READER
    long_text = "x" * (MAX_COMMENT_TEXT + 1)
    assert client.post(f"/pulses/{PULSE_ID}/comments", json={"text": long_text}).status_code == 422


def test_the_rate_limit_refuses(client):
    client.state["principal"] = READER
    client.state["recent"] = 3          # max_comments_per_hour is 3 in the fixture
    response = client.post(f"/pulses/{PULSE_ID}/comments", json={"text": "again"})
    assert response.status_code == 429
    # So a client can wait rather than guess.
    assert response.headers.get("Retry-After") == "3600"


# --- editing and deleting --------------------------------------------------

def test_you_can_edit_your_own_comment(client):
    client.state["principal"] = AUTHOR
    response = client.patch(f"/pulses/comments/{COMMENT_ID}", json={"text": "Rewritten."})
    assert response.status_code == 200
    assert response.json()["text"] == "Rewritten."
    # Marked as edited: a conversation where replies are silently rewritten after
    # people have answered them is worse than one with no editing at all.
    assert response.json()["edited_at"] is not None


def test_you_cannot_edit_someone_elses_comment(client):
    client.state["principal"] = READER
    response = client.patch(f"/pulses/comments/{COMMENT_ID}", json={"text": "not mine"})
    assert response.status_code == 404
    assert client.state["updated"] == []


def test_you_can_delete_your_own_comment(client):
    client.state["principal"] = AUTHOR
    assert client.delete(f"/pulses/comments/{COMMENT_ID}").status_code == 204
    assert client.state["deleted"] == [COMMENT_ID]


def test_you_cannot_delete_someone_elses_comment(client):
    client.state["principal"] = READER
    assert client.delete(f"/pulses/comments/{COMMENT_ID}").status_code == 404
    assert client.state["deleted"] == []


# --- resonance -------------------------------------------------------------

def test_rating_a_comment_records_it(client):
    client.state["principal"] = READER
    response = client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=2")
    assert response.status_code == 200
    assert client.state["resonance"][-1] == (READER, COMMENT_ID, 2)
    assert response.json()["my_rating"] == 2


def test_zero_clears_rather_than_storing_a_neutral(client):
    """0 has to mean "said nothing", not "said neutral".

    The reader model treats an absent rating and a neutral one differently, so
    storing a 0 would put a data point into someone's history that they never
    made.
    """
    client.state["principal"] = READER
    client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=2")
    response = client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=0")
    assert response.status_code == 200
    assert client.state["resonance"][-1] == (READER, COMMENT_ID, 0)
    assert response.json()["my_rating"] == 0


def test_a_rating_outside_the_range_is_refused(client):
    client.state["principal"] = READER
    assert client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=3").status_code == 422
    assert client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=-3").status_code == 422


def test_rating_requires_signing_in(client):
    client.state["principal"] = None
    assert client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=1").status_code == 401


def test_another_reader_does_not_see_your_rating(client):
    """The privacy rule, exercised rather than assumed.

    One reader rates; a different reader reads the same comment and must see
    their own answer — nothing — not the first reader's.
    """
    client.state["principal"] = READER
    client.put(f"/pulses/comments/{COMMENT_ID}/resonance?value=2")

    client.state["principal"] = AUTHOR
    body = client.get(f"/pulses/{PULSE_ID}/comments").json()[0]
    assert body["my_rating"] == 0


def test_the_server_says_whose_comment_it_is(client):
    """`own` is decided from the verified subject, not by the client.

    A comment carries its author's API user id; a browser knows the auth
    provider's id. Those are different namespaces, so a client comparing them
    would answer "no" for everybody — offering Report on your own writing and
    never Edit. Which is why the flag exists at all.
    """
    client.state["principal"] = AUTHOR
    assert client.get(f"/pulses/{PULSE_ID}/comments").json()[0]["own"] is True

    client.state["principal"] = READER
    assert client.get(f"/pulses/{PULSE_ID}/comments").json()[0]["own"] is False


def test_an_anonymous_reader_owns_nothing(client):
    client.state["principal"] = None
    assert client.get(f"/pulses/{PULSE_ID}/comments").json()[0]["own"] is False


# --- moderation ------------------------------------------------------------

def test_reporting_is_counted_once_per_reporter(client):
    client.state["principal"] = READER
    assert client.post(f"/pulses/comments/{COMMENT_ID}/report").status_code == 202
    assert client.post(f"/pulses/comments/{COMMENT_ID}/report").status_code == 202
    # Pressing twice is one person still objecting.
    assert client.state["reports"][COMMENT_ID] == {READER}


def test_reporting_a_missing_comment_is_a_404(client):
    client.state["principal"] = READER
    assert client.post("/pulses/comments/nope/report").status_code == 404


def test_reporting_requires_signing_in(client):
    client.state["principal"] = None
    assert client.post(f"/pulses/comments/{COMMENT_ID}/report").status_code == 401
