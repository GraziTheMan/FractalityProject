"""
Authorization matrix.

The repository layer is stubbed so these run without Neo4j. What is under test is
the access-control logic in the routers, which is the part where a mistake leaks
someone else's private mind map.

Matrix covered:

    actor            private   unlisted+token   public
    owner            rw        rw               rw
    other user       -         r (view token)   r
    anonymous        -         r (view token)   r
    edit token       rw        rw               rw
    expired/revoked  -         -                r (public only)
"""

import time

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user, optional_user
from api.main import app
from api.models import (
    MapNode,
    MindMap,
    SharePermission,
    ShareLink,
    Visibility,
)
from api.settings import Settings, get_settings

OWNER = "user_owner"
OTHER = "user_other"
MAP_ID = "map-test"


def now_ms():
    return int(time.time() * 1000)


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        clerk_issuer="https://example.clerk.accounts.dev",
    )


@pytest.fixture
def fake_map():
    return {
        "id": MAP_ID,
        "title": "Test Map",
        "description": "",
        "visibility": Visibility.PRIVATE.value,
        "node_count": 1,
        "created_at": now_ms(),
        "updated_at": now_ms(),
        "root_id": "root",
        "owner_id": "u1",
        "owner_subject": OWNER,
        "owner_name": "Owner",
    }


@pytest.fixture
def client(monkeypatch, settings, fake_map):
    """
    TestClient with the repository stubbed and auth injectable per-test.

    `state` lets each test set the map's visibility, the active share link, and
    who is calling, without touching a database.
    """
    state = {"map": fake_map, "share": None, "principal": None}

    async def fake_get_map_meta(_settings, map_id):
        return state["map"] if map_id == state["map"]["id"] else None

    async def fake_get_map(_settings, map_id):
        if map_id != state["map"]["id"]:
            return None
        meta = dict(state["map"])
        meta.pop("owner_subject", None)
        meta.pop("root_id", None)
        return MindMap(
            **meta,
            root_id="root",
            nodes=[MapNode(id="root", metadata={"label": "Root"})],
        )

    async def fake_resolve_share_link(_settings, token):
        share = state["share"]
        if share and share.token == token:
            return share
        return None

    async def fake_upsert_user(_settings, subject, username=None, email=None):
        return {"id": "u1", "subject": subject, "username": username, "email": email}

    async def fake_replace_nodes(_settings, map_id, nodes, root_id):
        state["written_nodes"] = nodes
        return len(nodes)

    async def fake_update_map(_settings, map_id, title, description, visibility):
        if title is not None:
            state["map"]["title"] = title
        if visibility is not None:
            state["map"]["visibility"] = visibility.value
        return True

    async def fake_delete_map(_settings, map_id):
        state["deleted"] = map_id
        return True

    async def fake_create_share(_settings, map_id, permission, expires_in_seconds):
        return ShareLink(
            token="freshtoken",
            map_id=map_id,
            permission=permission,
            created_at=now_ms(),
            expires_at=None,
        )

    async def fake_list_shares(_settings, map_id):
        return [state["share"]] if state["share"] else []

    async def fake_revoke_share(_settings, map_id, token):
        return bool(state["share"] and state["share"].token == token)

    monkeypatch.setattr(repo, "get_map_meta", fake_get_map_meta)
    monkeypatch.setattr(repo, "get_map", fake_get_map)
    monkeypatch.setattr(repo, "resolve_share_link", fake_resolve_share_link)
    monkeypatch.setattr(repo, "upsert_user", fake_upsert_user)
    monkeypatch.setattr(repo, "replace_nodes", fake_replace_nodes)
    monkeypatch.setattr(repo, "update_map", fake_update_map)
    monkeypatch.setattr(repo, "delete_map", fake_delete_map)
    monkeypatch.setattr(repo, "create_share_link", fake_create_share)
    monkeypatch.setattr(repo, "list_share_links", fake_list_shares)
    monkeypatch.setattr(repo, "revoke_share_link", fake_revoke_share)

    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[optional_user] = lambda: state["principal"]

    def _current_user():
        if state["principal"] is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=401, detail="Authentication required")
        return state["principal"]

    app.dependency_overrides[current_user] = _current_user

    # raise_server_exceptions=False so a 500 surfaces as a response, letting a
    # crash be told apart from a deliberate 403/404
    with TestClient(app, raise_server_exceptions=False) as c:
        c.state = state
        yield c

    app.dependency_overrides.clear()


