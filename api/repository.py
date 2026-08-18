"""
api/repository.py

All Cypher lives here. Routers deal in models; this module deals in the graph.

Data model
----------
    (:User   {id, subject, username, email, created_at})
    (:MindMap{id, title, description, visibility, node_count,
              created_at, updated_at, root_id})
    (:MapNode{map_id, id, depth, label, type, tags, description,
              metadata_json, energy_json, resonance_json, visual_json,
              created, modified, last_visited})
    (:ShareLink{token, permission, created_at, expires_at, revoked})

    (:User)-[:OWNS]->(:MindMap)
    (:MindMap)-[:CONTAINS]->(:MapNode)
    (:MapNode)-[:HAS_CHILD]->(:MapNode)
    (:MindMap)-[:SHARED_VIA]->(:ShareLink)

Why HAS_CHILD *and* a parent property: the relationship is what makes traversal
cheap in Neo4j (the reason for choosing it), while childIds/parentId are what the
frontend expects on the wire. The relationships are authoritative; the scalar
properties are derived when reading.

Note on JSON columns: Neo4j properties must be primitives or arrays of
primitives, so nested objects (energy/resonance/visual and free-form metadata)
are stored as JSON strings and parsed on read. Fields worth querying or indexing
(label, type, tags, depth) are stored as real properties instead.
"""

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import db
from .models import (
    MapNode,
    MindMap,
    MindMapSummary,
    NodeEnergy,
    NodeMetadata,
    NodeResonance,
    NodeTimestamps,
    NodeVisual,
    Profile,
    Pulse,
    PulseAuthor,
    PulseCreate,
    PulseMedia,
    SharePermission,
    ShareLink,
    Visibility,
)
from .settings import Settings

logger = logging.getLogger(__name__)


def now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_urlsafe(12)}"


# --- users -----------------------------------------------------------------

UPSERT_USER = """
MERGE (u:User {subject: $subject})
ON CREATE SET
    u.id = $id,
    u.username = $username,
    u.email = $email,
    u.created_at = $now
ON MATCH SET
    u.username = coalesce($username, u.username),
    u.email = coalesce($email, u.email)
RETURN u.id AS id, u.subject AS subject, u.username AS username, u.email AS email
"""


