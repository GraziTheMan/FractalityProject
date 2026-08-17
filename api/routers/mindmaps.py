"""
api/routers/mindmaps.py

Mind map CRUD and share links.

Authorization rules, in one place so they are auditable:

  * create / update / delete / share  -> owner only
  * read                              -> owner, OR the map is public,
                                         OR the caller presents a live share token
  * node writes                       -> owner, OR a live share token with
                                         permission=edit

Every route resolves permission through _require_read or _require_owner. Adding a
route without one of those is a security bug.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ..auth import Principal, current_user, optional_user
from ..models import (
    MindMap,
    MindMapCreate,
    MindMapSummary,
    MindMapUpdate,
    NodesReplace,
    SharePermission,
    ShareLink,
    ShareLinkCreate,
    Visibility,
)
from .. import repository as repo
from ..settings import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/maps", tags=["mindmaps"])


def _require_db(settings: Settings) -> None:
    if not settings.neo4j_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured",
        )


async def _load_meta_or_404(settings: Settings, map_id: str) -> dict:
    meta = await repo.get_map_meta(settings, map_id)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return meta


async def _require_owner(settings: Settings, map_id: str, principal: Principal) -> dict:
    meta = await _load_meta_or_404(settings, map_id)
    if meta.get("owner_subject") != principal.subject:
        # 404 rather than 403: revealing that a private map exists is itself a
        # small leak of someone else's data.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return meta


async def _require_read(
    settings: Settings,
    map_id: str,
    principal: Optional[Principal],
    share_token: Optional[str],
) -> dict:
    """Resolve read access, returning the map metadata."""
    meta = await _load_meta_or_404(settings, map_id)

    if principal is not None and meta.get("owner_subject") == principal.subject:
        return meta

    if meta.get("visibility") == Visibility.PUBLIC.value:
        return meta

    if share_token:
        link = await repo.resolve_share_link(settings, share_token)
        if link and link.map_id == map_id and link.is_active:
            return meta

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")


async def _require_edit(
    settings: Settings,
    map_id: str,
    principal: Optional[Principal],
    share_token: Optional[str],
) -> dict:
    meta = await _load_meta_or_404(settings, map_id)

    if principal is not None and meta.get("owner_subject") == principal.subject:
        return meta

    if share_token:
        link = await repo.resolve_share_link(settings, share_token)
        if (
            link
            and link.map_id == map_id
            and link.is_active
            and link.permission == SharePermission.EDIT
        ):
            return meta

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")


# --- collection ------------------------------------------------------------


@router.get("", response_model=List[MindMapSummary])
async def list_my_maps(
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Maps owned by the caller, most recently updated first."""
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    return await repo.list_maps_for_owner(settings, principal.subject, skip, limit)


@router.get("/public", response_model=List[MindMapSummary])
async def list_public_maps(
    settings: Settings = Depends(get_settings),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Publicly discoverable maps. No authentication required."""
    _require_db(settings)
    return await repo.list_public_maps(settings, skip, limit)


@router.post("", response_model=MindMap, status_code=status.HTTP_201_CREATED)
async def create_map(
    payload: MindMapCreate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Create a map, optionally with its initial node set."""
    _require_db(settings)

    if len(payload.nodes) > settings.max_nodes_per_map:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"A map may contain at most {settings.max_nodes_per_map} nodes",
        )

    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    existing = await repo.count_maps_for_owner(settings, principal.subject)
    if existing >= settings.max_maps_per_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Map limit reached ({settings.max_maps_per_user})",
        )

    summary = await repo.create_map(
        settings,
        principal.subject,
        payload.title,
        payload.description,
        payload.visibility,
        payload.root_id,
    )

    if payload.nodes:
        await repo.replace_nodes(settings, summary.id, payload.nodes, payload.root_id)

    created = await repo.get_map(settings, summary.id)
    if created is None:  # pragma: no cover - would mean the write vanished
        raise HTTPException(status_code=500, detail="Map creation failed")
    return created


# --- single map ------------------------------------------------------------


@router.get("/{map_id}", response_model=MindMap)
async def get_map(
    map_id: str,
    principal: Optional[Principal] = Depends(optional_user),
    settings: Settings = Depends(get_settings),
    share_token: Optional[str] = Query(None, alias="token"),
):
    """
    Fetch a map with all its nodes.

    Readable by the owner, by anyone if public, or by anyone holding a live
    share token.
    """
    _require_db(settings)
    await _require_read(settings, map_id, principal, share_token)

    mind_map = await repo.get_map(settings, map_id)
    if mind_map is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return mind_map


@router.patch("/{map_id}", response_model=MindMap)
async def update_map(
    map_id: str,
    payload: MindMapUpdate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Update a map's metadata. Owner only."""
    _require_db(settings)
    await _require_owner(settings, map_id, principal)

    await repo.update_map(
        settings, map_id, payload.title, payload.description, payload.visibility
    )

    updated = await repo.get_map(settings, map_id)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return updated


@router.delete("/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_map(
    map_id: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Delete a map, its nodes and its share links. Owner only."""
    _require_db(settings)
    await _require_owner(settings, map_id, principal)
    await repo.delete_map(settings, map_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- nodes -----------------------------------------------------------------


@router.put("/{map_id}/nodes", response_model=MindMap)
async def replace_nodes(
    map_id: str,
    payload: NodesReplace,
    principal: Optional[Principal] = Depends(optional_user),
    settings: Settings = Depends(get_settings),
    share_token: Optional[str] = Query(None, alias="token"),
):
    """
    Replace a map's entire node set.

    The client owns the map it is editing, so this is a full replacement rather
    than a diff — idempotent, and one round trip regardless of how much changed.
    """
    _require_db(settings)

    if len(payload.nodes) > settings.max_nodes_per_map:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"A map may contain at most {settings.max_nodes_per_map} nodes",
        )

    await _require_edit(settings, map_id, principal, share_token)
    await repo.replace_nodes(settings, map_id, payload.nodes, payload.root_id)

    updated = await repo.get_map(settings, map_id)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Map not found")
    return updated


# --- share links -----------------------------------------------------------


@router.post(
    "/{map_id}/shares", response_model=ShareLink, status_code=status.HTTP_201_CREATED
)
async def create_share_link(
    map_id: str,
    payload: ShareLinkCreate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Mint a share token. Owner only.

    Creating a link does not change the map's visibility: a private map stays
    invisible to everyone except holders of the token.
    """
    _require_db(settings)
    await _require_owner(settings, map_id, principal)
    return await repo.create_share_link(
        settings, map_id, payload.permission, payload.expires_in_seconds
    )


@router.get("/{map_id}/shares", response_model=List[ShareLink])
async def list_share_links(
    map_id: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """List a map's share links, including revoked ones. Owner only."""
    _require_db(settings)
    await _require_owner(settings, map_id, principal)
    return await repo.list_share_links(settings, map_id)


@router.delete(
    "/{map_id}/shares/{token}", status_code=status.HTTP_204_NO_CONTENT
)
async def revoke_share_link(
    map_id: str,
    token: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Revoke a share token. Owner only."""
    _require_db(settings)
    await _require_owner(settings, map_id, principal)

    if not await repo.revoke_share_link(settings, map_id, token):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found"
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