def as_owner(client):
    client.state["principal"] = Principal(subject=OWNER, username="Owner")


def as_other(client):
    client.state["principal"] = Principal(subject=OTHER, username="Other")


def as_anonymous(client):
    client.state["principal"] = None


def set_visibility(client, visibility: Visibility):
    client.state["map"]["visibility"] = visibility.value


def set_share(client, permission=SharePermission.VIEW, expires_at=None, revoked=False):
    client.state["share"] = ShareLink(
        token="sharetoken",
        map_id=MAP_ID,
        permission=permission,
        created_at=now_ms(),
        expires_at=expires_at,
        revoked=revoked,
    )


# --- reading ---------------------------------------------------------------


def test_owner_can_read_private_map(client):
    as_owner(client)
    assert client.get(f"/maps/{MAP_ID}").status_code == 200


def test_other_user_cannot_read_private_map(client):
    as_other(client)
    assert client.get(f"/maps/{MAP_ID}").status_code == 404


def test_anonymous_cannot_read_private_map(client):
    as_anonymous(client)
    assert client.get(f"/maps/{MAP_ID}").status_code == 404


def test_anonymous_can_read_public_map(client):
    as_anonymous(client)
    set_visibility(client, Visibility.PUBLIC)
    assert client.get(f"/maps/{MAP_ID}").status_code == 200


def test_anonymous_can_read_unlisted_map_with_valid_token(client):
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client)
    assert client.get(f"/maps/{MAP_ID}?token=sharetoken").status_code == 200


def test_wrong_share_token_is_refused(client):
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client)
    assert client.get(f"/maps/{MAP_ID}?token=guessed").status_code == 404


def test_revoked_share_token_is_refused(client):
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client, revoked=True)
    assert client.get(f"/maps/{MAP_ID}?token=sharetoken").status_code == 404


def test_expired_share_token_is_refused(client):
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client, expires_at=now_ms() - 1000)
    assert client.get(f"/maps/{MAP_ID}?token=sharetoken").status_code == 404


def test_share_token_for_a_different_map_is_refused(client):
    """A token must not be replayable against another map."""
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    client.state["share"] = ShareLink(
        token="sharetoken",
        map_id="some-other-map",
        permission=SharePermission.VIEW,
        created_at=now_ms(),
    )
    assert client.get(f"/maps/{MAP_ID}?token=sharetoken").status_code == 404


def test_missing_map_is_404(client):
    as_owner(client)
    assert client.get("/maps/does-not-exist").status_code == 404


def test_read_returns_frontend_node_shape(client):
    as_owner(client)
    body = client.get(f"/maps/{MAP_ID}").json()

    assert body["nodes"], "expected at least one node"
    node = body["nodes"][0]
    assert set(node) == {
        "id", "parentId", "childIds", "emergesFrom", "resetsTo", "depth",
        "metadata", "energy", "resonance", "visual", "timestamps",
    }


# --- writing ---------------------------------------------------------------


def test_owner_can_replace_nodes(client):
    as_owner(client)
    payload = {"nodes": [{"id": "root", "childIds": []}], "root_id": "root"}
    assert client.put(f"/maps/{MAP_ID}/nodes", json=payload).status_code == 200


def test_other_user_cannot_replace_nodes(client):
    as_other(client)
    payload = {"nodes": [{"id": "root", "childIds": []}], "root_id": "root"}
    assert client.put(f"/maps/{MAP_ID}/nodes", json=payload).status_code == 404


def test_view_token_cannot_write(client):
    """A read-only share must not grant edit access."""
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client, permission=SharePermission.VIEW)

    payload = {"nodes": [{"id": "root", "childIds": []}], "root_id": "root"}
    resp = client.put(f"/maps/{MAP_ID}/nodes?token=sharetoken", json=payload)
    assert resp.status_code == 404


