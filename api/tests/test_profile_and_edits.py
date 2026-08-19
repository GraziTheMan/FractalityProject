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
                                  default_map_id=None, set_name=False, set_avatar=False,
                                  set_default=False):
        state["profile_calls"].append({
            "display_name": display_name, "avatar_url": avatar_url,
            "default_map_id": default_map_id,
            "set_name": set_name, "set_avatar": set_avatar,
            "set_default": set_default,
        })
        current = state["profile"]
        state["profile"] = Profile(
            id=current.id,
            display_name=display_name if set_name else current.display_name,
            avatar_url=avatar_url if set_avatar else current.avatar_url,
            default_map_id=default_map_id if set_default else current.default_map_id,
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
    assert client.state["profile_calls"][-1] == {
        "display_name": None, "avatar_url": None, "default_map_id": "map-abc",
        "set_name": False, "set_avatar": False, "set_default": True,
    }
    assert response.json()["default_map_id"] == "map-abc"


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
