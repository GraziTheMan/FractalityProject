"""
api/routers/me.py

The caller's own profile.

This exists because Clerk's session JWT carries no name. A default Clerk token
has `sub`, `iss`, `exp` and little else — no `name`, no `username` — so
`Principal.username` is None for a normal setup, and every feed post was
attributed to "Anonymous". The display name has to live somewhere this API can
read it, which means storing it on the User node.

The frontend knows the name (Clerk's client exposes `user.fullName`), so it
seeds this on sign-in; the account panel then lets the user override it. That
ordering matters: a name the user chose must not be overwritten by the provider's
on the next sign-in.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import Principal, current_user
from ..models import Profile, ProfileUpdate
from .. import repository as repo
from ..settings import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/me", tags=["profile"])


def _require_db(settings: Settings) -> None:
    if not settings.neo4j_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured",
        )


@router.get("", response_model=Profile)
async def read_me(
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """The caller's profile, creating the local User row if this is a first visit."""
    _require_db(settings)

    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    profile = await repo.get_profile(settings, principal.subject)
    if profile is None:
        # upsert_user just ran, so this means the write did not land.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load your profile",
        )
    return profile


@router.patch("", response_model=Profile)
async def update_me(
    payload: ProfileUpdate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Change display name or avatar.

    PATCH, and the fields are genuinely optional: omitting one leaves it alone,
    while sending it as null clears it. Without that distinction an avatar could
    be set but never removed.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    fields = payload.model_dump(exclude_unset=True)
    profile = await repo.update_profile(
        settings,
        principal.subject,
        display_name=fields.get("display_name"),
        avatar_url=fields.get("avatar_url"),
        set_name="display_name" in fields,
        set_avatar="avatar_url" in fields,
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile
