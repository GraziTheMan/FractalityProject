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


# A node's markdown page. Generous for a page of prose, and small enough that a
# map cannot become unservable one node at a time: the cap is per node, and a map
# on the free tier may hold thousands of them.
MAX_NODE_CONTENT = 64_000


class NodeMetadata(BaseModel):
    label: str = ""
    type: str = "default"
    tags: List[str] = Field(default_factory=list)
    description: str = ""

    # The node's own page, as markdown.
    #
    # Distinct from `description`, which is a one-line summary shown in lists.
    # This is the body: the thing the map is actually for, in the spirit of a
    # linked notes app where every concept has a page behind it.
    content: str = Field(default="", max_length=MAX_NODE_CONTENT)

    # Callers may attach arbitrary extra metadata, as the frontend allows
    model_config = {"extra": "allow"}


class MapNode(BaseModel):
    """One node of a mind map, matching FractalNode.toJSON()."""

    id: str

    #: The containing scale. Exactly one, so the hierarchy stays fileable.
    parentId: Optional[str] = None
    childIds: List[str] = Field(default_factory=list)

    #: Contributing streams: what flowed together to make this node.
    #:
    #: A different relation from parentId, not a second copy of it. "Consciousness" is
    #: INSIDE The Fractiverse (one containing scale, one home in the outline) and
    #: EMERGES FROM four axioms (four contributors). Collapsing the two loses whichever
    #: half you collapse: with only parentId you cannot say what converged, and with
    #: only a parent list you cannot say where the node lives.
    #:
    #: This is what makes the graph a DAG rather than a tree, and therefore what makes
    #: cycle checking and depth computation harder — see validate_graph.
    emergesFrom: List[str] = Field(default_factory=list)

    #: Nodes this one cycles back to. The one relation that may be circular.
    #:
    #: Not a parent relation, deliberately. Axiom II describes "a recurrent cycle" and
    #: calls death "the mandatory refresh rate of the information field", so terminal
    #: entropy returning to a new beginning is central to the framework — but tiers are
    #: 1 + max(parents), which requires an acyclic graph.
    #:
    #: The resolution is that this edge bears no tier: it is excluded from the depth
    #: computation and from the cycle check, so it can state "this returns to that"
    #: without claiming one derives from the other.
    resetsTo: List[str] = Field(default_factory=list)

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


# --- profile ---------------------------------------------------------------
#
# Identity lives with Clerk; this is the local, user-editable projection of it.
#
# It exists because Clerk's session JWT carries no name. The token has `sub`,
# `iss`, `exp` and little else unless a custom JWT template is configured, so
# `Principal.username` is None for a normal Clerk setup — which is why every feed
# post was attributed to "Anonymous". The display name has to be stored somewhere
# this API can read it.


class Profile(BaseModel):
    id: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    #: From the auth provider, if it happened to supply one. Read-only here.
    username: Optional[str] = None
    email: Optional[str] = None

    #: The map to open on sign-in, or None to open the most recently edited one.
    #:
    #: Stored on the profile rather than in the browser because it is a statement about
    #: the person, not the device: someone with one map they live in wants it on every
    #: machine they sign in from, which was the whole point of asking for it.
    default_map_id: Optional[str] = None

    #: A few lines the person writes about themselves.
    #:
    #: Ours rather than Clerk's user metadata, because other people have to be able to
    #: read it. Clerk knows who someone is; this is what they say about themselves, and
    #: it belongs with the maps and pulses it will appear beside.
    bio: Optional[str] = None


