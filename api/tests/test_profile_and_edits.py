"""
Profile and post editing.

Two things here are easy to get wrong in ways no error reveals:

  * PATCH semantics. Omitting a field must leave it alone; sending it as null must
    clear it. Collapse those and an avatar can be set but never removed.
  * Edit authorization. Editing is a write, and a write scoped by a check rather
    than by the query itself is a window for editing someone else's post.
"""

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user, optional_user
from api.main import app
from api.models import Profile, Pulse, PulseAuthor, Visibility
from api.settings import Settings, get_settings

ME = "user_me"
OTHER = "user_other"
PULSE_ID = "pulse-1"


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
    state = {
        "principal": None,
        "profile": Profile(id="u-me", display_name=None, avatar_url=None,
                           username=None, email="me@example.com"),
        "profile_calls": [],
        "pulse_updates": [],
    }

    async def fake_upsert_user(_s, subject, username=None, email=None):
        return {"id": f"u-{subject}", "subject": subject, "username": username}

    async def fake_get_profile(_s, subject):
        return state["profile"]

    async def fake_update_profile(_s, subject, display_name=None, avatar_url=None,
                                  default_map_id=None, bio=None, set_name=False,
                                  set_avatar=False, set_default=False, set_bio=False):
        state["profile_calls"].append({
            "display_name": display_name, "avatar_url": avatar_url,
            "default_map_id": default_map_id, "bio": bio,
            "set_name": set_name, "set_avatar": set_avatar,
            "set_default": set_default, "set_bio": set_bio,
        })
        current = state["profile"]
        state["profile"] = Profile(
            id=current.id,
            display_name=display_name if set_name else current.display_name,
            avatar_url=avatar_url if set_avatar else current.avatar_url,
            default_map_id=default_map_id if set_default else current.default_map_id,
            bio=bio if set_bio else current.bio,
            username=current.username, email=current.email,
        )
        return state["profile"]

    async def fake_update_pulse(_s, subject, pulse_id, changes):
        # Mirrors the real Cypher: ownership is part of the match.
        if subject != ME:
            return False
        state["pulse_updates"].append(changes)
        return True

    async def fake_get_pulse(_s, pulse_id, viewer_subject=None):
        if pulse_id != PULSE_ID:
            return None
        return Pulse(
            id=PULSE_ID, title="Edited", preview="body",
            author=PulseAuthor(id="u-me", name="Me"),
            tags=[], media=None, visibility=Visibility.PUBLIC,
            timestamp=1, edited_at=2, own=viewer_subject == ME,
        )

    for name, fn in [
        ("upsert_user", fake_upsert_user),
        ("get_profile", fake_get_profile),
        ("update_profile", fake_update_profile),
        ("update_pulse", fake_update_pulse),
        ("get_pulse", fake_get_pulse),
    ]:
        monkeypatch.setattr(repo, name, fn)

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[optional_user] = lambda: (
        Principal(subject=state["principal"]) if state["principal"] else None
    )

    def _current_user():
        if not state["principal"]:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in")
        return Principal(subject=state["principal"])

    app.dependency_overrides[current_user] = _current_user

    with TestClient(app) as c:
        c.state = state
        yield c
    app.dependency_overrides.clear()


# --- profile ---------------------------------------------------------------

def test_profile_requires_sign_in(client):
    assert client.get("/me").status_code == 401
    assert client.patch("/me", json={"display_name": "X"}).status_code == 401


def test_reading_a_profile_creates_the_local_row(client):
    client.state["principal"] = ME
    response = client.get("/me")
    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


def test_setting_a_display_name(client):
    client.state["principal"] = ME
    response = client.patch("/me", json={"display_name": "  Nick Graziano  "})
    assert response.status_code == 200
    assert response.json()["display_name"] == "Nick Graziano", "must be trimmed"


def test_an_omitted_field_is_left_alone(client):
    client.state["principal"] = ME
    client.patch("/me", json={"avatar_url": "https://example.com/a.png"})
    client.patch("/me", json={"display_name": "Nick"})

    # The second call must not touch the avatar.
    second = client.state["profile_calls"][1]
    assert second["set_name"] is True
    assert second["set_avatar"] is False
    assert client.state["profile"].avatar_url == "https://example.com/a.png"


def test_an_explicit_null_clears_a_field(client):
    # The distinction that makes this a PATCH: without it an avatar could be set
    # and never removed.
    client.state["principal"] = ME
    client.patch("/me", json={"avatar_url": "https://example.com/a.png"})
    client.patch("/me", json={"avatar_url": None})

    last = client.state["profile_calls"][-1]
    assert last["set_avatar"] is True
    assert last["avatar_url"] is None
    assert client.state["profile"].avatar_url is None


def test_a_blank_display_name_clears_it_rather_than_storing_spaces(client):
    client.state["principal"] = ME
    client.patch("/me", json={"display_name": "   "})
    assert client.state["profile_calls"][-1]["display_name"] is None


def test_a_javascript_avatar_url_is_refused(client):
    # It ends up in an <img src>, so this would be a stored XSS.
    client.state["principal"] = ME
    response = client.patch("/me", json={"avatar_url": "javascript:alert(1)"})
    assert response.status_code == 422
    assert client.state["profile_calls"] == []


def test_an_over_long_display_name_is_refused(client):
    client.state["principal"] = ME
    assert client.patch("/me", json={"display_name": "x" * 61}).status_code == 422


# --- editing a pulse -------------------------------------------------------

def test_editing_requires_sign_in(client):
    assert client.patch(f"/pulses/{PULSE_ID}", json={"title": "New"}).status_code == 401


def test_you_cannot_edit_someone_elses_post(client):
    client.state["principal"] = OTHER
    response = client.patch(f"/pulses/{PULSE_ID}", json={"title": "Hijacked"})
    # 404, not 403: ownership is in the query, and confirming the post exists
    # would itself be a leak.
    assert response.status_code == 404
    assert client.state["pulse_updates"] == []


def test_you_can_edit_your_own_post(client):
    client.state["principal"] = ME
    response = client.patch(f"/pulses/{PULSE_ID}", json={"title": "Better title"})
    assert response.status_code == 200
    assert client.state["pulse_updates"][0]["title"] == "Better title"


def test_an_edit_reports_that_it_was_edited(client):
    client.state["principal"] = ME
    body = client.patch(f"/pulses/{PULSE_ID}", json={"title": "New"}).json()
    assert body["edited_at"] is not None


def test_an_empty_edit_is_refused(client):
    # Otherwise it would stamp edited_at while changing nothing.
    client.state["principal"] = ME
    assert client.patch(f"/pulses/{PULSE_ID}", json={}).status_code == 400


def test_edits_are_validated_like_creations(client):
    client.state["principal"] = ME
    # A link refused on the way in must not become acceptable on an edit.
    assert client.patch(f"/pulses/{PULSE_ID}", json={
        "media": {"kind": "link", "url": "javascript:alert(1)"}}).status_code == 422
    assert client.patch(f"/pulses/{PULSE_ID}", json={"title": "  "}).status_code == 422
    assert client.patch(f"/pulses/{PULSE_ID}", json={"visibility": "unlisted"}).status_code == 422
    assert client.state["pulse_updates"] == []


def test_editing_a_post_that_has_a_link(client):
    """The edit that 500ed in production.

    model_dump() RECURSES, so `media` arrived as a plain dict and calling
    model_dump_json() on it raised AttributeError. media=None took the other
    branch and worked fine, so the failure only appeared on posts that actually
    had a link — which made it look intermittent rather than broken.

    None of the edit tests above sent one. Every existing case here changes a
    title, a body or tags; nothing carried nested media, so the whole branch was
    unexercised.

    It also reached the user as a CORS error rather than a 500, because an
    unhandled exception bypasses the CORS middleware. Two faults stacked: one that
    broke editing, and one that misdescribed it.
    """
    client.state["principal"] = ME
    response = client.patch(
        f"/pulses/{PULSE_ID}",
        json={
            "title": "Edited",
            "media": {"kind": "link", "url": "https://www.fractiverse.com/?map=abc"},
        },
    )
    assert response.status_code == 200, response.text

    changes = client.state["pulse_updates"][-1]
    # Serialised on the way to the database, not handed over as a model.
    assert isinstance(changes["media_json"], str)
    assert "fractiverse.com" in changes["media_json"]


def test_clearing_a_link_by_editing(client):
    """null means remove it, and must stay distinct from omitting the field."""
    client.state["principal"] = ME
    response = client.patch(f"/pulses/{PULSE_ID}", json={"title": "No link", "media": None})
    assert response.status_code == 200, response.text

    changes = client.state["pulse_updates"][-1]
    assert "media" in changes
    assert changes["media_json"] is None


def test_editing_without_mentioning_media_leaves_it_alone(client):
    client.state["principal"] = ME
    response = client.patch(f"/pulses/{PULSE_ID}", json={"title": "Just the title"})
    assert response.status_code == 200, response.text

    changes = client.state["pulse_updates"][-1]
    assert "media_json" not in changes


def test_editing_normalises_tags(client):
    client.state["principal"] = ME
    client.patch(f"/pulses/{PULSE_ID}", json={"tags": ["#Fractal", "fractal", "Math"]})
    assert client.state["pulse_updates"][0]["tags"] == ["fractal", "math"]


def test_clearing_a_link_is_distinguishable_from_leaving_it(client):
    client.state["principal"] = ME

    client.patch(f"/pulses/{PULSE_ID}", json={"title": "No media key"})
    assert "media_json" not in client.state["pulse_updates"][0], "omitted means leave alone"

    client.patch(f"/pulses/{PULSE_ID}", json={"media": None})
    assert client.state["pulse_updates"][1]["media_json"] is None, "null means clear"


# --- the map that opens on sign-in -----------------------------------------


