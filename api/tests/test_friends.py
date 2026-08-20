"""
Friends: who may ask, what a refusal is allowed to say, and the rules that keep
two people from disagreeing about whether they are friends.

Two layers, because the rules live in two places.

**Against a fake graph.** The repository is replaced by a small in-memory social
graph that mirrors the Cypher's semantics — one-way storage, undirected matching,
blocks resolved inside the write. Stubs that returned canned values would make
every test below pass no matter what the rules were; a model that can be wrong is
the only kind worth asserting against.

**Against the query text.** A few properties exist nowhere but in the Cypher: that
UNFRIEND matches undirected, that a request cannot cross a block, that a friendship
is stored once. The fake can agree with those and the database still not, so they
are checked where they are written.

The privacy rule is the one worth being loud about: a refusal says only that it was
refused. Blocked in either direction, already friends, aimed at yourself — one
message for all of them, because "they have blocked you" announces a block, and a
block should be quiet.
"""

import time

import pytest
from fastapi.testclient import TestClient

from api import repository as repo
from api.auth import Principal, current_user
from api.main import app
from api.models import Friend
from api.settings import Settings, get_settings

ME = "user_me"
THEM = "user_them"
THIRD = "user_third"

ME_ID = "u-me"
THEM_ID = "u-them"
THIRD_ID = "u-third"


def now_ms():
    return int(time.time() * 1000)


class FakeGraph:
    """An in-memory stand-in for the friends half of the graph.

    Mirrors the storage decisions rather than papering over them: a friendship is
    ONE undirected fact (a frozenset, which cannot be half-deleted), a request is a
    directed pair, and every write re-checks blocks itself instead of trusting the
    caller to have asked in the right order.
    """

    def __init__(self):
        self.users = {
            ME_ID: {"id": ME_ID, "subject": ME, "username": "me", "name": "Me"},
            THEM_ID: {"id": THEM_ID, "subject": THEM, "username": "Them", "name": "Them"},
            THIRD_ID: {"id": THIRD_ID, "subject": THIRD, "username": "third", "name": "Third"},
        }
        self.requested = set()     # (from_id, to_id)
        self.friends = {}          # frozenset({a, b}) -> since
        self.blocked = set()       # (blocker_id, blocked_id)

    # -- helpers the Cypher expresses as patterns ---------------------------

    def id_of(self, subject):
        for user in self.users.values():
            if user["subject"] == subject:
                return user["id"]
        return None

    def blocks_either_way(self, a, b):
        return (a, b) in self.blocked or (b, a) in self.blocked

    def are_friends(self, a, b):
        return frozenset({a, b}) in self.friends

    def as_friend(self, user_id, since=None):
        user = self.users[user_id]
        return Friend(
            id=user["id"],
            username=user.get("username"),
            name=user.get("name") or "Someone",
            avatar=user.get("avatar"),
            since=since,
        )

    # -- the repository surface ---------------------------------------------

    async def send_friend_request(self, _settings, subject, target_id):
        me = self.id_of(subject)
        if me is None or target_id not in self.users:
            return "refused"
        if me == target_id or self.blocks_either_way(me, target_id) or self.are_friends(me, target_id):
            return "refused"
        self.requested.add((me, target_id))
        if (target_id, me) in self.requested:
            # Both have asked, so asking back IS the answer.
            self.requested.discard((me, target_id))
            self.requested.discard((target_id, me))
            self.friends[frozenset({me, target_id})] = now_ms()
            return "friends"
        return "sent"

    async def accept_friend_request(self, _settings, subject, target_id):
        me = self.id_of(subject)
        if me is None or (target_id, me) not in self.requested:
            return False
        if self.blocks_either_way(me, target_id):
            return False
        self.requested.discard((target_id, me))
        self.friends[frozenset({me, target_id})] = now_ms()
        return True

    async def drop_friend_request(self, _settings, subject, target_id):
        me = self.id_of(subject)
        pair = {(me, target_id), (target_id, me)} & self.requested
        self.requested -= pair
        return bool(pair)

    async def unfriend(self, _settings, subject, target_id):
        me = self.id_of(subject)
        return self.friends.pop(frozenset({me, target_id}), None) is not None

    async def list_friends(self, _settings, subject):
        me = self.id_of(subject)
        out = [
            self.as_friend(next(iter(pair - {me})), since)
            for pair, since in self.friends.items()
            if me in pair
        ]
        return sorted(out, key=lambda f: f.name)

    async def list_friend_requests(self, _settings, subject):
        me = self.id_of(subject)
        return {
            # Incoming from someone in a block relationship is hidden: an answer
            # you are not allowed to give is not a decision worth showing.
            "incoming": [
                self.as_friend(a)
                for (a, b) in sorted(self.requested)
                if b == me and not self.blocks_either_way(me, a)
            ],
            "outgoing": [
                self.as_friend(b) for (a, b) in sorted(self.requested) if a == me
            ],
        }

    async def find_user_by_username(self, _settings, username):
        for user in self.users.values():
            if (user.get("username") or "").lower() == username.lower():
                return self.as_friend(user["id"])
        return None

    async def set_block(self, _settings, subject, target_id, blocked):
        me = self.id_of(subject)
        if me is None or target_id not in self.users or me == target_id:
            return False
        if blocked:
            self.blocked.add((me, target_id))
            # Same write, not a follow-up call: blocking ends the friendship and
            # cancels pending requests in either direction.
            self.friends.pop(frozenset({me, target_id}), None)
            self.requested -= {(me, target_id), (target_id, me)}
        else:
            # Unblocking deliberately does not restore anything it removed.
            self.blocked.discard((me, target_id))
        return True

    async def upsert_user(self, _settings, subject, username=None, email=None):
        return {"id": self.id_of(subject), "subject": subject, "username": username}