#: Long enough to say something, short enough not to be an essay in a side panel.
MAX_BIO = 600


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=60)
    avatar_url: Optional[str] = Field(default=None, max_length=2_000)
    default_map_id: Optional[str] = Field(default=None, max_length=64)
    bio: Optional[str] = Field(default=None, max_length=MAX_BIO)

    #: username is deliberately NOT here. It comes from the auth provider's token and
    #: is written by upsert_user, so accepting one over the API would let a caller
    #: claim an identity the token does not support — and identities are meant to be
    #: unique and stable now that the app is becoming social.

    @field_validator("display_name", mode="before")
    @classmethod
    def _clean_name(cls, value: Any) -> Any:
        """Trim before the length check, and treat blank as 'clear it'."""
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None

    @field_validator("bio", mode="before")
    @classmethod
    def _clean_bio(cls, value: Any) -> Any:
        """Trim the ends but keep the shape.

        Not the same treatment as display_name: a bio has paragraphs, so internal
        newlines are content. Only the leading and trailing whitespace goes, and an
        entirely blank bio means 'clear it'.
        """
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        return cleaned or None

    @field_validator("avatar_url", mode="before")
    @classmethod
    def _clean_avatar(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        cleaned = value.strip()
        if not cleaned:
            return None
        # http/https only, same reasoning as PulseMedia: this URL ends up in an
        # <img src> or an href, and javascript:/data: there is a stored XSS.
        lowered = cleaned.lower()
        if not (lowered.startswith("http://") or lowered.startswith("https://")):
            raise ValueError("avatar url must be http or https")
        return cleaned


# --- feed / pulses ---------------------------------------------------------
#
# A "pulse" is a feed post. The field names are set by what
# ResonanceFeedController._createPulseElement() already renders, so the frontend
# needed no reshaping to read real data.
#
# Media is accepted but not yet servable: images need object storage with
# presigned uploads (Cloudflare R2 is the plan — see api/README.md), and image
# bytes must never be proxied through this API or stored in Neo4j. Until that
# exists, `media` only ever carries a link preview, and MEDIA_KINDS is the
# whitelist that keeps a client from inventing something else.

MEDIA_KINDS = {"link"}

#: Cap on a pulse body. Long enough for a real thought, short enough that the
#: feed stays scannable and one post cannot dominate a page of results.
# The resonance scale. Five notches, 0 in the middle, so "this does not resonate
# with me" is expressible without a separate button and without being a verdict on
# the author. Symmetric on purpose: an asymmetric scale (say -1..+3) quietly tells
# people which answer is expected.
MIN_RATING = -2
MAX_RATING = 2

MAX_PULSE_TEXT = 2_000
MAX_PULSE_TITLE = 200
MAX_PULSE_TAGS = 8
MAX_TAG_LENGTH = 40


class PulseAuthor(BaseModel):
    """Denormalised author, so rendering a feed needs no second lookup."""

    id: str
    name: str
    avatar: Optional[str] = None


class PulseMedia(BaseModel):
    kind: str = Field(default="link")
    url: str
    title: Optional[str] = None
    description: Optional[str] = None

    @field_validator("kind")
    @classmethod
    def _known_kind(cls, value: str) -> str:
        if value not in MEDIA_KINDS:
            raise ValueError(f"media kind must be one of {sorted(MEDIA_KINDS)}")
        return value

    @field_validator("url")
    @classmethod
    def _safe_url(cls, value: str) -> str:
        # http/https only. A javascript: or data: URL here would become a stored
        # XSS the moment anything rendered it as a link, and the browser is not
        # the only consumer of this API.
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("media url is required")
        lowered = cleaned.lower()
        if not (lowered.startswith("http://") or lowered.startswith("https://")):
            raise ValueError("media url must be http or https")
        if len(cleaned) > 2_000:
            raise ValueError("media url is too long")
        return cleaned


class PulseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=MAX_PULSE_TITLE)
    preview: str = Field(default="", max_length=MAX_PULSE_TEXT)
    tags: List[str] = Field(default_factory=list)
    media: Optional[PulseMedia] = None
    visibility: Visibility = Visibility.PUBLIC

    @field_validator("title", "preview", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        """Trim before the length constraints are applied.

        mode="before" is the whole point: a plain validator runs AFTER
        min_length, so a title of "   " satisfied min_length=1 as three
        characters and was then stripped to empty. Trimming first means the
        constraint sees what will actually be stored.
        """
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, value: List[str]) -> List[str]:
        """Normalise tags to lowercase, deduplicated, and bounded.

        Tags are used as filters, so "Fractal", "fractal" and "  fractal  "
        being three different tags would quietly fragment the feed.
        """
        seen: List[str] = []
        for raw in value:
            tag = str(raw).strip().lstrip("#").lower()
            if not tag:
                continue
            if len(tag) > MAX_TAG_LENGTH:
                raise ValueError(f"tag longer than {MAX_TAG_LENGTH} characters")
            if tag not in seen:
                seen.append(tag)
        if len(seen) > MAX_PULSE_TAGS:
            raise ValueError(f"at most {MAX_PULSE_TAGS} tags")
        return seen

    @field_validator("visibility")
    @classmethod
    def _no_unlisted(cls, value: Visibility) -> Visibility:
        # Unlisted exists for share-token maps. A pulse is either in the public
        # feed or it is private to its author; a third state with no way to share
        # it would just be a private pulse that looks public.
        if value == Visibility.UNLISTED:
            raise ValueError("pulses are public or private")
        return value


