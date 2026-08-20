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
from ..models import (
    MAX_RATING,
    MIN_RATING,
    Comment,
    CommentCreate,
    CommentUpdate,
    ImpressionBatch,
    Pulse,
    PulseCreate,
    PulseReport,
    PulseUpdate,
)
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
    three things: pulses from blocked authors disappear, `my_rating` reflects what
    you have already rated, and each pulse carries a prediction of how it will land
    for you.

    Strictly reverse-chronological, still. The predictions are shown to the reader,
    not used to order the feed: an order chosen by a model is a feed that decides
    what you see, which is the thing this is meant to be an alternative to.
    """
    _require_db(settings)
    viewer = principal.subject if principal else None
    pulses = await repo.list_feed(
        settings,
        viewer_subject=viewer,
        skip=skip,
        limit=limit,
        tag=tag,
    )
    return repo.apply_predictions(pulses, await repo.load_reader_model(settings, viewer))


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


@router.patch("/{pulse_id}", response_model=Pulse)
async def update_pulse(
    pulse_id: str,
    payload: PulseUpdate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Edit one of your own pulses.

    Ownership is part of the Cypher MATCH, so a pulse that is not yours is
    reported as not found rather than refused — the same reasoning as delete.

    Every edit stamps `edited_at`. A reader is entitled to know a post has
    changed since it was published, and a feed where posts can be silently
    rewritten after people have responded to them is a worse thing than one
    without editing at all.
    """
    _require_db(settings)

    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to change"
        )

    changes = dict(fields)
    if "media" in changes:
        # payload.media, not fields["media"].
        #
        # model_dump() RECURSES: a nested model comes back as a plain dict, so
        # calling model_dump_json() on it raised AttributeError and the whole edit
        # became a 500. It only happened when the post actually had a link —
        # media=None took the `else None` branch and worked — which made it look
        # intermittent rather than broken.
        #
        # payload keeps the parsed model, so this serialises the thing that knows
        # how, and the None case is unchanged.
        changes["media_json"] = (
            payload.media.model_dump_json() if payload.media else None
        )

    if not await repo.update_pulse(settings, principal.subject, pulse_id, changes):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")

    pulse = await repo.get_pulse(settings, pulse_id, principal.subject)
    if pulse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")
    return pulse


@router.put("/{pulse_id}/resonance", response_model=Pulse)
async def resonate(
    pulse_id: str,
    value: int = Query(default=0, ge=MIN_RATING, le=MAX_RATING),
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Record how much a pulse resonates with you, from -2 to +2.

    0 removes the rating rather than storing a neutral one, so moving the slider
    back to the middle is the same state as never having touched it. Idempotent in
    every direction: the underlying MERGE/SET means rating twice replaces rather
    than accumulates, and a double tap cannot produce two relationships.

    Returns the updated pulse — which carries your rating and your prediction, and
    no tally of anyone else's.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    # The write reports whether it changed anything, which is NOT the same as
    # whether it succeeded: clearing a rating that was never set changes nothing and
    # is still the right outcome. So the pulse is re-read either way, and only a
    # missing pulse is an error.
    await repo.set_resonance(settings, principal.subject, pulse_id, value)

    pulse = await repo.get_pulse(settings, pulse_id, principal.subject)
    if pulse is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pulse not found")

    # Re-read the model rather than the one from before the write: this rating is
    # part of the reader's history now, and the gauge it produces should reflect it.
    model = await repo.load_reader_model(settings, principal.subject)
    return repo.apply_predictions([pulse], model)[0]


# --- comments ---------------------------------------------------------------
#
# Flat, oldest first. See the note above CREATE_COMMENT in repository.py for why
# there is no threading.


async def _enforce_comment_rate_limit(settings: Settings, subject: str) -> None:
    """Refuse a comment once the caller has hit their hourly allowance.

    Separate from the posting limit and far more generous: a conversation is many
    short turns, and a limit tuned for broadcasting would throttle a discussion.
    """
    window_ms = 60 * 60 * 1000
    recent = await repo.count_recent_comments(settings, subject, window_ms)
    if recent >= settings.max_comments_per_hour:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Comment limit reached ({settings.max_comments_per_hour} per hour). "
                "Try again later."
            ),
            headers={"Retry-After": "3600"},
        )