async def upsert_user(
    settings: Settings,
    subject: str,
    username: Optional[str] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ensure a local User exists for an authenticated principal.

    Identity lives with the auth provider; this is only the local projection we
    can attach relationships to.
    """
    rows = await db.run_write(
        settings,
        UPSERT_USER,
        subject=subject,
        id=new_id("user"),
        username=username,
        email=email,
        now=now_ms(),
    )
    return rows[0]


# --- serialization ---------------------------------------------------------


def _node_to_params(node: MapNode) -> Dict[str, Any]:
    """Flatten a MapNode into Neo4j-safe primitive properties."""
    extra = node.metadata.model_dump()
    for key in ("label", "type", "tags", "description"):
        extra.pop(key, None)

    return {
        "id": node.id,
        "depth": node.depth,
        "parentId": node.parentId,
        "childIds": node.childIds,
        "label": node.metadata.label,
        "type": node.metadata.type,
        "tags": node.metadata.tags,
        "description": node.metadata.description,
        # Only the non-standard remainder, so the common fields stay queryable
        "metadata_json": json.dumps(extra) if extra else None,
        "energy_json": node.energy.model_dump_json(),
        "resonance_json": node.resonance.model_dump_json(),
        "visual_json": node.visual.model_dump_json(),
        "created": node.timestamps.created,
        "modified": node.timestamps.modified,
        "last_visited": node.timestamps.lastVisited,
    }


def _row_to_node(row: Dict[str, Any]) -> MapNode:
    """Rebuild a MapNode from a stored row, tolerating older/partial records."""

    def load(value: Optional[str], default: Dict[str, Any]) -> Dict[str, Any]:
        if not value:
            return default
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return default

    metadata_extra = load(row.get("metadata_json"), {})
    metadata = NodeMetadata(
        label=row.get("label") or "",
        type=row.get("type") or "default",
        tags=row.get("tags") or [],
        description=row.get("description") or "",
        **metadata_extra,
    )

    return MapNode(
        id=row["id"],
        parentId=row.get("parentId"),
        # Derived from HAS_CHILD relationships, which are authoritative
        childIds=[c for c in (row.get("childIds") or []) if c is not None],
        depth=row.get("depth") or 0,
        metadata=metadata,
        energy=NodeEnergy(**load(row.get("energy_json"), {})),
        resonance=NodeResonance(**load(row.get("resonance_json"), {})),
        visual=NodeVisual(**load(row.get("visual_json"), {})),
        timestamps=NodeTimestamps(
            created=row.get("created") or now_ms(),
            modified=row.get("modified") or now_ms(),
            lastVisited=row.get("last_visited"),
        ),
    )


def _row_to_summary(row: Dict[str, Any]) -> MindMapSummary:
    return MindMapSummary(
        id=row["id"],
        title=row.get("title") or "Untitled",
        description=row.get("description") or "",
        visibility=Visibility(row.get("visibility") or "private"),
        owner_id=row.get("owner_id") or "",
        owner_name=row.get("owner_name"),
        node_count=row.get("node_count") or 0,
        created_at=row.get("created_at") or now_ms(),
        updated_at=row.get("updated_at") or now_ms(),
    )


# --- mind maps -------------------------------------------------------------

CREATE_MAP = """
MATCH (u:User {subject: $subject})
CREATE (m:MindMap {
    id: $map_id,
    title: $title,
    description: $description,
    visibility: $visibility,
    root_id: $root_id,
    node_count: 0,
    created_at: $now,
    updated_at: $now
})
CREATE (u)-[:OWNS]->(m)
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
"""


async def create_map(
    settings: Settings,
    subject: str,
    title: str,
    description: str,
    visibility: Visibility,
    root_id: Optional[str],
) -> MindMapSummary:
    rows = await db.run_write(
        settings,
        CREATE_MAP,
        subject=subject,
        map_id=new_id("map"),
        title=title,
        description=description,
        visibility=visibility.value,
        root_id=root_id,
        now=now_ms(),
    )
    if not rows:
        raise LookupError("user not found")
    return _row_to_summary(rows[0])


LIST_MAPS_FOR_OWNER = """
MATCH (u:User {subject: $subject})-[:OWNS]->(m:MindMap)
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
ORDER BY m.updated_at DESC
SKIP $skip LIMIT $limit
"""


async def list_maps_for_owner(
    settings: Settings, subject: str, skip: int = 0, limit: int = 50
) -> List[MindMapSummary]:
    rows = await db.run_read(
        settings, LIST_MAPS_FOR_OWNER, subject=subject, skip=skip, limit=limit
    )
    return [_row_to_summary(r) for r in rows]


LIST_PUBLIC_MAPS = """
MATCH (u:User)-[:OWNS]->(m:MindMap {visibility: 'public'})
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
ORDER BY m.updated_at DESC
SKIP $skip LIMIT $limit
"""


async def list_public_maps(
    settings: Settings, skip: int = 0, limit: int = 50
) -> List[MindMapSummary]:
    rows = await db.run_read(settings, LIST_PUBLIC_MAPS, skip=skip, limit=limit)
    return [_row_to_summary(r) for r in rows]


GET_MAP_META = """
MATCH (u:User)-[:OWNS]->(m:MindMap {id: $map_id})
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       m.root_id AS root_id,
       u.id AS owner_id, u.subject AS owner_subject, u.username AS owner_name
"""

GET_MAP_NODES = """
MATCH (m:MindMap {id: $map_id})-[:CONTAINS]->(n:MapNode)
OPTIONAL MATCH (n)-[:HAS_CHILD]->(c:MapNode)
OPTIONAL MATCH (p:MapNode)-[:HAS_CHILD]->(n)
RETURN n.id AS id, n.depth AS depth, p.id AS parentId,
       collect(DISTINCT c.id) AS childIds,
       n.label AS label, n.type AS type, n.tags AS tags,
       n.description AS description, n.metadata_json AS metadata_json,
       n.energy_json AS energy_json, n.resonance_json AS resonance_json,
       n.visual_json AS visual_json,
       n.created AS created, n.modified AS modified, n.last_visited AS last_visited
"""


async def get_map_meta(settings: Settings, map_id: str) -> Optional[Dict[str, Any]]:
    rows = await db.run_read(settings, GET_MAP_META, map_id=map_id)
    return rows[0] if rows else None


async def get_map(settings: Settings, map_id: str) -> Optional[MindMap]:
    meta = await get_map_meta(settings, map_id)
    if meta is None:
        return None

    node_rows = await db.run_read(settings, GET_MAP_NODES, map_id=map_id)
    summary = _row_to_summary(meta)

    return MindMap(
        **summary.model_dump(),
        root_id=meta.get("root_id"),
        nodes=[_row_to_node(r) for r in node_rows],
    )


UPDATE_MAP = """
MATCH (m:MindMap {id: $map_id})
SET m.title = coalesce($title, m.title),
    m.description = coalesce($description, m.description),
    m.visibility = coalesce($visibility, m.visibility),
    m.updated_at = $now
RETURN m.id AS id
"""


async def update_map(
    settings: Settings,
    map_id: str,
    title: Optional[str],
    description: Optional[str],
    visibility: Optional[Visibility],
) -> bool:
    rows = await db.run_write(
        settings,
        UPDATE_MAP,
        map_id=map_id,
        title=title,
        description=description,
        visibility=visibility.value if visibility else None,
        now=now_ms(),
    )
    return bool(rows)


# DETACH DELETE removes relationships too, so no orphaned edges are left behind.
DELETE_MAP = """
MATCH (m:MindMap {id: $map_id})
OPTIONAL MATCH (m)-[:CONTAINS]->(n:MapNode)
OPTIONAL MATCH (m)-[:SHARED_VIA]->(s:ShareLink)
DETACH DELETE n, s, m
RETURN count(*) AS removed
"""


async def delete_map(settings: Settings, map_id: str) -> bool:
    rows = await db.run_write(settings, DELETE_MAP, map_id=map_id)
    return bool(rows)


# --- nodes -----------------------------------------------------------------

CLEAR_NODES = """
MATCH (m:MindMap {id: $map_id})-[:CONTAINS]->(n:MapNode)
DETACH DELETE n
"""

# UNWIND + MERGE writes the whole node set in one round trip. Doing this per node
# would be one network round trip each — unusable for a map of any size.
INSERT_NODES = """
MATCH (m:MindMap {id: $map_id})
UNWIND $nodes AS node
CREATE (n:MapNode {
    map_id: $map_id,
    id: node.id,
    depth: node.depth,
    label: node.label,
    type: node.type,
    tags: node.tags,
    description: node.description,
    metadata_json: node.metadata_json,
    energy_json: node.energy_json,
    resonance_json: node.resonance_json,
    visual_json: node.visual_json,
    created: node.created,
    modified: node.modified,
    last_visited: node.last_visited
})
CREATE (m)-[:CONTAINS]->(n)
"""

# Second pass: the parent may appear after the child in the input, so edges are
# linked only once every node exists.
LINK_NODES = """
UNWIND $edges AS edge
MATCH (parent:MapNode {map_id: $map_id, id: edge.parent})
MATCH (child:MapNode {map_id: $map_id, id: edge.child})
MERGE (parent)-[:HAS_CHILD]->(child)
"""

FINALIZE_MAP = """
MATCH (m:MindMap {id: $map_id})
SET m.node_count = $node_count,
    m.root_id = $root_id,
    m.updated_at = $now
RETURN m.id AS id
"""


async def replace_nodes(
    settings: Settings,
    map_id: str,
    nodes: List[MapNode],
    root_id: Optional[str],
) -> int:
    """
    Replace a map's entire node set.

    Wholesale replacement rather than diffing: the client is the source of truth
    for a map it is editing, and this keeps the write idempotent and easy to
    reason about. Revisit if maps grow large enough that resending is wasteful.
    """
    await db.run_write(settings, CLEAR_NODES, map_id=map_id)

    if nodes:
        await db.run_write(
            settings,
            INSERT_NODES,
            map_id=map_id,
            nodes=[_node_to_params(n) for n in nodes],
        )

        edges = [
            {"parent": node.id, "child": child_id}
            for node in nodes
            for child_id in node.childIds
        ]
        # Include parentId-only relationships, in case a client sets parentId
        # without mirroring it into the parent's childIds.
        known = {(e["parent"], e["child"]) for e in edges}
        for node in nodes:
            if node.parentId and (node.parentId, node.id) not in known:
                edges.append({"parent": node.parentId, "child": node.id})

        if edges:
            await db.run_write(settings, LINK_NODES, map_id=map_id, edges=edges)

    await db.run_write(
        settings,
        FINALIZE_MAP,
        map_id=map_id,
        node_count=len(nodes),
        root_id=root_id,
        now=now_ms(),
    )
    return len(nodes)


# --- share links -----------------------------------------------------------

CREATE_SHARE = """
MATCH (m:MindMap {id: $map_id})
CREATE (s:ShareLink {
    token: $token,
    permission: $permission,
    created_at: $now,
    expires_at: $expires_at,
    revoked: false
})
CREATE (m)-[:SHARED_VIA]->(s)
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
"""


async def create_share_link(
    settings: Settings,
    map_id: str,
    permission: SharePermission,
    expires_in_seconds: Optional[int],
) -> ShareLink:
    expires_at = now_ms() + expires_in_seconds * 1000 if expires_in_seconds else None

    rows = await db.run_write(
        settings,
        CREATE_SHARE,
        map_id=map_id,
        # 32 url-safe bytes: unguessable, since possessing the token is the
        # entire authorization check for an unlisted map.
        token=secrets.token_urlsafe(32),
        permission=permission.value,
        now=now_ms(),
        expires_at=expires_at,
    )
    if not rows:
        raise LookupError("map not found")

    row = rows[0]
    return ShareLink(
        token=row["token"],
        map_id=row["map_id"],
        permission=SharePermission(row["permission"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        revoked=row["revoked"],
    )


RESOLVE_SHARE = """
MATCH (m:MindMap)-[:SHARED_VIA]->(s:ShareLink {token: $token})
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
"""


async def resolve_share_link(settings: Settings, token: str) -> Optional[ShareLink]:
    rows = await db.run_read(settings, RESOLVE_SHARE, token=token)
    if not rows:
        return None

    row = rows[0]
    return ShareLink(
        token=row["token"],
        map_id=row["map_id"],
        permission=SharePermission(row["permission"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        revoked=row["revoked"],
    )


LIST_SHARES = """
MATCH (m:MindMap {id: $map_id})-[:SHARED_VIA]->(s:ShareLink)
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
ORDER BY s.created_at DESC
"""


async def list_share_links(settings: Settings, map_id: str) -> List[ShareLink]:
    rows = await db.run_read(settings, LIST_SHARES, map_id=map_id)
    return [
        ShareLink(
            token=r["token"],
            map_id=r["map_id"],
            permission=SharePermission(r["permission"]),
            created_at=r["created_at"],
            expires_at=r["expires_at"],
            revoked=r["revoked"],
        )
        for r in rows
    ]


# Revoke rather than delete, so a leaked token can never be reissued to a
# different map and the audit trail survives.
REVOKE_SHARE = """
MATCH (m:MindMap {id: $map_id})-[:SHARED_VIA]->(s:ShareLink {token: $token})
SET s.revoked = true
RETURN s.token AS token
"""


async def revoke_share_link(settings: Settings, map_id: str, token: str) -> bool:
    rows = await db.run_write(settings, REVOKE_SHARE, map_id=map_id, token=token)
    return bool(rows)


COUNT_MAPS_FOR_OWNER = """
MATCH (u:User {subject: $subject})-[:OWNS]->(m:MindMap)
RETURN count(m) AS total
"""


async def count_maps_for_owner(settings: Settings, subject: str) -> int:
    rows = await db.run_read(settings, COUNT_MAPS_FOR_OWNER, subject=subject)
    return rows[0]["total"] if rows else 0


# --- feed / pulses ---------------------------------------------------------
#
# Data model:
#
#   (:User)-[:POSTED]->(:Pulse)
#   (:User)-[:RESONATED_WITH]->(:Pulse)
#   (:User)-[:REPORTED {reason, at}]->(:Pulse)
#   (:User)-[:BLOCKED]->(:User)
#
# Two things are deliberately derived rather than stored:
#
#   * `resonators` is the count of RESONATED_WITH relationships. Keeping a
#     counter property beside them would let the two drift, and a like count that
#     disagrees with who liked it is worse than a slower query.
#   * `resonance` (0..1) is computed from that count. It is a display value, so
#     storing it would mean recomputing every row on every scale change anyway.
#
# Media is stored as a JSON string for the same reason node metadata is: Neo4j
# properties must be primitives or arrays of primitives.


def _row_to_pulse(row: Dict[str, Any], viewer_subject: Optional[str] = None) -> Pulse:
    """Build a Pulse from a query row.

    Resonance is a saturating curve rather than a ratio: there is no meaningful
    denominator on a feed, and 10 resonators should read as clearly stronger than
    1 without 1000 being needed to fill the ring.
    """
    resonators = int(row.get("resonators") or 0)
    resonance = 1.0 - (1.0 / (1.0 + resonators / 5.0)) if resonators else 0.0

    media_raw = row.get("media_json")
    media = None
    if media_raw:
        try:
            media = PulseMedia(**json.loads(media_raw))
        except (ValueError, TypeError):
            # A pulse whose media cannot be parsed is still a readable pulse.
            # Dropping the attachment beats failing the whole feed request.
            logger.warning("Pulse %s has unreadable media_json", row.get("id"))

    return Pulse(
        id=row["id"],
        title=row.get("title") or "",
        preview=row.get("preview") or "",
        author=PulseAuthor(
            # display_name first: it is the one the user chose. `username` comes
            # from the auth provider and is usually absent, which is why posts
            # were attributed to "Anonymous".
            id=row.get("author_id") or "unknown",
            name=row.get("author_display_name")
                 or row.get("author_name")
                 or "Anonymous",
            avatar=row.get("author_avatar"),
        ),
        tags=list(row.get("tags") or []),
        media=media,
        visibility=Visibility(row.get("visibility") or "public"),
        timestamp=int(row.get("created_at") or 0),
        edited_at=int(row["edited_at"]) if row.get("edited_at") else None,
        resonance=round(resonance, 4),
        resonators=resonators,
        resonated=bool(row.get("resonated")),
        own=bool(viewer_subject) and row.get("author_subject") == viewer_subject,
    )


CREATE_PULSE = """
MATCH (u:User {subject: $subject})
CREATE (p:Pulse {
    id: $id,
    title: $title,
    preview: $preview,
    tags: $tags,
    media_json: $media_json,
    visibility: $visibility,
    created_at: $now,
    reports: 0
})
CREATE (u)-[:POSTED]->(p)
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       0 AS resonators, false AS resonated,
       u.id AS author_id, u.username AS author_name, u.subject AS author_subject,
       u.display_name AS author_display_name, u.avatar_url AS author_avatar
"""


async def create_pulse(
    settings: Settings, subject: str, pulse: PulseCreate
) -> Optional[Pulse]:
    """Post a pulse. Returns None when the author has no User node."""
    rows = await db.run_write(
        settings,
        CREATE_PULSE,
        subject=subject,
        id=new_id("pulse"),
        title=pulse.title,
        preview=pulse.preview,
        tags=pulse.tags,
        media_json=pulse.media.model_dump_json() if pulse.media else None,
        visibility=pulse.visibility.value,
        now=now_ms(),
    )
    if not rows:
        return None
    return _row_to_pulse(rows[0], subject)


# Newest first, skipping anything from a blocked author.
#
# The block check is part of the query rather than a filter applied afterwards:
# filtering in Python would make `limit` mean "up to N, minus however many were
# blocked", so a user who blocks a prolific poster would get short pages.
LIST_FEED = """
MATCH (author:User)-[:POSTED]->(p:Pulse)
WHERE p.visibility = 'public'
  AND ($viewer IS NULL OR NOT EXISTS {
      MATCH (v:User {subject: $viewer})-[:BLOCKED]->(author)
  })
  AND ($tag IS NULL OR $tag IN p.tags)
OPTIONAL MATCH (p)<-[r:RESONATED_WITH]-(:User)
WITH p, author, count(r) AS resonators
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       resonators,
       mine IS NOT NULL AS resonated,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
ORDER BY p.created_at DESC
SKIP $skip LIMIT $limit
"""


async def list_feed(
    settings: Settings,
    viewer_subject: Optional[str] = None,
    skip: int = 0,
    limit: int = 30,
    tag: Optional[str] = None,
) -> List[Pulse]:
    rows = await db.run_read(
        settings,
        LIST_FEED,
        viewer=viewer_subject,
        skip=skip,
        limit=limit,
        tag=tag.lower().lstrip("#") if tag else None,
    )
    return [_row_to_pulse(row, viewer_subject) for row in rows]


LIST_OWN_PULSES = """
MATCH (author:User {subject: $subject})-[:POSTED]->(p:Pulse)
OPTIONAL MATCH (p)<-[r:RESONATED_WITH]-(:User)
WITH p, author, count(r) AS resonators
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $subject})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       resonators,
       mine IS NOT NULL AS resonated,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
