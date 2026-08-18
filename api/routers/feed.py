"""
api/routers/feed.py

The newsfeed: pulses, resonance, and the moderation controls that have to exist
before a feed accepts content from strangers.

Authorization rules, in one place so they are auditable:

  * read the public feed  -> anyone, including anonymous
  * read your own pulses  -> yourself only (private pulses included)
  * post / delete         -> signed in; delete is scoped to your own pulses by
                             the Cypher MATCH, not by a check this code performs
  * resonate / report     -> signed in
  * block                 -> signed in, and cannot target yourself

Adding a route that writes without `current_user` is a security bug.

Moderation is not a later phase. A public feed with no report path, no block, no
rate limit and no way for an author to delete their own post is not shippable —
that is a legal position as much as a product one. What is deliberately NOT here:
image uploads (they need object storage and scanning) and an admin review queue
(it needs an admin role, which this project has no notion of yet). Both are
recorded in api/README.md.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ..auth import Principal, current_user, optional_user
from ..models import Pulse, PulseCreate, PulseReport
from .. import repository as repo
from ..settings import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pulses", tags=["feed"])


def _require_db(settings: Settings) -> None:
    if not settings.neo4j_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured",
        )


async def _enforce_post_rate_limit(settings: Settings, subject: str) -> None:
    """Refuse a post once the caller has hit their hourly allowance.

    Counted from stored pulses rather than an in-process counter: Render runs more
    than one instance, and a per-process counter would hand each of them a
    separate allowance.

    429 with Retry-After, so a client can behave well rather than guess.
    """
    window_ms = 60 * 60 * 1000
    recent = await repo.count_recent_pulses(settings, subject, window_ms)
    if recent >= settings.max_pulses_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Posting limit reached ({settings.max_pulses_per_hour} per hour). "
                "Try again later."
            ),
            headers={"Retry-After": "3600"},
        )


@router.get("", response_model=List[Pulse])
async def list_feed(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    tag: Optional[str] = Query(default=None, max_length=40),
    principal: Optional[Principal] = Depends(optional_user),
    settings: Settings = Depends(get_settings),
):
    """The public feed, newest first.

    Open to anonymous callers by design — the feed is the part of this app a
    visitor should be able to read before deciding to sign up. Signing in adds
    two things: pulses from blocked authors disappear, and `resonated` reflects
    what you have already resonated with.
    """
    _require_db(settings)
    return await repo.list_feed(
        settings,
        viewer_subject=principal.subject if principal else None,
        skip=skip,
        limit=limit,
        tag=tag,
    )


@router.get("/mine", response_model=List[Pulse])
async def list_my_pulses(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Everything the caller posted, private pulses included."""
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    return await repo.list_own_pulses(
        settings, principal.subject, skip=skip, limit=limit
    )


@router.post("", response_model=Pulse, status_code=status.HTTP_201_CREATED)
async def create_pulse(
    payload: PulseCreate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    _require_db(settings)

    # The author needs a local User node to hang POSTED off. Doing it here rather
    # than at sign-in means a user created before this endpoint existed can still
    # post without re-authenticating.
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    await _enforce_post_rate_limit(settings, principal.subject)

    pulse = await repo.create_pulse(settings, principal.subject, payload)
    if pulse is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the pulse",
        )
    return pulse


@router.get("/{pulse_id}", response_model=Pulse)
async def get_pulse(
    pulse_id: str,
    principal: Optional[Principal] = Depends(optional_user),
    settings: Settings = Depends(get_settings),
):
    _require_db(settings)
    viewer = principal.subject if principal else None
    pulse = await repo.get_pulse(settings, pulse_id, viewer)
    if pulse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")

    # A private pulse is invisible to everyone but its author, and 404 rather
    # than 403: confirming that a private pulse exists is itself a small leak.
    if pulse.visibility != "public" and not pulse.own:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    return pulse


@router.delete("/{pulse_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pulse(
    pulse_id: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Delete one of your own pulses.

    Ownership is part of the Cypher MATCH, so there is no gap between checking
    and deleting, and no way to reach another author's pulse through this route.
    A pulse that is not yours is reported as not found.
    """
    _require_db(settings)
    if not await repo.delete_pulse(settings, principal.subject, pulse_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{pulse_id}/resonance", response_model=Pulse)
async def resonate(
    pulse_id: str,
    on: bool = Query(default=True),
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Resonate with a pulse, or take it back.

    Idempotent in both directions: the underlying MERGE/DELETE means a double tap
    cannot produce two relationships or fail on the second removal. Returns the
    updated pulse so the client does not have to guess the new count.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    if not await repo.set_resonance(settings, principal.subject, pulse_id, on):
        # Either the pulse is gone, or resonance was already in the requested
        # state. Re-read to tell the two apart.
        pulse = await repo.get_pulse(settings, pulse_id, principal.subject)
        if pulse is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found"
            )
        return pulse

    pulse = await repo.get_pulse(settings, pulse_id, principal.subject)
    if pulse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    return pulse


@router.post("/{pulse_id}/report", status_code=status.HTTP_202_ACCEPTED)
async def report_pulse(
    pulse_id: str,
    payload: PulseReport,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Report a pulse.

    202, not 200: the report is recorded, and a human decision has not happened
    yet. The response deliberately does not say what will follow, because nothing
    automatic does — there is no admin queue yet, and pretending otherwise would
    be worse than saying so.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    total = await repo.report_pulse(settings, principal.subject, pulse_id, payload.reason)
    if total is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")

    # Logged at warning level so reports are visible in the service logs, which
    # is the only review surface that exists today.
    logger.warning(
        "Pulse %s reported (%s); %d report(s) total", pulse_id, payload.reason, total
    )
    return {"reported": True, "reports": total}


@router.put("/authors/{author_id}/block", status_code=status.HTTP_200_OK)
async def block_author(
    author_id: str,
    blocked: bool = Query(default=True),
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Block or unblock an author, hiding their pulses from your feed.

    Blocking is the control a reader has that does not depend on anyone else
    acting, which is what makes it the important half of moderation for a small
    service. Self-blocking is refused; it would silently empty your own feed.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    if not await repo.set_block(settings, principal.subject, author_id, blocked):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Author not found, or that is you",
        )
    return {"blocked": blocked, "author_id": author_id}


@router.get("/authors/blocked", response_model=List[dict])
async def list_blocked(
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Who you have blocked — a block you cannot review is a block you cannot undo."""
    _require_db(settings)
    return await repo.list_blocked(settings, principal.subject)