@router.get("/{pulse_id}/comments", response_model=List[Comment])
async def list_comments(
    pulse_id: str,
    skip: int = 0,
    limit: int = 100,
    principal: Optional[Principal] = Depends(optional_user),
    settings: Settings = Depends(get_settings),
):
    """The conversation on a pulse, oldest first.

    Readable without signing in, like the feed itself. Signed in, three things
    change: comments from blocked authors disappear, my_rating carries what you
    said, and a prediction appears once your history can support one.
    """
    _require_db(settings)
    subject = principal.subject if principal else None

    comments = await repo.list_comments(
        settings, pulse_id, viewer_subject=subject, skip=skip, limit=limit
    )
    if subject:
        model = await repo.load_reader_model(settings, subject)
        comments = repo.apply_predictions(comments, model)
    return comments


@router.post(
    "/{pulse_id}/comments",
    response_model=Comment,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    pulse_id: str,
    payload: CommentCreate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    await _enforce_comment_rate_limit(settings, principal.subject)

    comment = await repo.create_comment(
        settings, principal.subject, pulse_id, payload.text
    )
    if comment is None:
        # The MATCH needs both the user and the pulse, so a missing pulse comes
        # back as no rows rather than as an error. 404 is the honest answer.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Post not found"
        )
    return comment


@router.patch("/comments/{comment_id}", response_model=Comment)
async def update_comment(
    comment_id: str,
    payload: CommentUpdate,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Edit your own comment.

    Ownership is part of the Cypher MATCH rather than a check afterwards, so there
    is no window where the wrong caller's edit is applied and then rejected. The
    edit stamps edited_at, which clients show: a conversation where replies are
    silently rewritten after people have answered them is worse than one with no
    editing at all.
    """
    _require_db(settings)
    comment = await repo.update_comment(
        settings, principal.subject, comment_id, payload.text
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found, or not yours",
        )
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    _require_db(settings)
    removed = await repo.delete_comment(settings, principal.subject, comment_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found, or not yours",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/comments/{comment_id}/resonance", response_model=Comment)
async def set_comment_resonance(
    comment_id: str,
    value: int = Query(default=0, ge=MIN_RATING, le=MAX_RATING),
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Rate a comment, -2..+2, 0 to clear.

    The same act as rating a pulse and stored on the same relationship type, so
    the reader model reads both in one traversal. What it TEACHES is different: a
    pulse carries tags, so rating one says something about a topic, while a comment
    has an author and no tags, so rating one says something about a person. The
    second is the thinner half of the model and the half that finding people you
    resonate with depends on.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)

    await repo.set_comment_resonance(
        settings, principal.subject, comment_id, value
    )

    # Re-read rather than returning the pre-write model: this rating is part of the
    # history the prediction is computed from, so the two would disagree.
    comment = await repo.get_comment(settings, comment_id, viewer_subject=principal.subject)
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )
    model = await repo.load_reader_model(settings, principal.subject)
    return repo.apply_predictions([comment], model)[0]


@router.post("/comments/{comment_id}/report", status_code=status.HTTP_202_ACCEPTED)
async def report_comment(
    comment_id: str,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Flag a comment. Counted once per reporter.

    202 rather than 200: the report is recorded, and what happens next is a human
    decision that has not happened yet. Saying "accepted" is true; saying "done"
    would not be.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    reports = await repo.report_comment(settings, principal.subject, comment_id)
    if reports is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )
    return {"status": "accepted"}


@router.post("/impressions", status_code=status.HTTP_204_NO_CONTENT)
async def record_impressions(
    payload: ImpressionBatch,
    principal: Principal = Depends(current_user),
    settings: Settings = Depends(get_settings),
):
    """Note that the caller has seen these pulses.

    The denominator for the resonance model: without it there is no way to tell a
    post that landed badly from one that was barely shown, and both look identical
    as "nobody rated it".

    204 and no body, because there is nothing to report back. Nothing read from
    this is ever shown to any user — not to the author of the post, and not as a
    per-viewer record to anyone. It exists so the model can weigh a rating against
    how many people had the chance to give one.
    """
    _require_db(settings)
    await repo.upsert_user(settings, principal.subject, principal.username, principal.email)
    await repo.record_impressions(settings, principal.subject, payload.pulse_ids)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