def test_setting_a_default_map(client):
    client.state["principal"] = ME
    response = client.patch("/me", json={"default_map_id": "map-abc"})
    assert response.status_code == 200
    # The whole call, not just the field under test: the point is that choosing a
    # default map touches NOTHING else. Every set_* flag but one is False, which is
    # what makes a PATCH a patch.
    assert client.state["profile_calls"][-1] == {
        "display_name": None, "avatar_url": None, "default_map_id": "map-abc",
        "bio": None,
        "set_name": False, "set_avatar": False, "set_default": True, "set_bio": False,
    }
    assert response.json()["default_map_id"] == "map-abc"


def test_setting_a_bio(client):
    client.state["principal"] = ME
    response = client.patch("/me", json={"bio": "  I make maps of ideas.  "})
    assert response.status_code == 200
    # Trimmed at the ends, and nothing else disturbed.
    assert client.state["profile_calls"][-1] == {
        "display_name": None, "avatar_url": None, "default_map_id": None,
        "bio": "I make maps of ideas.",
        "set_name": False, "set_avatar": False, "set_default": False, "set_bio": True,
    }
    assert response.json()["bio"] == "I make maps of ideas."


def test_a_bio_keeps_its_paragraphs(client):
    """Unlike a display name, a bio has shape.

    The name validator collapses to a single trimmed line, and applying that here
    would silently reformat what someone wrote about themselves. Only the ends go.
    """
    client.state["principal"] = ME
    written = "\n  First line.\n\n  Second paragraph.\n  \n"
    response = client.patch("/me", json={"bio": written})
    assert response.status_code == 200
    assert response.json()["bio"] == "First line.\n\n  Second paragraph."


def test_a_blank_bio_clears_it(client):
    client.state["principal"] = ME
    client.patch("/me", json={"bio": "something"})
    response = client.patch("/me", json={"bio": "   \n  "})
    assert response.status_code == 200
    assert client.state["profile_calls"][-1]["set_bio"] is True
    assert client.state["profile_calls"][-1]["bio"] is None
    assert response.json()["bio"] is None


def test_an_omitted_bio_is_left_alone(client):
    client.state["principal"] = ME
    client.patch("/me", json={"bio": "kept"})
    response = client.patch("/me", json={"display_name": "Nick"})
    assert response.status_code == 200
    assert client.state["profile_calls"][-1]["set_bio"] is False
    assert response.json()["bio"] == "kept"


def test_an_overlong_bio_is_refused(client):
    client.state["principal"] = ME
    from api.models import MAX_BIO
    response = client.patch("/me", json={"bio": "x" * (MAX_BIO + 1)})
    assert response.status_code == 422


def test_a_bio_of_exactly_the_limit_is_accepted(client):
    client.state["principal"] = ME
    # The boundary itself, because a cap tested only from outside says nothing
    # about which side of it is allowed.
    from api.models import MAX_BIO
    response = client.patch("/me", json={"bio": "x" * MAX_BIO})
    assert response.status_code == 200
    assert len(response.json()["bio"]) == MAX_BIO


def test_a_username_cannot_be_set_over_the_api(client):
    """Identity comes from the token, not from the request body.

    Usernames are unique and permanent now that the app is becoming social, so a
    caller must not be able to claim one by asking. ProfileUpdate has no username
    field; pydantic ignores the extra key, and the stored username is whatever
    upsert_user wrote from the verified token.
    """
    client.state["principal"] = ME
    before = client.get("/me").json()["username"]
    response = client.patch("/me", json={"username": "someone-else"})
    assert response.status_code == 200
    assert response.json()["username"] == before
    assert "username" not in client.state["profile_calls"][-1]


def test_clearing_the_default_map(client):
    """
    "No default" is a state a user has to be able to get back to, which is why null and
    omitted have to mean different things here.
    """
    client.state["principal"] = ME
    client.patch("/me", json={"default_map_id": "map-abc"})
    response = client.patch("/me", json={"default_map_id": None})
    assert response.status_code == 200
    assert client.state["profile_calls"][-1]["set_default"] is True
    assert client.state["profile_calls"][-1]["default_map_id"] is None
    assert response.json()["default_map_id"] is None


def test_omitting_the_default_map_leaves_it_alone(client):
    client.state["principal"] = ME
    client.patch("/me", json={"default_map_id": "map-abc"})
    response = client.patch("/me", json={"display_name": "Nick"})
    assert client.state["profile_calls"][-1]["set_default"] is False
    assert response.json()["default_map_id"] == "map-abc", "an unrelated edit cleared it"


def test_the_default_map_is_returned_by_a_plain_read(client):
    client.state["principal"] = ME
    client.patch("/me", json={"default_map_id": "map-abc"})
    assert client.get("/me").json()["default_map_id"] == "map-abc"


def test_setting_a_default_map_requires_sign_in(client):
    client.state["principal"] = None
    assert client.patch("/me", json={"default_map_id": "map-abc"}).status_code == 401
