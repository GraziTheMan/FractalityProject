"""
api/models.py

Wire schemas.

The node shape is dictated by the frontend: it mirrors FractalNode.toJSON() in
src/shared/NodeSchema.js field for field, so a map fetched from this API can be
handed to the existing loaders without translation. Note `childIds` — the
frontend keeps that name for compatibility even though its internal field is
`children`.

Keep this file and NodeSchema.js in step. If they drift, the 3D view silently
renders empty branches.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def _now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


class Visibility(str, Enum):
    """
    Mirrors PrivacyLevel in core/users/consciousness_user.py.

    PRIVATE   owner only
    UNLISTED  anyone holding a share link
    PUBLIC    discoverable
    """

    PRIVATE = "private"
    UNLISTED = "unlisted"
    PUBLIC = "public"


class SharePermission(str, Enum):
    VIEW = "view"
    EDIT = "edit"


# --- node ------------------------------------------------------------------


class NodeEnergy(BaseModel):
    ATP: float = 1.0
    efficiency: float = 1.0
    network: str = "default"


class NodeResonance(BaseModel):
    semanticScore: float = 0.0
    tfidfScore: float = 0.0
    connections: List[str] = Field(default_factory=list)


class NodePosition(BaseModel):
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


class NodeVisual(BaseModel):
    position: NodePosition = Field(default_factory=NodePosition)
    scale: float = 1.0
    color: str = "#00ff00"
    glow: float = 0.0


class NodeTimestamps(BaseModel):
    created: int = Field(default_factory=_now_ms)
    modified: int = Field(default_factory=_now_ms)
    lastVisited: Optional[int] = None


class NodeMetadata(BaseModel):
    label: str = ""
    type: str = "default"
    tags: List[str] = Field(default_factory=list)
    description: str = ""

    # Callers may attach arbitrary extra metadata, as the frontend allows
    model_config = {"extra": "allow"}


class MapNode(BaseModel):
    """One node of a mind map, matching FractalNode.toJSON()."""

    id: str
    parentId: Optional[str] = None
    childIds: List[str] = Field(default_factory=list)
    depth: int = 0
    metadata: NodeMetadata = Field(default_factory=NodeMetadata)
    energy: NodeEnergy = Field(default_factory=NodeEnergy)
    resonance: NodeResonance = Field(default_factory=NodeResonance)
    visual: NodeVisual = Field(default_factory=NodeVisual)
    timestamps: NodeTimestamps = Field(default_factory=NodeTimestamps)

    @field_validator("id")
    @classmethod
    def _id_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("node id must not be blank")
        return v

    @model_validator(mode="after")
    def _no_self_reference(self) -> "MapNode":
        # Mirrors FractalNode.validate(): a self-parent or self-child produces
        # an infinite loop in the layout engine.
        if self.parentId == self.id:
            raise ValueError(f"node {self.id} cannot be its own parent")
        if self.id in self.childIds:
            raise ValueError(f"node {self.id} cannot be its own child")
        return self


# --- mind map --------------------------------------------------------------


class MindMapSummary(BaseModel):
    """Listing view: no nodes, so listing many maps stays cheap."""

    id: str
    title: str
    description: str = ""
    visibility: Visibility = Visibility.PRIVATE
    owner_id: str
    owner_name: Optional[str] = None
    node_count: int = 0
    created_at: int
    updated_at: int


class MindMap(MindMapSummary):
    """Full view, including nodes."""

    nodes: List[MapNode] = Field(default_factory=list)
    root_id: Optional[str] = None


class MindMapCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    visibility: Visibility = Visibility.PRIVATE
    nodes: List[MapNode] = Field(default_factory=list)
    root_id: Optional[str] = None

    @model_validator(mode="after")
    def _check_graph(self) -> "MindMapCreate":
        validate_graph(self.nodes, self.root_id)
        return self


class MindMapUpdate(BaseModel):
    """Partial update; omitted fields are left alone."""

    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    visibility: Optional[Visibility] = None


class NodesReplace(BaseModel):
    """Wholesale replacement of a map's nodes."""

    nodes: List[MapNode]
    root_id: Optional[str] = None

    @model_validator(mode="after")
    def _check_graph(self) -> "NodesReplace":
        validate_graph(self.nodes, self.root_id)
        return self


# --- share links -----------------------------------------------------------


class ShareLinkCreate(BaseModel):
    permission: SharePermission = SharePermission.VIEW
    expires_in_seconds: Optional[int] = Field(default=None, ge=60, le=60 * 60 * 24 * 365)


class ShareLink(BaseModel):
    token: str
    map_id: str
    permission: SharePermission
    created_at: int
    expires_at: Optional[int] = None
    revoked: bool = False

    @property
    def is_active(self) -> bool:
        if self.revoked:
            return False
        return self.expires_at is None or self.expires_at > _now_ms()


# --- graph validation ------------------------------------------------------


def validate_graph(nodes: List[MapNode], root_id: Optional[str]) -> None:
    """
    Reject structurally broken graphs at the edge, so the database never holds a
    map the 3D view cannot traverse.

    Checks: duplicate ids, dangling parent/child references, a root that is not
    present, and parent/child cycles. Raises ValueError.
    """
    if not nodes:
        return

    ids = [n.id for n in nodes]
    seen = set()
    duplicates = set()
    for node_id in ids:
        if node_id in seen:
            duplicates.add(node_id)
        seen.add(node_id)
    if duplicates:
        raise ValueError(f"duplicate node ids: {sorted(duplicates)}")

    if root_id is not None and root_id not in seen:
        raise ValueError(f"root_id {root_id!r} is not among the nodes")

    for node in nodes:
        if node.parentId is not None and node.parentId not in seen:
            raise ValueError(f"node {node.id} references missing parent {node.parentId}")
        for child_id in node.childIds:
            if child_id not in seen:
                raise ValueError(f"node {node.id} references missing child {child_id}")

    _reject_cycles(nodes)


def _reject_cycles(nodes: List[MapNode]) -> None:
    """
    Walk parent pointers from every node. A mind map is a tree/DAG; a cycle makes
    depth computation and camera framing non-terminating.
    """
    parents = {n.id: n.parentId for n in nodes}

    for start in parents:
        seen = {start}
        current = parents[start]
        while current is not None:
            if current in seen:
                raise ValueError(f"parent cycle detected involving node {current!r}")
            seen.add(current)
            current = parents.get(current)