ORDER BY p.created_at DESC
SKIP $skip LIMIT $limit
"""


async def list_own_pulses(
    settings: Settings, subject: str, skip: int = 0, limit: int = 30
) -> List[Pulse]:
    """Everything the caller posted, private pulses included."""
    rows = await db.run_read(
        settings, LIST_OWN_PULSES, subject=subject, skip=skip, limit=limit
    )
    return [_row_to_pulse(row, subject) for row in rows]


GET_PULSE = """
MATCH (author:User)-[:POSTED]->(p:Pulse {id: $pulse_id})
OPTIONAL MATCH (p)<-[r:RESONATED_WITH]-(:User)
WITH p, author, count(r) AS resonators
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       resonators,
       mine IS NOT NULL AS resonated,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
"""


async def get_pulse(
    settings: Settings, pulse_id: str, viewer_subject: Optional[str] = None
) -> Optional[Pulse]:
    rows = await db.run_read(
        settings, GET_PULSE, pulse_id=pulse_id, viewer=viewer_subject
    )
    if not rows:
        return None
    return _row_to_pulse(rows[0], viewer_subject)


DELETE_PULSE = """
MATCH (u:User {subject: $subject})-[:POSTED]->(p:Pulse {id: $pulse_id})
DETACH DELETE p
RETURN count(*) AS deleted
"""


async def delete_pulse(settings: Settings, subject: str, pulse_id: str) -> bool:
    """Delete one of the caller's own pulses.

    Ownership is expressed in the MATCH rather than checked beforehand, so there
    is no window between the check and the delete, and no way to reach this with
    someone else's pulse id.
    """
    rows = await db.run_write(
        settings, DELETE_PULSE, subject=subject, pulse_id=pulse_id
    )
    return bool(rows and rows[0].get("deleted"))


RESONATE = """
MATCH (u:User {subject: $subject})
MATCH (p:Pulse {id: $pulse_id})
MERGE (u)-[:RESONATED_WITH]->(p)
RETURN count(*) AS ok
"""

UNRESONATE = """
MATCH (:User {subject: $subject})-[r:RESONATED_WITH]->(:Pulse {id: $pulse_id})
DELETE r
RETURN count(*) AS ok
"""


async def set_resonance(
    settings: Settings, subject: str, pulse_id: str, on: bool
) -> bool:
    """Add or remove the caller's resonance.

    MERGE, not CREATE: resonating twice is the same as resonating once, and a
    double tap on a phone must not produce two relationships.
    """
    rows = await db.run_write(
        settings, RESONATE if on else UNRESONATE, subject=subject, pulse_id=pulse_id
    )
    return bool(rows and rows[0].get("ok"))


# --- moderation ------------------------------------------------------------
#
# The minimum a feed open to strangers needs before it accepts their content.
# None of this is optional: without it the first abusive post has no path to
# removal except a database console.

REPORT_PULSE = """
MATCH (u:User {subject: $subject})
MATCH (p:Pulse {id: $pulse_id})
MERGE (u)-[r:REPORTED]->(p)
ON CREATE SET r.reason = $reason, r.at = $now
WITH p
OPTIONAL MATCH (p)<-[all_reports:REPORTED]-(:User)
WITH p, count(all_reports) AS total
SET p.reports = total
RETURN total
"""


async def report_pulse(
    settings: Settings, subject: str, pulse_id: str, reason: str
) -> Optional[int]:
    """Record a report and return the pulse's total report count.

    MERGE keyed on the reporter, so one person cannot inflate the count by
    reporting repeatedly. `reports` is denormalised onto the pulse only because
    an admin queue needs to sort by it.
    """
    rows = await db.run_write(
        settings,
        REPORT_PULSE,
        subject=subject,
        pulse_id=pulse_id,
        reason=reason,
        now=now_ms(),
    )
    if not rows:
        return None
    return int(rows[0].get("total") or 0)


BLOCK_USER = """
MATCH (me:User {subject: $subject})
MATCH (them:User {id: $target_id})
WHERE them.subject <> $subject
MERGE (me)-[:BLOCKED]->(them)
RETURN count(*) AS ok
"""

UNBLOCK_USER = """
MATCH (:User {subject: $subject})-[b:BLOCKED]->(:User {id: $target_id})
DELETE b
RETURN count(*) AS ok
"""


async def set_block(
    settings: Settings, subject: str, target_id: str, blocked: bool
) -> bool:
    """Block or unblock another user.

    The `them.subject <> $subject` guard stops self-blocking, which would silently
    empty the blocker's own feed.
    """
    rows = await db.run_write(
        settings,
        BLOCK_USER if blocked else UNBLOCK_USER,
        subject=subject,
        target_id=target_id,
    )
    return bool(rows and rows[0].get("ok"))


LIST_BLOCKED = """
MATCH (:User {subject: $subject})-[:BLOCKED]->(them:User)
RETURN them.id AS id, them.username AS name
ORDER BY them.username
"""


async def list_blocked(settings: Settings, subject: str) -> List[Dict[str, Any]]:
    return await db.run_read(settings, LIST_BLOCKED, subject=subject)


COUNT_RECENT_PULSES = """
MATCH (:User {subject: $subject})-[:POSTED]->(p:Pulse)
WHERE p.created_at > $since
RETURN count(p) AS recent
"""


async def count_recent_pulses(settings: Settings, subject: str, window_ms: int) -> int:
    """How many pulses the caller posted inside the window.

    The rate limit is derived from stored data rather than an in-process counter
    on purpose: Render runs more than one instance, and a per-process counter
    would give each of them its own allowance.
    """
    rows = await db.run_read(
        settings,
        COUNT_RECENT_PULSES,
        subject=subject,
        since=now_ms() - window_ms,
    )
    return int(rows[0]["recent"]) if rows else 0


# --- profile ---------------------------------------------------------------

GET_PROFILE = """
MATCH (u:User {subject: $subject})
RETURN u.id AS id, u.display_name AS display_name, u.avatar_url AS avatar_url,
       u.username AS username, u.email AS email
"""


async def get_profile(settings: Settings, subject: str) -> Optional[Profile]:
    rows = await db.run_read(settings, GET_PROFILE, subject=subject)
    return Profile(**rows[0]) if rows else None


UPDATE_PROFILE = """
MATCH (u:User {subject: $subject})
SET u.display_name = CASE WHEN $set_name   THEN $display_name ELSE u.display_name END,
    u.avatar_url   = CASE WHEN $set_avatar THEN $avatar_url   ELSE u.avatar_url   END
RETURN u.id AS id, u.display_name AS display_name, u.avatar_url AS avatar_url,
       u.username AS username, u.email AS email
"""


async def update_profile(
    settings: Settings,
    subject: str,
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    set_name: bool = False,
    set_avatar: bool = False,
) -> Optional[Profile]:
    """Partial profile update.

    The `set_*` flags exist because null is a meaningful value here: omitting a
    field must leave it alone, while explicitly sending null must clear it. A
    plain `coalesce($x, u.x)` cannot express the difference, so a user could never
    remove an avatar once set.
    """
    rows = await db.run_write(
        settings,
        UPDATE_PROFILE,
        subject=subject,
        display_name=display_name,
        avatar_url=avatar_url,
        set_name=set_name,
        set_avatar=set_avatar,
    )
    return Profile(**rows[0]) if rows else None


UPDATE_PULSE = """
MATCH (u:User {subject: $subject})-[:POSTED]->(p:Pulse {id: $pulse_id})
SET p.title      = CASE WHEN $set_title      THEN $title      ELSE p.title      END,
    p.preview    = CASE WHEN $set_preview    THEN $preview    ELSE p.preview    END,
    p.tags       = CASE WHEN $set_tags       THEN $tags       ELSE p.tags       END,
    p.media_json = CASE WHEN $set_media      THEN $media_json ELSE p.media_json END,
    p.visibility = CASE WHEN $set_visibility THEN $visibility ELSE p.visibility END,
    p.edited_at  = $now
RETURN count(*) AS updated
"""


async def update_pulse(
    settings: Settings, subject: str, pulse_id: str, changes: Dict[str, Any]
) -> bool:
    """Edit one of the caller's own pulses.

    Ownership is in the MATCH, so this cannot reach another author's pulse and
    there is no window between checking and writing. `edited_at` is always set:
    a reader is entitled to know a post has changed since it was published.
    """
    rows = await db.run_write(
        settings,
        UPDATE_PULSE,
        subject=subject,
        pulse_id=pulse_id,
        title=changes.get("title"),
        preview=changes.get("preview"),
        tags=changes.get("tags"),
        media_json=changes.get("media_json"),
        visibility=changes.get("visibility"),
        set_title="title" in changes,
        set_preview="preview" in changes,
        set_tags="tags" in changes,
        set_media="media" in changes,
        set_visibility="visibility" in changes,
        now=now_ms(),
    )
    return bool(rows and rows[0].get("updated"))