class Pulse(BaseModel):
    """A feed post as returned to clients."""

    id: str
    title: str
    preview: str
    author: PulseAuthor
    tags: List[str] = Field(default_factory=list)
    media: Optional[PulseMedia] = None
    visibility: Visibility = Visibility.PUBLIC

    #: Epoch milliseconds, matching the frontend's "time ago" rendering.
    timestamp: int

    #: Set when the post has been edited since publishing. Exposed so a reader can
    #: see that it changed — a feed where posts are silently rewritten after people
    #: have responded to them is worse than one without editing at all.
    edited_at: Optional[int] = None

    #: The caller's own rating, -2..+2, 0 meaning they have not moved the slider.
    #:
    #: This is the ONLY resonance figure on the wire. There is deliberately no
    #: count of who rated a post and no aggregate of how they rated it — not for
    #: viewers and not for the author either. A visible tally is the thing people
    #: get addicted to, and it turns writing into competing. The ratings are
    #: collected to learn what resonates with each reader, which is a private
    #: question about the reader, not a public score for the post.
    my_rating: int = Field(default=0, ge=MIN_RATING, le=MAX_RATING)

    #: What this reader is predicted to make of the post, -1..+1, or None when
    #: there is not enough of their history to say anything honest. Computed from
    #: the caller's OWN past ratings, so it describes them and not the post's
    #: popularity.
    predicted: Optional[float] = None

    #: 0..1, how much history backs `predicted`. The UI uses it to decide how
    #: firmly to draw the gauge; at 0 it draws nothing at all.
    prediction_confidence: float = 0.0

    #: True when the caller is the author, which is what the UI uses to decide
    #: whether to offer a delete.
    own: bool = False


class PulseUpdate(BaseModel):
    """Partial edit of a pulse. Omitted fields are left alone.

    Reuses PulseCreate's validators by construction rather than by copying them:
    a link that would be refused on the way in must not become acceptable on an
    edit.
    """

    title: Optional[str] = Field(default=None, min_length=1, max_length=MAX_PULSE_TITLE)
    preview: Optional[str] = Field(default=None, max_length=MAX_PULSE_TEXT)
    tags: Optional[List[str]] = None
    media: Optional[PulseMedia] = None
    visibility: Optional[Visibility] = None

    _strip = field_validator("title", "preview", mode="before")(
        PulseCreate._strip.__func__
    )
    _clean_tags = field_validator("tags")(PulseCreate._clean_tags.__func__)
    _no_unlisted = field_validator("visibility")(PulseCreate._no_unlisted.__func__)


class ImpressionBatch(BaseModel):
    """Pulses the caller has seen, sent in one batch.

    Batched rather than one request per post because a feed page produces a
    screenful of impressions at once, and thirty requests to say "I scrolled" is
    absurd. Capped so a client cannot use it to write unbounded amounts.
    """

    pulse_ids: List[str] = Field(default_factory=list, max_length=200)

    @field_validator("pulse_ids")
    @classmethod
    def _clean(cls, v: List[str]) -> List[str]:
        # Deduplicated here as well as by the MERGE in Cypher. The MERGE is what
        # makes it correct; this is what keeps a client's repeated ids from using up
        # the cap and silently dropping real ones.
        seen: List[str] = []
        for pulse_id in v:
            trimmed = (pulse_id or "").strip()
            if trimmed and trimmed not in seen:
                seen.append(trimmed)
        return seen


class PulseReport(BaseModel):
    """A report against a pulse.

    Free-text reasons are deliberately not accepted: a report is a signal for a
    human to look, and an open text field on an unmoderated endpoint is itself a
    channel for abuse.
    """

    reason: str = Field(default="other")

    @field_validator("reason")
    @classmethod
    def _known_reason(cls, value: str) -> str:
        allowed = {"spam", "abuse", "sexual", "violence", "illegal", "other"}
        cleaned = value.strip().lower()
        if cleaned not in allowed:
            raise ValueError(f"reason must be one of {sorted(allowed)}")
        return cleaned