def test_edit_token_can_write(client):
    as_anonymous(client)
    set_visibility(client, Visibility.UNLISTED)
    set_share(client, permission=SharePermission.EDIT)

    payload = {"nodes": [{"id": "root", "childIds": []}], "root_id": "root"}
    resp = client.put(f"/maps/{MAP_ID}/nodes?token=sharetoken", json=payload)
    assert resp.status_code == 200


def test_public_visibility_alone_does_not_grant_write(client):
    """Readable by all must not mean writable by all."""
    as_anonymous(client)
    set_visibility(client, Visibility.PUBLIC)

    payload = {"nodes": [{"id": "root", "childIds": []}], "root_id": "root"}
    assert client.put(f"/maps/{MAP_ID}/nodes", json=payload).status_code == 404


def test_invalid_graph_is_rejected_before_reaching_the_database(client):
    as_owner(client)
    payload = {"nodes": [{"id": "a", "parentId": "ghost"}]}
    assert client.put(f"/maps/{MAP_ID}/nodes", json=payload).status_code == 422


def test_node_limit_enforced(client, settings):
    as_owner(client)
    settings.max_nodes_per_map = 3
    payload = {"nodes": [{"id": f"n{i}"} for i in range(4)]}
    assert client.put(f"/maps/{MAP_ID}/nodes", json=payload).status_code == 413


# --- metadata and deletion ------------------------------------------------


def test_owner_can_update_metadata(client):
    as_owner(client)
    assert client.patch(f"/maps/{MAP_ID}", json={"title": "Renamed"}).status_code == 200


def test_other_user_cannot_update_metadata(client):
    as_other(client)
    assert client.patch(f"/maps/{MAP_ID}", json={"title": "Hijacked"}).status_code == 404


def test_other_user_cannot_delete(client):
    as_other(client)
    assert client.delete(f"/maps/{MAP_ID}").status_code == 404
    assert "deleted" not in client.state


def test_owner_can_delete(client):
    as_owner(client)
    assert client.delete(f"/maps/{MAP_ID}").status_code == 204
    assert client.state["deleted"] == MAP_ID


def test_anonymous_cannot_delete(client):
    as_anonymous(client)
    assert client.delete(f"/maps/{MAP_ID}").status_code == 401


# --- share management -----------------------------------------------------


def test_owner_can_mint_a_share_link(client):
    as_owner(client)
    resp = client.post(f"/maps/{MAP_ID}/shares", json={"permission": "view"})
    assert resp.status_code == 201
    assert resp.json()["token"] == "freshtoken"


def test_other_user_cannot_mint_a_share_link(client):
    as_other(client)
    resp = client.post(f"/maps/{MAP_ID}/shares", json={"permission": "edit"})
    assert resp.status_code == 404


def test_edit_token_holder_cannot_mint_further_links(client):
    """Share tokens must not be escalatable into permanent access."""
    as_anonymous(client)
    set_share(client, permission=SharePermission.EDIT)
    resp = client.post(
        f"/maps/{MAP_ID}/shares?token=sharetoken", json={"permission": "edit"}
    )
    assert resp.status_code == 401


def test_other_user_cannot_list_share_links(client):
    as_other(client)
    assert client.get(f"/maps/{MAP_ID}/shares").status_code == 404


def test_owner_can_revoke(client):
    as_owner(client)
    set_share(client)
    assert client.delete(f"/maps/{MAP_ID}/shares/sharetoken").status_code == 204


def test_other_user_cannot_revoke(client):
    as_other(client)
    set_share(client)
    assert client.delete(f"/maps/{MAP_ID}/shares/sharetoken").status_code == 404


# --- unauthenticated collection routes ------------------------------------


def test_listing_my_maps_requires_auth(client):
    as_anonymous(client)
    assert client.get("/maps").status_code == 401


def test_creating_a_map_requires_auth(client):
    as_anonymous(client)
    assert client.post("/maps", json={"title": "Sneaky"}).status_code == 401


def test_health_needs_no_auth(client):
    as_anonymous(client)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