@pytest.fixture
def settings():
    return Settings(
        environment="development",
        neo4j_uri="bolt://localhost:7687",
        neo4j_password="test",
        clerk_issuer="https://example.clerk.accounts.dev",
    )


@pytest.fixture
def graph():
    return FakeGraph()


@pytest.fixture
def client(monkeypatch, settings, graph):
    for name in (
        "send_friend_request",
        "accept_friend_request",
        "drop_friend_request",
        "unfriend",
        "list_friends",
        "list_friend_requests",
        "find_user_by_username",
        "set_block",
        "upsert_user",
    ):
        monkeypatch.setattr(repo, name, getattr(graph, name))

    state = {"principal": ME}

    def fake_current_user():
        if state["principal"] is None:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in")
        return Principal(subject=state["principal"])

    app.dependency_overrides[current_user] = fake_current_user
    app.dependency_overrides[get_settings] = lambda: settings

    test_client = TestClient(app)
    test_client.state = state
    test_client.graph = graph
    yield test_client
    app.dependency_overrides.clear()


def as_user(client, subject):
    client.state["principal"] = subject
    return client


# --- who may ask -------------------------------------------------------------

def test_a_signed_out_visitor_has_no_friends_api(client):
    """Every route, not just the writes. A friend list read out signed-out would
    be a list of somebody's connections handed to nobody in particular."""
    client.state["principal"] = None
    for method, path in [
        ("get", "/pulses/friends"),
        ("get", "/pulses/friends/requests"),
        ("get", "/pulses/friends/lookup/them"),
        ("post", f"/pulses/friends/{THEM_ID}"),
        ("post", f"/pulses/friends/{THEM_ID}/accept"),
        ("delete", f"/pulses/friends/requests/{THEM_ID}"),
        ("delete", f"/pulses/friends/{THEM_ID}"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 401, f"{method.upper()} {path} answered signed out"


def test_asking_sends_a_request(client):
    response = client.post(f"/pulses/friends/{THEM_ID}")
    assert response.status_code == 202
    assert response.json()["status"] == "sent"
    assert (ME_ID, THEM_ID) in client.graph.requested
    # Not friends yet — one person asking is not two people agreeing.
    assert not client.graph.are_friends(ME_ID, THEM_ID)


def test_asking_twice_is_still_one_request(client):
    client.post(f"/pulses/friends/{THEM_ID}")
    assert client.post(f"/pulses/friends/{THEM_ID}").status_code == 202
    assert len([p for p in client.graph.requested if p == (ME_ID, THEM_ID)]) == 1


def test_you_cannot_befriend_yourself(client):
    assert client.post(f"/pulses/friends/{ME_ID}").status_code == 409
    assert not client.graph.requested


def test_asking_a_stranger_who_does_not_exist_is_refused(client):
    assert client.post("/pulses/friends/u-nobody").status_code == 409


# --- the mutual case ---------------------------------------------------------

def test_both_asking_makes_them_friends(client):
    """Otherwise two people who both press the button each wait for the other,
    with nothing left to accept."""
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    response = as_user(client, ME).post(f"/pulses/friends/{THEM_ID}")

    assert response.status_code == 202
    assert response.json()["status"] == "friends"
    assert client.graph.are_friends(ME_ID, THEM_ID)
    # And nothing is left pending in either direction.
    assert not client.graph.requested


def test_accepting_makes_them_friends_both_ways(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")

    assert as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept").status_code == 200

    mine = as_user(client, ME).get("/pulses/friends").json()
    theirs = as_user(client, THEM).get("/pulses/friends").json()
    assert [f["id"] for f in mine] == [THEM_ID]
    assert [f["id"] for f in theirs] == [ME_ID]


def test_accepting_a_request_nobody_sent_is_a_404(client):
    assert client.post(f"/pulses/friends/{THEM_ID}/accept").status_code == 404


def test_you_cannot_accept_your_own_outgoing_request(client):
    """The direction matters here even though unfriending is undirected: accepting
    your own request would let one person make a friendship alone."""
    client.post(f"/pulses/friends/{THEM_ID}")
    assert client.post(f"/pulses/friends/{THEM_ID}/accept").status_code == 404
    assert not client.graph.are_friends(ME_ID, THEM_ID)


# --- withdrawing and declining ----------------------------------------------

def test_declining_a_request_aimed_at_you(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    assert as_user(client, ME).delete(f"/pulses/friends/requests/{THEM_ID}").status_code == 204
    assert not client.graph.requested
    assert not client.graph.are_friends(ME_ID, THEM_ID)


def test_withdrawing_a_request_you_sent(client):
    """The same endpoint as declining, because both mean the request should not
    exist and the underlying match is undirected."""
    client.post(f"/pulses/friends/{THEM_ID}")
    assert client.delete(f"/pulses/friends/requests/{THEM_ID}").status_code == 204
    assert not client.graph.requested


def test_dropping_a_request_that_is_not_there_is_a_404(client):
    assert client.delete(f"/pulses/friends/requests/{THEM_ID}").status_code == 404


def test_a_declined_request_can_be_sent_again(client):
    """Declining is not blocking. Conflating them would make one dismissed tap
    permanent, with nothing on screen saying so."""
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).delete(f"/pulses/friends/requests/{THEM_ID}")

    assert as_user(client, THEM).post(f"/pulses/friends/{ME_ID}").json()["status"] == "sent"


# --- unfriending -------------------------------------------------------------

def test_either_party_can_unfriend(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept")

    # The friendship was stored from ME's side; THEM ends it anyway.
    assert as_user(client, THEM).delete(f"/pulses/friends/{ME_ID}").status_code == 204
    assert not client.graph.are_friends(ME_ID, THEM_ID)
    assert as_user(client, ME).get("/pulses/friends").json() == []


def test_unfriending_someone_you_are_not_friends_with_is_a_404(client):
    assert client.delete(f"/pulses/friends/{THEM_ID}").status_code == 404


def test_unfriending_can_be_undone_by_asking_again(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept")
    as_user(client, ME).delete(f"/pulses/friends/{THEM_ID}")

    assert as_user(client, ME).post(f"/pulses/friends/{THEM_ID}").json()["status"] == "sent"


# --- blocking ----------------------------------------------------------------

def test_blocking_ends_the_friendship_and_cancels_requests(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept")
    as_user(client, THIRD).post(f"/pulses/friends/{ME_ID}")

    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=true")

    assert not client.graph.are_friends(ME_ID, THEM_ID)
    assert as_user(client, ME).get("/pulses/friends").json() == []
    # The unrelated request survives — blocking one person is not clearing the inbox.
    incoming = as_user(client, ME).get("/pulses/friends/requests").json()["incoming"]
    assert [f["id"] for f in incoming] == [THIRD_ID]


def test_a_blocked_person_cannot_ask(client):
    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=true")
    assert as_user(client, THEM).post(f"/pulses/friends/{ME_ID}").status_code == 409
    assert not client.graph.requested


def test_you_cannot_ask_someone_you_have_blocked(client):
    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=true")
    assert as_user(client, ME).post(f"/pulses/friends/{THEM_ID}").status_code == 409


def test_a_refusal_does_not_say_why(client):
    """The privacy rule. Being blocked, already being friends and aiming at
    yourself must be indistinguishable from the outside — a distinct message for
    the block case would announce the block."""
    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=true")
    blocked = as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")

    as_user(client, THIRD).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THIRD_ID}/accept")
    already = as_user(client, ME).post(f"/pulses/friends/{THIRD_ID}")

    myself = as_user(client, ME).post(f"/pulses/friends/{ME_ID}")

    assert blocked.status_code == already.status_code == myself.status_code == 409
    assert blocked.json()["detail"] == already.json()["detail"] == myself.json()["detail"]
    assert "block" not in blocked.json()["detail"].lower()


def test_unblocking_does_not_restore_the_friendship(client):
    """Deliberate. Reinstating a connection someone ended is not an undo — it is
    a decision made on their behalf."""
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept")
    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=true")
    as_user(client, ME).put(f"/pulses/authors/{THEM_ID}/block?blocked=false")

    assert as_user(client, ME).get("/pulses/friends").json() == []


# --- listing -----------------------------------------------------------------

def test_requests_are_listed_in_both_directions(client):
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THIRD_ID}")

    body = as_user(client, ME).get("/pulses/friends/requests").json()
    assert [f["id"] for f in body["incoming"]] == [THEM_ID]
    assert [f["id"] for f in body["outgoing"]] == [THIRD_ID]


def test_a_friend_carries_a_handle_and_no_more(client):
    """A friend list is a way to reach people, not a place to render profiles.
    Fifty friends must not drag fifty bios across the wire."""
    as_user(client, THEM).post(f"/pulses/friends/{ME_ID}")
    as_user(client, ME).post(f"/pulses/friends/{THEM_ID}/accept")

    friend = as_user(client, ME).get("/pulses/friends").json()[0]
    assert friend["username"] == "Them"
    assert friend["since"]
    assert not {"bio", "email", "subject"} & friend.keys()


# --- lookup ------------------------------------------------------------------

def test_lookup_is_case_insensitive(client):
    """A handle people type from memory is a handle people mistype the case of."""
    response = client.get("/pulses/friends/lookup/tHeM")
    assert response.status_code == 200
    assert response.json()["id"] == THEM_ID


def test_lookup_is_exact_not_a_prefix(client):
    """A prefix search over every user is a way to enumerate the membership."""
    assert client.get("/pulses/friends/lookup/the").status_code == 404
    assert client.get("/pulses/friends/lookup/th").status_code == 404


def test_lookup_of_an_unknown_handle_is_a_404(client):
    assert client.get("/pulses/friends/lookup/nobody-at-all").status_code == 404


# --- the parts that live only in the Cypher ----------------------------------
#
# The fake above can agree with these and the database still not, because they are
# properties of the query text rather than of any Python.

def normalise(query):
    return " ".join(query.split())


def test_a_friendship_is_stored_once():
    """One row cannot disagree with itself. Two rows can, and the day one delete
    succeeds and the other does not, the graph says two contradictory things about
    the same pair."""
    for query in (repo.ACCEPT_IF_MUTUAL, repo.ACCEPT_FRIEND_REQUEST):
        merges = normalise(query).count("MERGE (me)-[f:FRIENDS_WITH]->(them)")
        assert merges == 1, f"expected one stored direction, found {merges}"
        assert "MERGE (them)-[" not in normalise(query)


def test_unfriending_and_dropping_a_request_match_undirected():
    """Stored one way, ended by either party. A directed match would let one of
    them unfriend and leave the other still friends."""
    assert "-[f:FRIENDS_WITH]-(them" in normalise(repo.UNFRIEND)
    assert "-[f:FRIENDS_WITH]->(them" not in normalise(repo.UNFRIEND)
    assert "-[r:REQUESTED]-(them" in normalise(repo.DROP_FRIEND_REQUEST)
    assert "-[r:REQUESTED]->(them" not in normalise(repo.DROP_FRIEND_REQUEST)


def test_every_path_into_a_friendship_checks_for_a_block():
    """Sending, accepting and being shown a request are three ways in, and a check
    missing from any one of them is a way around the block."""
    for name in ("SEND_FRIEND_REQUEST", "ACCEPT_FRIEND_REQUEST", "LIST_INCOMING_REQUESTS"):
        query = normalise(getattr(repo, name))
        assert "NOT EXISTS { MATCH (me)-[:BLOCKED]-(them) }" in query, f"{name} skips the block check"


def test_blocking_ends_the_friendship_in_the_same_write():
    """Not a follow-up call. A second statement can fail on its own, leaving
    somebody blocked and still friends."""
    query = normalise(repo.BLOCK_USER)
    assert "OPTIONAL MATCH (me)-[f:FRIENDS_WITH]-(them) DELETE f" in query
    assert "OPTIONAL MATCH (me)-[r:REQUESTED]-(them) DELETE r" in query


def test_username_lookup_compares_whole_handles():
    """STARTS WITH or CONTAINS here would turn one endpoint into a directory."""
    query = normalise(repo.FIND_USER_BY_USERNAME)
    assert "toLower(them.username) = toLower($username)" in query
    for scanning in ("STARTS WITH", "CONTAINS", "=~"):
        assert scanning not in query