# --- graph validation ------------------------------------------------------


def validate_graph(nodes: List[MapNode], root_id: Optional[str]) -> None:
    """
    Reject structurally broken graphs at the edge, so the database never holds a
    map the 3D view cannot traverse.

    Checks: duplicate ids, dangling parent/child/emergesFrom references, a root that
    is not present, cycles across BOTH parent relations, and the tier rule. Raises
    ValueError.
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
        for source_id in node.emergesFrom:
            if source_id not in seen:
                raise ValueError(
                    f"node {node.id} emerges from missing node {source_id}"
                )
            if source_id == node.id:
                raise ValueError(f"node {node.id} emerges from itself")
        # Dangling and self-reference are still errors here; a CYCLE is not, and must
        # not be checked for. _reject_cycles and _check_tiers both ignore this relation
        # on purpose — see MapNode.resetsTo.
        for target_id in node.resetsTo:
            if target_id not in seen:
                raise ValueError(
                    f"node {node.id} resets to missing node {target_id}"
                )
            if target_id == node.id:
                raise ValueError(f"node {node.id} resets to itself")

    _reject_cycles(nodes)
    _check_tiers(nodes)


def _all_parents(node: MapNode) -> List[str]:
    """Every id a node descends from, by either relation."""
    parents = [] if node.parentId is None else [node.parentId]
    return parents + [pid for pid in node.emergesFrom if pid != node.parentId]


def _check_tiers(nodes: List[MapNode]) -> None:
    """Every parent must sit strictly above its child.

    tier(node) == 1 + max(tier of all parents), which the client computes. Enforced
    here because it is what makes the visualisation mean anything: emergence must never
    be drawn above something that feeds into it. A client that computed depth by
    walking parentId alone would place a node level with its own contributors, and the
    cone would show convergence flowing upward.

    Only the ordering is checked, not the exact value. A map arriving from an older
    client can have depths that are internally consistent but not yet maximal, and
    refusing it would make this an upgrade barrier rather than a correctness check.
    """
    depth_of = {n.id: n.depth for n in nodes}

    for node in nodes:
        for parent_id in _all_parents(node):
            parent_depth = depth_of.get(parent_id)
            if parent_depth is None:
                continue
            if parent_depth >= node.depth:
                raise ValueError(
                    f"node {node.id} is at tier {node.depth} but its parent "
                    f"{parent_id} is at tier {parent_depth}; a parent must be above "
                    "its child"
                )


def _reject_cycles(nodes: List[MapNode]) -> None:
    """
    Reject a cycle in EITHER parent relation, or any mixture of the two.

    A cycle makes depth computation and camera framing non-terminating.

    The previous version followed the single `parentId` chain, which was sufficient
    when that was the only parent a node could have. With convergent emergence a loop
    can leave through an emergesFrom edge and return through containment — invisible to
    a walk that only knows about one of them, and the whole reason this is now a
    graph search rather than a chain walk.

    Iterative depth-first with an explicit colour marking, rather than recursion: a
    deep chain is entirely possible in a user-built map and this must not depend on
    stack depth.
    """
    parents = {n.id: _all_parents(n) for n in nodes}

    WHITE, GREY, BLACK = 0, 1, 2
    colour = {node_id: WHITE for node_id in parents}

    for start in parents:
        if colour[start] != WHITE:
            continue

        # (id, iterator over its parents). GREY means "on the current path", so
        # meeting a GREY node is a cycle; BLACK means "fully explored, no cycle here".
        stack = [(start, iter(parents[start]))]
        colour[start] = GREY

        while stack:
            node_id, remaining = stack[-1]
            advanced = False
            for parent_id in remaining:
                if parent_id not in colour:
                    continue          # dangling, already reported by the caller
                if colour[parent_id] == GREY:
                    raise ValueError(
                        f"parent cycle detected involving node {parent_id!r}"
                    )
                if colour[parent_id] == WHITE:
                    colour[parent_id] = GREY
                    stack.append((parent_id, iter(parents[parent_id])))
                    advanced = True
                    break
            if not advanced:
                colour[node_id] = BLACK
                stack.pop()
